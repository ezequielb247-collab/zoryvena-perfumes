create or replace function public.admin_update_product(p_product_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Alterações do produto inválidas.';
  end if;
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

  if p_patch ? 'image' then
    v_image := nullif(trim(p_patch->>'image'), '');
    if v_image is distinct from v_product.image and v_image is not null then
      if length(v_image) > 600 then raise exception 'URL da imagem muito longa.'; end if;
      if v_image ~ '^https://ajyultndtauabfufrmfr[.]supabase[.]co/storage/v1/object/public/product-images/' then
        if v_image !~ ('^https://ajyultndtauabfufrmfr[.]supabase[.]co/storage/v1/object/public/product-images/' || p_product_id || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$') then
          raise exception 'Caminho da imagem não autorizado.';
        end if;
      elsif v_image !~ '^/?assets/[A-Za-z0-9_./-]+[.](webp|png|jpg|jpeg)$' or position('..' in v_image) > 0 then
        raise exception 'Use apenas a imagem atual, uma imagem enviada pelo painel ou um arquivo local autorizado.';
      end if;
    end if;
  else
    v_image := v_product.image;
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
    'ok', true,
    'id', v_product.id,
    'status', v_product.status,
    'stock', v_product.stock,
    'preorderEnabled', v_product.preorder_enabled,
    'preorderLimit', v_product.preorder_limit
  );
end;
$$;

revoke all on function public.admin_update_product(text, jsonb) from public, anon;
grant execute on function public.admin_update_product(text, jsonb) to authenticated;

create or replace function public.admin_get_audit_log(p_limit integer default 50)
returns table(
  occurred_at timestamptz,
  entity_type text,
  entity_id text,
  action text,
  changed_fields text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_mfa();
  return query
    select l.occurred_at, l.entity_type, l.entity_id, l.action, l.changed_fields
      from private.admin_audit_log l
     order by l.occurred_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function public.admin_get_audit_log(integer) from public, anon;
grant execute on function public.admin_get_audit_log(integer) to authenticated;
