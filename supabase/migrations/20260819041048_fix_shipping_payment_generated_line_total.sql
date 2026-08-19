-- Zoryvena Perfumes
-- Corrige a preparação de pagamento de pedidos com frete cotado.
-- order_items.line_total é uma coluna gerada e não pode ser atualizada manualmente.

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
           preorder_quantity = v_preorder_quantity
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
