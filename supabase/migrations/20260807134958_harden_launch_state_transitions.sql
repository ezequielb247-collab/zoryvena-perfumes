create or replace function public.admin_update_store_settings(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(coalesce(p_data->>'name','')), 120);
  v_short_name text := left(trim(coalesce(p_data->>'short_name','')), 80);
  v_slogan text := left(trim(coalesce(p_data->>'slogan','')), 180);
  v_whatsapp text := regexp_replace(coalesce(p_data->>'whatsapp',''), '[^0-9]', '', 'g');
  v_instagram text := trim(coalesce(p_data->>'instagram',''));
  v_email text := lower(trim(coalesce(p_data->>'email','')));
  v_legal_name text := left(trim(coalesce(p_data->>'legal_name','')), 180);
  v_tax_id text := regexp_replace(coalesce(p_data->>'tax_id',''), '[^0-9]', '', 'g');
  v_address text := left(trim(coalesce(p_data->>'business_address','')), 500);
  v_hours text := left(trim(coalesce(p_data->>'service_hours','')), 240);
  v_privacy_email text := lower(trim(coalesce(p_data->>'privacy_contact_email',''));
  v_shipping_policy text := left(trim(coalesce(p_data->>'shipping_policy','')), 1200);
  v_origin_cep text := regexp_replace(coalesce(p_data->>'shipping_origin_cep',''), '[^0-9]', '', 'g');
  v_shipping_mode text := coalesce(p_data->>'shipping_mode','');
  v_payment_environment text := coalesce(p_data->>'payment_environment','');
  v_launch_status text := coalesce(p_data->>'launch_status','');
  v_site_url text := left(trim(coalesce(p_data->>'site_url','')), 300);
  v_email_notifications boolean;
  v_supplier_docs_verified boolean;
  v_free_shipping numeric;
  v_policies_date date;
  v_settings public.store_settings%rowtype;
  v_allowed_keys constant text[] := array[
    'name','short_name','slogan','whatsapp','instagram','email','legal_name','tax_id',
    'business_address','service_hours','privacy_contact_email','shipping_policy',
    'shipping_origin_cep','shipping_mode','payment_environment','email_notifications_enabled',
    'supplier_docs_verified','policies_updated_at','launch_status','free_shipping_from','site_url'
  ];
begin
  perform private.assert_admin_mfa();
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Configurações inválidas.'; end if;
  if exists (select 1 from jsonb_object_keys(p_data) key where key <> all(v_allowed_keys)) then
    raise exception 'Campo de configuração não autorizado.';
  end if;

  select * into v_settings from public.store_settings where id = 1 for update;
  if not found then raise exception 'Configurações da loja não encontradas.'; end if;

  if length(v_name) < 2 or length(v_short_name) < 2 then raise exception 'Informe o nome da loja.'; end if;
  if v_whatsapp <> '' and length(v_whatsapp) not between 10 and 15 then raise exception 'WhatsApp inválido.'; end if;
  if v_instagram <> '' and v_instagram !~ '^@?[A-Za-z0-9._]{1,30}$' then raise exception 'Instagram inválido.'; end if;
  if v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'E-mail de atendimento inválido.'; end if;
  if v_privacy_email <> '' and v_privacy_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'E-mail de privacidade inválido.'; end if;
  if v_tax_id <> '' and length(v_tax_id) not in (11,14) then raise exception 'CPF ou CNPJ inválido.'; end if;
  if v_origin_cep <> '' and length(v_origin_cep) <> 8 then raise exception 'CEP de origem inválido.'; end if;
  if v_shipping_mode not in ('pickup_only','manual_quote','automatic') then raise exception 'Operação de entrega inválida.'; end if;
  if v_payment_environment not in ('test','production') then raise exception 'Ambiente de pagamento inválido.'; end if;
  if v_launch_status not in ('preparation','soft_launch','live') then raise exception 'Status da loja inválido.'; end if;
  if v_site_url <> '' and v_site_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:/.*)?$' then raise exception 'URL do site inválida.'; end if;
  if jsonb_typeof(p_data->'email_notifications_enabled') <> 'boolean'
     or jsonb_typeof(p_data->'supplier_docs_verified') <> 'boolean' then
    raise exception 'Campos de confirmação inválidos.';
  end if;

  v_email_notifications := (p_data->>'email_notifications_enabled')::boolean;
  v_supplier_docs_verified := (p_data->>'supplier_docs_verified')::boolean;

  if v_supplier_docs_verified and not coalesce(v_settings.supplier_docs_verified, false) then
    raise exception 'A procedência só pode ser confirmada pelo fluxo específico de conferência documental.';
  end if;

  if v_payment_environment = 'production' and not v_supplier_docs_verified then
    raise exception 'Produção bloqueada até a procedência ser conferida documentalmente.';
  end if;

  if v_payment_environment = 'production' and (
       v_legal_name = '' or v_tax_id = '' or v_address = '' or v_email = '' or v_whatsapp = '' or v_site_url = ''
     ) then
    raise exception 'Produção exige cadastro legal e canais oficiais completos.';
  end if;

  if v_launch_status in ('soft_launch','live') and (
       v_payment_environment <> 'production' or not v_supplier_docs_verified
     ) then
    raise exception 'Lançamento bloqueado até procedência e pagamentos em produção estarem validados.';
  end if;

  if v_launch_status = 'live' and v_settings.launch_status not in ('soft_launch','live') then
    raise exception 'A loja precisa passar por lançamento controlado antes de ficar oficialmente aberta.';
  end if;

  if p_data->'free_shipping_from' is null or jsonb_typeof(p_data->'free_shipping_from') = 'null' then
    v_free_shipping := null;
  elsif jsonb_typeof(p_data->'free_shipping_from') = 'number' then
    v_free_shipping := (p_data->>'free_shipping_from')::numeric;
    if v_free_shipping < 0 or v_free_shipping > 1000000 then raise exception 'Valor de frete grátis inválido.'; end if;
  else
    raise exception 'Valor de frete grátis inválido.';
  end if;

  if nullif(p_data->>'policies_updated_at','') is not null then
    v_policies_date := (p_data->>'policies_updated_at')::date;
    if v_policies_date > current_date + 1 then raise exception 'Data das políticas inválida.'; end if;
  end if;

  update public.store_settings
     set name = v_name,
         short_name = v_short_name,
         slogan = nullif(v_slogan,''),
         whatsapp = nullif(v_whatsapp,''),
         instagram = nullif(v_instagram,''),
         email = nullif(v_email,''),
         legal_name = nullif(v_legal_name,''),
         tax_id = nullif(v_tax_id,''),
         business_address = nullif(v_address,''),
         service_hours = nullif(v_hours,''),
         privacy_contact_email = nullif(v_privacy_email,''),
         shipping_policy = nullif(v_shipping_policy,''),
         shipping_origin_cep = nullif(v_origin_cep,''),
         shipping_mode = v_shipping_mode,
         payment_environment = v_payment_environment,
         email_notifications_enabled = v_email_notifications,
         supplier_docs_verified = v_supplier_docs_verified,
         policies_updated_at = v_policies_date,
         launch_status = v_launch_status,
         free_shipping_from = v_free_shipping,
         site_url = nullif(v_site_url,''),
         updated_at = now()
   where id = 1
   returning * into v_settings;

  return jsonb_build_object('ok', true, 'updatedAt', v_settings.updated_at);
end;
$$;

revoke all on function public.admin_update_store_settings(jsonb) from public, anon;
grant execute on function public.admin_update_store_settings(jsonb) to authenticated;
