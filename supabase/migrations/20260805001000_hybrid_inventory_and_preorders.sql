-- Zoryvena Perfumes
-- Modelo híbrido: estoque físico para pronta entrega e venda sob encomenda.

alter table public.products
  add column if not exists preorder_enabled boolean not null default false,
  add column if not exists preorder_limit integer not null default 1;

alter table public.products drop constraint if exists products_preorder_limit_check;
alter table public.products add constraint products_preorder_limit_check
  check (preorder_limit between 0 and 100 and (not preorder_enabled or preorder_limit >= 1));

alter table public.orders
  add column if not exists contains_preorder boolean not null default false,
  add column if not exists contains_ready_stock boolean not null default false;

alter table public.order_items add column if not exists ready_quantity integer;
alter table public.order_items add column if not exists preorder_quantity integer;

update public.order_items
set ready_quantity = coalesce(ready_quantity, quantity),
    preorder_quantity = coalesce(preorder_quantity, 0)
where ready_quantity is null or preorder_quantity is null;

alter table public.order_items alter column ready_quantity set default 0;
alter table public.order_items alter column ready_quantity set not null;
alter table public.order_items alter column preorder_quantity set default 0;
alter table public.order_items alter column preorder_quantity set not null;

alter table public.order_items drop constraint if exists order_items_supply_quantities_check;
alter table public.order_items add constraint order_items_supply_quantities_check
  check (ready_quantity >= 0 and preorder_quantity >= 0 and ready_quantity + preorder_quantity = quantity);

alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check
check (fulfillment_status in (
  'Aguardando pagamento',
  'Novo pedido',
  'Aguardando pedido ao fornecedor',
  'Pedido realizado ao fornecedor',
  'Aguardando chegada do fornecedor',
  'Em separação',
  'Pronto para retirada',
  'Enviado',
  'Entregue',
  'Cancelado'
));

create or replace function private.set_product_sales_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.status := case
    when not new.active then 'Inativo'
    when coalesce(new.price, 0) <= 0 then 'Preço a confirmar'
    when new.stock > 0 and new.preorder_enabled then 'Pronta entrega e sob encomenda'
    when new.stock > 0 then 'Pronta entrega'
    when new.preorder_enabled then 'Sob encomenda'
    else 'Indisponível'
  end;
  return new;
end;
$function$;

revoke all on function private.set_product_sales_status() from public, anon, authenticated;

drop trigger if exists products_set_sales_status on public.products;
create trigger products_set_sales_status
before insert or update of active, price, stock, preorder_enabled, preorder_limit
on public.products
for each row execute function private.set_product_sales_status();

update public.products
set preorder_enabled = (supplier_availability = 'Disponível no fornecedor'),
    preorder_limit = case
      when supplier_availability = 'Disponível no fornecedor' then greatest(coalesce(preorder_limit, 1), 1)
      else 0
    end,
    active = case when supplier_availability = 'Disponível no fornecedor' or stock > 0 then true else false end,
    updated_at = now();

drop function if exists public.get_storefront_products();
create function public.get_storefront_products()
returns table(
  id text, sku text, rank integer, badge text, priority text, name text, brand text,
  volume text, gender text, family text, occasion text, climate text, price numeric,
  pix_price numeric, stock integer, status text, fixation text, projection text,
  inspired_by text, description text, top_notes text, heart_notes text, base_notes text,
  visual text, image text, active boolean, preorder_enabled boolean, preorder_limit integer,
  supplier_availability text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id, p.sku, p.rank, p.badge, p.priority, p.name, p.brand, p.volume,
    p.gender, p.family, p.occasion, p.climate, p.price, p.pix_price,
    greatest(p.stock, 0), p.status, p.fixation, p.projection, p.inspired_by,
    p.description, p.top_notes, p.heart_notes, p.base_notes, p.visual,
    p.image, p.active, p.preorder_enabled, p.preorder_limit,
    p.supplier_availability, p.updated_at
  from public.products p
  where p.active = true
  order by p.rank asc, p.id asc;
$function$;

revoke all on function public.get_storefront_products() from public;
grant execute on function public.get_storefront_products() to anon, authenticated;

create or replace function public.admin_update_product(p_product_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_field text;
  v_image text;
  v_number numeric;
  v_integer numeric;
  v_stock integer;
  v_minimum_stock integer;
  v_preorder_limit integer;
  v_active boolean;
  v_preorder_enabled boolean;
  v_allowed_keys constant text[] := array[
    'cost','price','pix_price','stock','minimum_stock','image','active',
    'preorder_enabled','preorder_limit'
  ];
begin
  perform private.assert_admin_mfa();

  if p_product_id is null or p_product_id !~ '^[a-zA-Z0-9-]{1,120}$' then
    raise exception 'Produto inválido.';
  end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Alterações do produto inválidas.'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) key where key <> all(v_allowed_keys)) then
    raise exception 'Campo de produto não autorizado.';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  foreach v_field in array array['cost','price','pix_price'] loop
    if p_patch ? v_field and jsonb_typeof(p_patch->v_field) not in ('number','null') then
      raise exception 'Valor monetário inválido.';
    end if;
    if p_patch ? v_field and jsonb_typeof(p_patch->v_field) = 'number' then
      v_number := (p_patch->>v_field)::numeric;
      if v_number < 0 or v_number > 100000 then raise exception 'Valor monetário fora do limite.'; end if;
    end if;
  end loop;

  foreach v_field in array array['stock','minimum_stock','preorder_limit'] loop
    if not (p_patch ? v_field) or jsonb_typeof(p_patch->v_field) <> 'number' then
      raise exception 'Estoque, estoque mínimo e limite de encomenda são obrigatórios.';
    end if;
    v_integer := (p_patch->>v_field)::numeric;
    if v_integer <> trunc(v_integer) or v_integer < 0 or v_integer > 100000 then
      raise exception 'Quantidade inválida.';
    end if;
  end loop;

  if not (p_patch ? 'active') or jsonb_typeof(p_patch->'active') <> 'boolean' then
    raise exception 'Situação do produto inválida.';
  end if;
  if not (p_patch ? 'preorder_enabled') or jsonb_typeof(p_patch->'preorder_enabled') <> 'boolean' then
    raise exception 'Situação da encomenda inválida.';
  end if;

  v_stock := (p_patch->>'stock')::integer;
  v_minimum_stock := (p_patch->>'minimum_stock')::integer;
  v_preorder_limit := (p_patch->>'preorder_limit')::integer;
  v_active := (p_patch->>'active')::boolean;
  v_preorder_enabled := (p_patch->>'preorder_enabled')::boolean;

  if v_preorder_enabled and v_preorder_limit < 1 then
    raise exception 'Informe pelo menos 1 unidade como limite de encomenda.';
  end if;

  v_image := nullif(trim(p_patch->>'image'), '');
  if v_image is not null then
    if length(v_image) > 600 then raise exception 'URL da imagem muito longa.'; end if;
    if v_image ~ '^https://ajyultndtauabfufrmfr[.]supabase[.]co/storage/v1/object/public/product-images/' then
      if v_image !~ ('^https://ajyultndtauabfufrmfr[.]supabase[.]co/storage/v1/object/public/product-images/' || p_product_id || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$') then
        raise exception 'Caminho da imagem não autorizado.';
      end if;
    elsif v_image !~ '^/?assets/[A-Za-z0-9_./-]+[.](webp|png|jpg|jpeg)$' or position('..' in v_image) > 0 then
      raise exception 'Use apenas uma imagem enviada pelo painel ou um arquivo local autorizado.';
    end if;
  end if;

  update public.products
     set cost = case when p_patch ? 'cost' then (p_patch->>'cost')::numeric else cost end,
         price = case when p_patch ? 'price' then (p_patch->>'price')::numeric else price end,
         pix_price = case when p_patch ? 'pix_price' then (p_patch->>'pix_price')::numeric else pix_price end,
         stock = v_stock,
         minimum_stock = v_minimum_stock,
         image = v_image,
         active = v_active,
         preorder_enabled = v_preorder_enabled,
         preorder_limit = case when v_preorder_enabled then v_preorder_limit else 0 end,
         updated_at = now()
   where id = p_product_id
   returning * into v_product;

  return jsonb_build_object(
    'ok', true, 'id', v_product.id, 'status', v_product.status,
    'stock', v_product.stock, 'preorderEnabled', v_product.preorder_enabled,
    'preorderLimit', v_product.preorder_limit
  );
end;
$function$;

create or replace function public.create_store_order(
  p_customer jsonb,
  p_items jsonb,
  p_notes text default null,
  p_payment_method text default 'card'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_name text;
  v_whatsapp text;
  v_email text;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id text;
  v_quantity integer;
  v_quantity_text text;
  v_total_quantity integer := 0;
  v_unit_price numeric(12,2);
  v_payment_method text;
  v_delivery text;
  v_ready_quantity integer;
  v_preorder_quantity integer;
  v_contains_preorder boolean := false;
  v_contains_ready_stock boolean := false;
begin
  if jsonb_typeof(p_customer) <> 'object' then raise exception 'Dados do cliente inválidos.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'O pedido precisa ter entre 1 e 20 itens.';
  end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, '')));
  if v_payment_method not in ('pix','card') then raise exception 'Forma de pagamento inválida.'; end if;

  v_delivery := lower(trim(coalesce(p_customer->>'delivery', '')));
  if v_delivery <> 'pickup' then raise exception 'A entrega deve ser cotada antes da criação do pagamento.'; end if;
  if coalesce(p_customer->>'acceptedPolicies', '') <> 'yes' then raise exception 'O aceite das políticas é obrigatório.'; end if;

  v_name := left(trim(regexp_replace(coalesce(p_customer->>'name',''), '[[:cntrl:]]+', ' ', 'g')), 120);
  v_whatsapp := regexp_replace(coalesce(p_customer->>'whatsapp',''), '[^0-9]', '', 'g');
  v_email := left(lower(trim(coalesce(p_customer->>'email',''))), 150);
  if length(v_name) < 2 then raise exception 'Informe o nome do cliente.'; end if;
  if length(v_whatsapp) < 10 or length(v_whatsapp) > 13 then raise exception 'WhatsApp inválido.'; end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe um e-mail válido.'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Item inválido.'; end if;
    v_product_id := trim(coalesce(v_item->>'id',''));
    v_quantity_text := trim(coalesce(v_item->>'quantity',''));
    if v_product_id = '' or length(v_product_id) > 120 then raise exception 'Produto inválido.'; end if;
    if v_quantity_text !~ '^[0-9]+$' then raise exception 'Quantidade inválida.'; end if;
    v_quantity := v_quantity_text::integer;
    if v_quantity < 1 or v_quantity > 10 then raise exception 'Quantidade fora do limite.'; end if;
    v_total_quantity := v_total_quantity + v_quantity;
  end loop;
  if v_total_quantity > 20 then raise exception 'O pedido excede o limite de 20 unidades.'; end if;

  for v_product_id, v_quantity in
    select item->>'id', sum((item->>'quantity')::integer)::integer
    from jsonb_array_elements(p_items) item
    group by item->>'id'
    order by item->>'id'
  loop
    if v_quantity > 10 then raise exception 'Quantidade total fora do limite para o produto %.', v_product_id; end if;

    select * into v_product
    from public.products
    where id = v_product_id and active = true and price is not null and price > 0
    for update;
    if not found then raise exception 'Produto indisponível: %', v_product_id; end if;

    v_ready_quantity := least(greatest(v_product.stock, 0), v_quantity);
    v_preorder_quantity := v_quantity - v_ready_quantity;
    if v_preorder_quantity > 0 then
      if not v_product.preorder_enabled or v_preorder_quantity > v_product.preorder_limit then
        raise exception 'Produto indisponível na quantidade solicitada: %', v_product_id;
      end if;
      v_contains_preorder := true;
    end if;
    if v_ready_quantity > 0 then v_contains_ready_stock := true; end if;

    v_unit_price := case
      when v_payment_method = 'pix' and v_product.pix_price is not null and v_product.pix_price > 0 then v_product.pix_price
      else v_product.price
    end;
    if v_unit_price <= 0 or v_unit_price > 100000 then raise exception 'Preço inválido para %.', v_product_id; end if;
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  end loop;

  if v_subtotal <= 0 or v_subtotal > 200000 then raise exception 'Total do pedido inválido.'; end if;

  insert into public.customers (name, whatsapp, email)
  values (v_name, v_whatsapp, v_email)
  returning id into v_customer_id;

  insert into public.orders (
    customer_id, customer_name, customer_whatsapp, customer_email,
    subtotal, shipping, discount, total, address, notes,
    payment_method, status, fulfillment_status,
    inventory_reserved_at, inventory_reservation_expires_at,
    contains_preorder, contains_ready_stock
  ) values (
    v_customer_id, v_name, v_whatsapp, v_email,
    v_subtotal, 0, 0, v_subtotal,
    jsonb_build_object('delivery','pickup'),
    left(nullif(trim(regexp_replace(coalesce(p_notes,''), '[[:cntrl:]&&[^\n\r\t]]+', ' ', 'g')), ''), 1000),
    v_payment_method, 'Aguardando pagamento', 'Aguardando pagamento',
    now(), now() + interval '35 minutes',
    v_contains_preorder, v_contains_ready_stock
  ) returning id, order_code into v_order_id, v_order_code;

  for v_product_id, v_quantity in
    select item->>'id', sum((item->>'quantity')::integer)::integer
    from jsonb_array_elements(p_items) item
    group by item->>'id'
    order by item->>'id'
  loop
    select * into v_product from public.products where id = v_product_id for update;
    v_ready_quantity := least(greatest(v_product.stock, 0), v_quantity);
    v_preorder_quantity := v_quantity - v_ready_quantity;
    v_unit_price := case
      when v_payment_method = 'pix' and v_product.pix_price is not null and v_product.pix_price > 0 then v_product.pix_price
      else v_product.price
    end;

    insert into public.order_items (
      order_id, product_id, sku, product_name, brand, unit_price, quantity,
      ready_quantity, preorder_quantity
    ) values (
      v_order_id, v_product.id, v_product.sku, v_product.name, v_product.brand,
      v_unit_price, v_quantity, v_ready_quantity, v_preorder_quantity
    );

    if v_ready_quantity > 0 then
      update public.products
         set stock = stock - v_ready_quantity, updated_at = now()
       where id = v_product_id and stock >= v_ready_quantity;
      if not found then raise exception 'Estoque alterado durante a reserva: %.', v_product_id; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_order_id, 'orderCode', v_order_code, 'total', v_subtotal,
    'paymentMethod', v_payment_method,
    'reservationExpiresAt', now() + interval '35 minutes',
    'containsPreorder', v_contains_preorder,
    'containsReadyStock', v_contains_ready_stock
  );
end;
$function$;

create or replace function public.release_order_inventory_reservation(
  p_order_id uuid,
  p_mark_cancelled boolean default false,
  p_reason text default 'reservation_released'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_released boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if v_order.inventory_reserved_at is not null
     and v_order.inventory_reservation_released_at is null
     and v_order.stock_deducted_at is null then
    for v_item in
      select product_id, sum(ready_quantity)::integer quantity
      from public.order_items
      where order_id = p_order_id and product_id is not null and ready_quantity > 0
      group by product_id order by product_id
    loop
      update public.products set stock = stock + v_item.quantity, updated_at = now()
      where id = v_item.product_id;
    end loop;
    v_released := true;
  end if;

  update public.orders
     set inventory_reservation_released_at = case when v_released then now() else inventory_reservation_released_at end,
         status = case when p_mark_cancelled and status not in ('Pagamento aprovado','Reembolsado') then 'Cancelado' else status end,
         fulfillment_status = case when p_mark_cancelled and status not in ('Pagamento aprovado','Reembolsado') then 'Cancelado' else fulfillment_status end,
         mercado_pago_status_detail = case when p_mark_cancelled then left(coalesce(p_reason,'reservation_released'),480) else mercado_pago_status_detail end,
         fulfillment_updated_at = case when p_mark_cancelled then now() else fulfillment_updated_at end,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('ok',true,'released',v_released);
end;
$function$;

create or replace function public.sync_order_payment_status(
  p_order_id uuid,
  p_status text,
  p_mercado_pago_order_id text default null,
  p_mercado_pago_payment_id text default null,
  p_mercado_pago_status text default null,
  p_mercado_pago_status_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_updated integer;
  v_stock_changed boolean := false;
  v_stock_restored boolean := false;
  v_reservation_finalized boolean := false;
begin
  if p_status not in ('Aguardando pagamento','Pagamento em análise','Pagamento aprovado','Pagamento recusado','Erro ao gerar pagamento','Cancelado','Reembolsado','Contestação') then
    raise exception 'Status de pagamento inválido.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if v_order.status = 'Pagamento aprovado' and p_status in ('Aguardando pagamento','Pagamento em análise','Pagamento recusado','Erro ao gerar pagamento') then
    return jsonb_build_object('ok',true,'ignored','stale_after_approval','status',v_order.status);
  end if;
  if v_order.status in ('Reembolsado','Contestação') and p_status <> v_order.status then
    return jsonb_build_object('ok',true,'ignored','terminal_status','status',v_order.status);
  end if;
  if v_order.status = 'Cancelado' and p_status not in ('Cancelado','Reembolsado','Contestação') then
    return jsonb_build_object('ok',true,'ignored','cancelled_order','status',v_order.status);
  end if;

  if p_status = 'Pagamento aprovado' and v_order.stock_deducted_at is null then
    if v_order.inventory_reserved_at is not null and v_order.inventory_reservation_released_at is null then
      update public.orders set stock_deducted_at = now(), updated_at = now() where id = p_order_id;
      v_reservation_finalized := true;
    else
      for v_item in
        select product_id, sum(ready_quantity)::integer quantity
        from public.order_items
        where order_id = p_order_id and product_id is not null and ready_quantity > 0
        group by product_id order by product_id
      loop
        update public.products set stock = stock - v_item.quantity, updated_at = now()
        where id = v_item.product_id and stock >= v_item.quantity;
        get diagnostics v_updated = row_count;
        if v_updated <> 1 then
          update public.orders
             set inventory_exception_at = now(),
                 inventory_exception_reason = left('Pagamento aprovado sem estoque suficiente para ' || v_item.product_id, 480),
                 updated_at = now()
           where id = p_order_id;
          raise exception 'Pagamento aprovado, mas o estoque exige revisão manual.';
        end if;
        v_stock_changed := true;
      end loop;
      update public.orders set stock_deducted_at = now(), stock_restored_at = null, updated_at = now() where id = p_order_id;
    end if;
  end if;

  if p_status in ('Cancelado','Reembolsado') then
    if v_order.stock_deducted_at is not null and v_order.stock_restored_at is null then
      for v_item in
        select product_id, sum(ready_quantity)::integer quantity
        from public.order_items
        where order_id = p_order_id and product_id is not null and ready_quantity > 0
        group by product_id order by product_id
      loop
        update public.products set stock = stock + v_item.quantity, updated_at = now() where id = v_item.product_id;
      end loop;
      update public.orders
         set stock_restored_at = now(),
             inventory_reservation_released_at = coalesce(inventory_reservation_released_at, now()),
             updated_at = now()
       where id = p_order_id;
      v_stock_restored := true;
    elsif v_order.inventory_reserved_at is not null and v_order.inventory_reservation_released_at is null and v_order.stock_deducted_at is null then
      perform public.release_order_inventory_reservation(p_order_id, false, coalesce(p_mercado_pago_status_detail,'payment_cancelled'));
      v_stock_restored := true;
    end if;
  end if;

  update public.orders set
    status = p_status,
    fulfillment_status = case
      when p_status = 'Pagamento aprovado' and fulfillment_status = 'Aguardando pagamento' and contains_preorder then 'Aguardando pedido ao fornecedor'
      when p_status = 'Pagamento aprovado' and fulfillment_status = 'Aguardando pagamento' then 'Novo pedido'
      when p_status in ('Cancelado','Reembolsado') then 'Cancelado'
      else fulfillment_status
    end,
    fulfillment_updated_at = case
      when p_status = 'Pagamento aprovado' and fulfillment_status = 'Aguardando pagamento' then now()
      when p_status in ('Cancelado','Reembolsado') then now()
      else fulfillment_updated_at
    end,
    mercado_pago_order_id = coalesce(nullif(left(p_mercado_pago_order_id,160),''), mercado_pago_order_id),
    mercado_pago_payment_id = coalesce(nullif(left(p_mercado_pago_payment_id,160),''), mercado_pago_payment_id),
    mercado_pago_status = coalesce(left(p_mercado_pago_status,100), mercado_pago_status),
    mercado_pago_status_detail = coalesce(left(p_mercado_pago_status_detail,480), mercado_pago_status_detail),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true, 'status', p_status, 'stockDeducted', v_stock_changed,
    'stockRestored', v_stock_restored, 'reservationFinalized', v_reservation_finalized,
    'containsPreorder', v_order.contains_preorder
  );
end;
$function$;

create or replace function public.update_order_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_admin_notes text default null,
  p_archived boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_notes text;
begin
  perform private.assert_admin_mfa();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  if p_fulfillment_status not in (
    'Aguardando pagamento','Novo pedido','Aguardando pedido ao fornecedor',
    'Pedido realizado ao fornecedor','Aguardando chegada do fornecedor',
    'Em separação','Pronto para retirada','Enviado','Entregue','Cancelado'
  ) then raise exception 'Etapa do pedido inválida.'; end if;

  if v_order.status <> 'Pagamento aprovado' and p_fulfillment_status not in ('Aguardando pagamento','Cancelado') then
    raise exception 'O pedido precisa estar pago antes de entrar em preparação.';
  end if;
  if v_order.status = 'Pagamento aprovado' and p_fulfillment_status = 'Aguardando pagamento' then
    raise exception 'Um pedido pago não pode voltar para aguardando pagamento.';
  end if;
  if not v_order.contains_preorder and p_fulfillment_status in (
    'Aguardando pedido ao fornecedor','Pedido realizado ao fornecedor','Aguardando chegada do fornecedor'
  ) then raise exception 'Este pedido não possui itens sob encomenda.'; end if;

  v_notes := left(nullif(trim(regexp_replace(coalesce(p_admin_notes,''),'[[:cntrl:]]+',' ','g')),''),2000);
  update public.orders
     set fulfillment_status = p_fulfillment_status,
         fulfillment_updated_at = now(),
         admin_notes = v_notes,
         archived_at = case when p_archived is true then coalesce(archived_at,now()) when p_archived is false then null else archived_at end,
         updated_at = now()
   where id = p_order_id
   returning * into v_order;

  return jsonb_build_object('ok',true,'id',v_order.id,'fulfillmentStatus',v_order.fulfillment_status,'archivedAt',v_order.archived_at);
end;
$function$;

create or replace function private.audit_store_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_fields text[] := '{}';
  v_entity_id text;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_entity_id := coalesce(v_new->>'id', v_old->>'id', v_new->>'order_code', v_old->>'order_code');

  if tg_table_name = 'products' then
    v_fields := private.changed_columns(v_old, v_new, array[
      'name','brand','cost','price','pix_price','stock','minimum_stock','image','active','status',
      'preorder_enabled','preorder_limit','supplier_availability'
    ]);
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'stock_before', v_old->'stock', 'stock_after', v_new->'stock',
      'preorder_before', v_old->'preorder_enabled', 'preorder_after', v_new->'preorder_enabled',
      'active_before', v_old->'active', 'active_after', v_new->'active'
    ));
  elsif tg_table_name = 'store_settings' then
    v_fields := private.changed_columns(v_old, v_new, array[
      'name','whatsapp','instagram','email','legal_name','tax_id','business_address',
      'service_hours','privacy_contact_email','shipping_policy','shipping_origin_cep',
      'shipping_mode','payment_environment','email_notifications_enabled',
      'supplier_docs_verified','policies_updated_at','launch_status','free_shipping_from','site_url'
    ]);
  elsif tg_table_name = 'orders' then
    v_entity_id := coalesce(v_new->>'order_code', v_old->>'order_code', v_entity_id);
    v_fields := private.changed_columns(v_old, v_new, array[
      'status','fulfillment_status','admin_notes','archived_at','stock_deducted_at',
      'stock_restored_at','inventory_reserved_at','inventory_reservation_released_at',
      'inventory_exception_at','contains_preorder','contains_ready_stock'
    ]);
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'payment_status_before', v_old->>'status', 'payment_status_after', v_new->>'status',
      'fulfillment_before', v_old->>'fulfillment_status', 'fulfillment_after', v_new->>'fulfillment_status',
      'archived_before', (v_old->'archived_at') is not null and v_old->'archived_at' <> 'null'::jsonb,
      'archived_after', (v_new->'archived_at') is not null and v_new->'archived_at' <> 'null'::jsonb
    ));
  elsif tg_table_name = 'coupons' then
    v_fields := private.changed_columns(v_old, v_new, array['code','type','value','active','starts_at','ends_at','usage_limit']);
  elsif tg_table_name = 'admin_users' then
    v_fields := private.changed_columns(v_old, v_new, array['email','active','user_id']);
    v_metadata := jsonb_strip_nulls(jsonb_build_object('active_before',v_old->'active','active_after',v_new->'active'));
  end if;

  if tg_op <> 'UPDATE' or cardinality(v_fields) > 0 then
    insert into private.admin_audit_log (
      actor_user_id, actor_role, entity_type, entity_id, action, changed_fields, metadata
    ) values (
      auth.uid(),
      coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user),
      tg_table_name,
      left(v_entity_id, 180),
      tg_op,
      v_fields,
      v_metadata
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
