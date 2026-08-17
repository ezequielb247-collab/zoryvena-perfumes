-- Zoryvena Perfumes
-- Fecha o fluxo seguro de cotação manual -> pagamento sem reservar estoque durante a cotação.

alter table public.orders
  add column if not exists shipping_quoted_at timestamptz,
  add column if not exists shipping_quote_expires_at timestamptz;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
check (status in (
  'Aguardando confirmação',
  'Aguardando cotação de frete',
  'Frete cotado',
  'Aguardando pagamento',
  'Pagamento em análise',
  'Pagamento aprovado',
  'Pagamento recusado',
  'Erro ao gerar pagamento',
  'Separando pedido',
  'Enviado',
  'Entregue',
  'Cancelado',
  'Reembolsado',
  'Contestação'
));

alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check
check (fulfillment_status in (
  'Aguardando cotação de frete',
  'Frete cotado',
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

create index if not exists orders_shipping_quote_queue_idx
on public.orders (shipping_quoted_at, created_at)
where archived_at is null and status in ('Aguardando cotação de frete', 'Frete cotado');

create or replace function public.create_shipping_quote_request(
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
  v_payment_method text;
  v_cep text;
  v_street text;
  v_number text;
  v_complement text;
  v_neighborhood text;
  v_city text;
  v_state text;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id text;
  v_quantity integer;
  v_quantity_text text;
  v_total_quantity integer := 0;
  v_unit_price numeric(12,2);
  v_ready_quantity integer;
  v_preorder_quantity integer;
begin
  if jsonb_typeof(p_customer) <> 'object' then raise exception 'Dados do cliente inválidos.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'O pedido precisa ter entre 1 e 20 itens.';
  end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, '')));
  if v_payment_method not in ('pix','card') then raise exception 'Forma de pagamento inválida.'; end if;
  if lower(trim(coalesce(p_customer->>'delivery', ''))) <> 'shipping' then raise exception 'Modalidade de entrega inválida.'; end if;
  if coalesce(p_customer->>'acceptedPolicies', '') <> 'yes' then raise exception 'O aceite das políticas é obrigatório.'; end if;

  v_name := left(trim(regexp_replace(coalesce(p_customer->>'name',''), '[[:cntrl:]]+', ' ', 'g')), 120);
  v_whatsapp := regexp_replace(coalesce(p_customer->>'whatsapp',''), '[^0-9]', '', 'g');
  v_email := left(lower(trim(coalesce(p_customer->>'email',''))), 150);
  if length(v_name) < 2 then raise exception 'Informe o nome do cliente.'; end if;
  if length(v_whatsapp) < 10 or length(v_whatsapp) > 13 then raise exception 'WhatsApp inválido.'; end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe um e-mail válido.'; end if;

  v_cep := regexp_replace(coalesce(p_customer->>'cep',''), '[^0-9]', '', 'g');
  v_street := left(trim(regexp_replace(coalesce(p_customer->>'street',''), '[[:cntrl:]]+', ' ', 'g')), 160);
  v_number := left(trim(regexp_replace(coalesce(p_customer->>'number',''), '[[:cntrl:]]+', ' ', 'g')), 20);
  v_complement := left(trim(regexp_replace(coalesce(p_customer->>'complement',''), '[[:cntrl:]]+', ' ', 'g')), 120);
  v_neighborhood := left(trim(regexp_replace(coalesce(p_customer->>'neighborhood',''), '[[:cntrl:]]+', ' ', 'g')), 100);
  v_city := left(trim(regexp_replace(coalesce(p_customer->>'city',''), '[[:cntrl:]]+', ' ', 'g')), 100);
  v_state := upper(regexp_replace(coalesce(p_customer->>'state',''), '[^A-Za-z]', '', 'g'));
  if length(v_cep) <> 8 then raise exception 'CEP inválido.'; end if;
  if length(v_street) < 2 or length(v_number) < 1 or length(v_neighborhood) < 2 or length(v_city) < 2 or length(v_state) <> 2 then
    raise exception 'Preencha o endereço completo para cotar o frete.';
  end if;

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
    where id = v_product_id and active = true and price is not null and price > 0;
    if not found then raise exception 'Produto indisponível: %', v_product_id; end if;

    v_ready_quantity := least(greatest(v_product.stock, 0), v_quantity);
    v_preorder_quantity := v_quantity - v_ready_quantity;
    if v_preorder_quantity > 0 and (not v_product.preorder_enabled or v_preorder_quantity > v_product.preorder_limit) then
      raise exception 'Produto indisponível na quantidade solicitada: %', v_product_id;
    end if;

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
    payment_method, status, fulfillment_status, shipping_quote_expires_at,
    contains_preorder, contains_ready_stock
  ) values (
    v_customer_id, v_name, v_whatsapp, v_email,
    v_subtotal, 0, 0, v_subtotal,
    jsonb_build_object(
      'delivery','shipping','cep',v_cep,'street',v_street,'number',v_number,
      'complement',nullif(v_complement,''),'neighborhood',v_neighborhood,
      'city',v_city,'state',v_state
    ),
    left(nullif(trim(regexp_replace(coalesce(p_notes,''), '[[:cntrl:]&&[^\n\r\t]]+', ' ', 'g')), ''), 1000),
    v_payment_method, 'Aguardando cotação de frete', 'Aguardando cotação de frete',
    now() + interval '48 hours', false, false
  ) returning id, order_code into v_order_id, v_order_code;

  for v_product_id, v_quantity in
    select item->>'id', sum((item->>'quantity')::integer)::integer
    from jsonb_array_elements(p_items) item
    group by item->>'id'
    order by item->>'id'
  loop
    select * into v_product from public.products where id = v_product_id;
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
  end loop;

  return jsonb_build_object(
    'id', v_order_id, 'orderCode', v_order_code, 'subtotal', v_subtotal,
    'total', v_subtotal, 'paymentMethod', v_payment_method,
    'quoteExpiresAt', now() + interval '48 hours'
  );
end;
$function$;

create or replace function public.admin_set_shipping_quote(
  p_order_id uuid,
  p_shipping numeric,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_shipping numeric(12,2);
  v_notes text;
begin
  perform private.assert_admin_mfa();
  if p_shipping is null or p_shipping < 0 or p_shipping > 5000 then raise exception 'Valor de frete inválido.'; end if;
  v_shipping := round(p_shipping::numeric, 2);
  v_notes := left(nullif(trim(regexp_replace(coalesce(p_admin_notes,''),'[[:cntrl:]]+',' ','g')),''),2000);

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if coalesce(v_order.address->>'delivery','') <> 'shipping' then raise exception 'Este pedido não é uma entrega.'; end if;
  if v_order.archived_at is not null then raise exception 'Restaure o pedido antes de cotar o frete.'; end if;
  if v_order.inventory_reserved_at is not null then raise exception 'O pagamento deste pedido já foi iniciado.'; end if;
  if v_order.status not in ('Aguardando cotação de frete','Frete cotado') then raise exception 'Este pedido não está aguardando cotação.'; end if;

  update public.orders
     set shipping = v_shipping,
         total = greatest(0, subtotal + v_shipping - discount),
         shipping_quoted_at = now(),
         shipping_quote_expires_at = now() + interval '24 hours',
         status = 'Frete cotado',
         fulfillment_status = 'Frete cotado',
         fulfillment_updated_at = now(),
         admin_notes = v_notes,
         updated_at = now()
   where id = p_order_id
   returning * into v_order;

  return jsonb_build_object(
    'ok',true,'id',v_order.id,'orderCode',v_order.order_code,
    'shipping',v_order.shipping,'subtotal',v_order.subtotal,'total',v_order.total,
    'status',v_order.status,'quoteExpiresAt',v_order.shipping_quote_expires_at
  );
end;
$function$;

create or replace function public.prepare_shipping_order_payment(
  p_order_id uuid,
  p_status_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_product public.products%rowtype;
  v_ready_quantity integer;
  v_preorder_quantity integer;
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_contains_preorder boolean := false;
  v_contains_ready_stock boolean := false;
begin
  select * into v_order
  from public.orders
  where id = p_order_id and public_status_token = p_status_token
  for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if coalesce(v_order.address->>'delivery','') <> 'shipping' then raise exception 'Este pedido não é uma entrega.'; end if;
  if v_order.archived_at is not null then raise exception 'Este pedido não está mais ativo.'; end if;

  if v_order.status = 'Aguardando pagamento'
     and v_order.inventory_reserved_at is not null
     and v_order.inventory_reservation_released_at is null
     and v_order.inventory_reservation_expires_at > now() then
    return jsonb_build_object(
      'id',v_order.id,'orderCode',v_order.order_code,'total',v_order.total,
      'paymentMethod',v_order.payment_method,
      'reservationExpiresAt',v_order.inventory_reservation_expires_at,
      'containsPreorder',v_order.contains_preorder,
      'containsReadyStock',v_order.contains_ready_stock,
      'alreadyPrepared',true
    );
  end if;

  if v_order.status <> 'Frete cotado' then raise exception 'O frete ainda não está pronto para pagamento.'; end if;
  if v_order.shipping_quoted_at is null or v_order.shipping_quote_expires_at is null or v_order.shipping_quote_expires_at <= now() then
    raise exception 'A cotação de frete expirou. Solicite uma nova cotação.';
  end if;

  for v_item in
    select id, product_id, quantity
    from public.order_items
    where order_id = p_order_id
    order by product_id
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id and active = true and price is not null and price > 0
    for update;
    if not found then raise exception 'Produto indisponível: %', v_item.product_id; end if;

    v_ready_quantity := least(greatest(v_product.stock, 0), v_item.quantity);
    v_preorder_quantity := v_item.quantity - v_ready_quantity;
    if v_preorder_quantity > 0 then
      if not v_product.preorder_enabled or v_preorder_quantity > v_product.preorder_limit then
        raise exception 'Produto indisponível na quantidade solicitada: %', v_item.product_id;
      end if;
      v_contains_preorder := true;
    end if;
    if v_ready_quantity > 0 then v_contains_ready_stock := true; end if;

    v_unit_price := case
      when v_order.payment_method = 'pix' and v_product.pix_price is not null and v_product.pix_price > 0 then v_product.pix_price
      else v_product.price
    end;
    if v_unit_price <= 0 or v_unit_price > 100000 then raise exception 'Preço inválido para %.', v_item.product_id; end if;
    v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);

    update public.order_items
       set sku = v_product.sku,
           product_name = v_product.name,
           brand = v_product.brand,
           unit_price = v_unit_price,
           ready_quantity = v_ready_quantity,
           preorder_quantity = v_preorder_quantity,
           line_total = v_unit_price * v_item.quantity
     where id = v_item.id;

    if v_ready_quantity > 0 then
      update public.products
         set stock = stock - v_ready_quantity, updated_at = now()
       where id = v_product.id and stock >= v_ready_quantity;
      if not found then raise exception 'Estoque alterado durante a reserva: %.', v_product.id; end if;
    end if;
  end loop;

  if v_subtotal <= 0 or v_subtotal > 200000 then raise exception 'Total do pedido inválido.'; end if;

  update public.orders
     set subtotal = v_subtotal,
         total = greatest(0, v_subtotal + shipping - discount),
         status = 'Aguardando pagamento',
         fulfillment_status = 'Aguardando pagamento',
         fulfillment_updated_at = now(),
         inventory_reserved_at = now(),
         inventory_reservation_expires_at = now() + interval '35 minutes',
         inventory_reservation_released_at = null,
         contains_preorder = v_contains_preorder,
         contains_ready_stock = v_contains_ready_stock,
         updated_at = now()
   where id = p_order_id
   returning * into v_order;

  return jsonb_build_object(
    'id',v_order.id,'orderCode',v_order.order_code,'total',v_order.total,
    'paymentMethod',v_order.payment_method,
    'reservationExpiresAt',v_order.inventory_reservation_expires_at,
    'containsPreorder',v_order.contains_preorder,
    'containsReadyStock',v_order.contains_ready_stock,
    'alreadyPrepared',false
  );
end;
$function$;

revoke all on function public.create_shipping_quote_request(jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.create_shipping_quote_request(jsonb,jsonb,text,text) to service_role;

revoke all on function public.prepare_shipping_order_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.prepare_shipping_order_payment(uuid,uuid) to service_role;

revoke all on function public.admin_set_shipping_quote(uuid,numeric,text) from public, anon;
grant execute on function public.admin_set_shipping_quote(uuid,numeric,text) to authenticated;
