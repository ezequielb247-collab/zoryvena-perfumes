alter table public.store_settings
  add column if not exists payment_production_credentials_verified_at timestamptz,
  add column if not exists payment_webhook_verified_at timestamptz;

create or replace function private.enforce_store_production_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_environment = 'production' or new.launch_status in ('soft_launch','live') then
    if nullif(trim(new.legal_name),'') is null
       or nullif(trim(new.tax_id),'') is null
       or nullif(trim(new.business_address),'') is null then
      raise exception 'Preencha a identificação legal antes de habilitar a produção.';
    end if;
    if not (
      coalesce(new.supplier_docs_verified,false)
      or new.supplier_docs_unavailable_acknowledged_at is not null
    ) then
      raise exception 'Registre a conferência documental ou a exceção operacional de documentos indisponíveis antes de habilitar a produção.';
    end if;
    if new.policies_updated_at is null then
      raise exception 'Revise as políticas antes de habilitar a produção.';
    end if;
    if new.payment_production_credentials_verified_at is null then
      raise exception 'Verifique as credenciais produtivas do Mercado Pago antes de habilitar a produção.';
    end if;
    if new.payment_webhook_verified_at is null then
      raise exception 'Verifique o webhook produtivo do Mercado Pago antes de habilitar a produção.';
    end if;
    if not exists (
      select 1
      from public.admin_users a
      join auth.mfa_factors f on f.user_id = a.user_id and f.status = 'verified'
      where a.active
    ) then
      raise exception 'Ative a autenticação em duas etapas do administrador antes de habilitar a produção.';
    end if;
  end if;

  if new.launch_status in ('soft_launch','live') and new.payment_environment <> 'production' then
    raise exception 'O ambiente de pagamento precisa estar em produção antes de abrir a loja.';
  end if;

  return new;
end;
$$;
