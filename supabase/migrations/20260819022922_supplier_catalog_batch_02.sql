-- Zoryvena Perfumes
-- Segundo lote da lista de fornecedor recebida em 17/08/2026.
-- Apenas correspondências confirmadas com cadastros já existentes.
-- Preços existentes são preservados e estoque físico nunca é inventado.

do $block$
declare
  v_expected constant text[] := array[
    'al-haramain-laventure',
    'lattafa-fakhar-rose',
    'armaf-club-de-nuit-intense-woman'
  ];
  v_found integer;
begin
  select count(*) into v_found
  from public.products
  where id = any(v_expected);

  if v_found <> cardinality(v_expected) then
    raise exception 'Catálogo divergente no lote 2: esperados %, encontrados %. Migração cancelada.', cardinality(v_expected), v_found;
  end if;
end;
$block$;

with supplier(id, supplier_name, cost, image) as (
  values
    (
      'al-haramain-laventure',
      'L’AVENTUI',
      270.00::numeric,
      'https://cdn11.bigcommerce.com/s-d75m9rit2s/images/stencil/1280x1280/products/18038/381062/l-aventure-eau-de-parfum-100ml-al-haramain-perfume__55005.1696985485.jpg?c=1'
    ),
    (
      'lattafa-fakhar-rose',
      'FAKHAR ROSE',
      175.00::numeric,
      'https://zaoud.it/cdn/shop/files/fakhar-rosw-edp-perfume-bottle-against-white-background_6f5f3d07-b110-4179-a8fd-d0438e46e426.jpg?v=1756538376&width=1946'
    ),
    (
      'armaf-club-de-nuit-intense-woman',
      'CLUB DE NUIT INTENSE WOMAM',
      220.00::numeric,
      'https://armaf.com/cdn/shop/files/Q-106CCLUBDENUITINTENSE_W_900x_094b2ea0-4fb8-44be-9e65-d88d6d7815cd.webp?v=1762289932&width=900'
    )
), priced as (
  select
    s.*,
    case
      when s.cost <= 220 then 100.00
      when s.cost <= 300 then 120.00
      when s.cost <= 400 then 140.00
      else 160.00
    end as card_margin,
    case
      when s.cost <= 220 then 80.00
      when s.cost <= 300 then 100.00
      when s.cost <= 400 then 120.00
      else 140.00
    end as pix_margin
  from supplier s
)
update public.products p
set
  cost = s.cost,
  price = case
    when coalesce(p.price, 0) > 0 then p.price
    else ceil((s.cost + s.card_margin) / 10.00) * 10.00 - 0.10
  end,
  pix_price = case
    when coalesce(p.pix_price, 0) > 0 then p.pix_price
    else ceil((s.cost + s.pix_margin) / 10.00) * 10.00 - 0.10
  end,
  image = case
    when nullif(trim(coalesce(p.image, '')), '') is not null then p.image
    else s.image
  end,
  active = true,
  preorder_enabled = true,
  preorder_limit = greatest(coalesce(p.preorder_limit, 0), 1),
  supplier_availability = 'Disponível no fornecedor',
  supplier_name_raw = s.supplier_name,
  supplier_match_confidence = 'confirmed_by_owner',
  supplier_updated_at = now(),
  updated_at = now()
from priced s
where p.id = s.id;
