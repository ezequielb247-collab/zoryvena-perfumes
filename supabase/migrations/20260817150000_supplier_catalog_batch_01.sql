-- Zoryvena Perfumes
-- Lista de fornecedor recebida em 17/08/2026.
-- Primeiro lote: apenas correspondências já existentes e inequívocas no catálogo.
-- Regra importante: preços existentes nunca são sobrescritos.
-- Produtos disponíveis no fornecedor entram como sob encomenda; estoque físico não é inventado.

-- Falha de forma atômica se algum cadastro esperado tiver desaparecido do banco.
do $block$
declare
  v_expected constant text[] := array[
    'lattafa-asad',
    'armaf-club-de-nuit-intense-man',
    'rasasi-hawas-for-him',
    'lattafa-fakhar-black',
    'lattafa-qaed-al-fursan',
    'fragrance-world-liquid-brun',
    'lattafa-yara',
    'lattafa-yara-moi',
    'lattafa-yara-tous',
    'lattafa-yara-candy',
    'lattafa-eclaire',
    'lattafa-her-confession',
    'maison-alhambra-delilah',
    'lattafa-khamrah',
    'lattafa-khamrah-qahwa',
    'lattafa-nebras',
    'al-wataniah-durrat-al-aroos',
    'al-wataniah-sabah-al-ward',
    'al-wataniah-watani',
    'asdaaf-ameerat-al-arab',
    'maison-alhambra-rose-seduction-vip-pour-femme'
  ];
  v_found integer;
begin
  select count(*) into v_found
  from public.products
  where id = any(v_expected);

  if v_found <> cardinality(v_expected) then
    raise exception 'Catálogo divergente: esperados %, encontrados %. Migração cancelada.', cardinality(v_expected), v_found;
  end if;
end;
$block$;

with supplier(id, supplier_name, cost, image) as (
  values
    ('lattafa-asad', 'ASAD EAU DE PARFUM', 160.00::numeric, 'https://lattafa-brasil.com/products/asad.png'),
    ('armaf-club-de-nuit-intense-man', 'CLUB DE NUIT INTENSE', 190.00::numeric, 'https://armaf.com/cdn/shop/files/Q-106DCLUBDENUITINTENSE_M_FIF_900x_f04752b1-087d-4206-8985-e13e96c5896d.webp?v=1762289750&width=900'),
    ('rasasi-hawas-for-him', 'HAWAS FOR HIM', 180.00::numeric, 'https://www.justmylook.com/cdn/shop/files/RAHA0001.png?v=1761047571'),
    ('lattafa-fakhar-black', 'FAKAR BLACK', 165.00::numeric, 'https://lattafa-brasil.com/products/fakhar.webp'),
    ('lattafa-qaed-al-fursan', 'QAED AL FURSAN', 130.00::numeric, 'https://d2r9epyceweg5n.cloudfront.net/stores/005/774/941/rte/base64_img_261602778-57c08e8782f46bde61dd970378ed7461.png'),
    ('fragrance-world-liquid-brun', 'LIQUID BRUN', 280.00::numeric, 'https://www.aarfragrances.com/public/uploads/all/oSOEsCCeO9WIpUj0QFb1kmlfp2kFdq6p1GVFh71Z.jpg'),
    ('lattafa-yara', 'YARA ROSA', 150.00::numeric, 'https://lattafa-brasil.com/products/yara.webp'),
    ('lattafa-yara-moi', 'YARA MOI', 150.00::numeric, 'https://mimadaconsentida.com/wp-content/uploads/2023/08/lattafa-yara-moi-100ml-857261.webp'),
    ('lattafa-yara-tous', 'YARA TOUS', 150.00::numeric, 'https://www.tradeinn.com/f/14235/142354445/lattafa-yara-tous-eau-de-parfum-100ml.webp'),
    ('lattafa-yara-candy', 'YARA CANDY', 150.00::numeric, 'https://perfumemarket.fr/cdn/shop/files/Copy_of_Untitled_-_2026-02-04T095233.942.png?v=1770195167&width=650'),
    ('lattafa-eclaire', 'ECLAIRE', 200.00::numeric, 'https://lattafa-brasil.com/products/eclaire.webp'),
    ('lattafa-her-confession', 'HER CONFESSION', 180.00::numeric, 'https://www.haarspullen.nl/cdn/shop/files/lattafa-her-confession-eau-de-parfum-100ml.486078466.jpg?format=webp&v=1760594629&width=430'),
    ('maison-alhambra-delilah', 'DELILAH', 160.00::numeric, 'https://acdn-us.mitiendanube.com/stores/004/846/770/products/20260715191025058004-674dfb558ca291371a17841426557217-640-0.webp'),
    ('lattafa-khamrah', 'KHAMRAH', 140.00::numeric, 'https://lattafa-brasil.com/products/khamrah.webp'),
    ('lattafa-khamrah-qahwa', 'KHAMRAH QAHWA', 140.00::numeric, 'https://cdn11.bigcommerce.com/s-sp9oc95xrw/images/stencil/1280x1280/products/45747/117671/Layer_1_52__65230.1756540075.png?c=2'),
    ('lattafa-nebras', 'NEBRAS', 200.00::numeric, 'https://media.douglas.de/medias/hcaukG1191664-0-global.jpg?context=bWFzdGVyfGltYWdlc3wyMzAzMzd8aW1hZ2UvanBlZ3xhRGd3TDJobVlTODJNemN6TWpNeE9EQXhNVFF5TWk5b1kyRjFhMGN4TVRreE5qWTBYekJmWjJ4dlltRnNMbXB3Wnd8ODc5NTUxMTE1ZDBkNzMyOGI5ZWE5ODUzNDFlMDAyZmIxMjJiNTBiZjE4NGZmZTBkMWJhZDExMWYzYmRiNDBkOA&grid=true&imPolicy=grayScaled'),
    ('al-wataniah-durrat-al-aroos', 'DURRAT AL AROOS', 120.00::numeric, 'https://orientalaromas.com/cdn/shop/files/375x500.78154_590x767.jpg?v=1701447272'),
    ('al-wataniah-sabah-al-ward', 'SABAH', 100.00::numeric, 'https://zaoud.it/cdn/shop/files/sabah-al-ward-perfume-bottle-beside-box-shows-against-white-background.jpg?v=1716425079&width=1946'),
    ('al-wataniah-watani', 'WATANI', 200.00::numeric, 'https://images.tcdn.com.br/img/img_prod/1361374/perfume_watani_al_wataniah_707_1_aca910c1b9c7f982daa5aadb69e19e6a.jpg'),
    ('asdaaf-ameerat-al-arab', 'AMERAT ASDAAF', 100.00::numeric, 'https://opulensi.com/cdn/shop/files/Ameerat_Al_Arab_bottle_and_box_high_quality.jpg?v=1726925896&width=1206'),
    ('maison-alhambra-rose-seduction-vip-pour-femme', 'ROSE VIP POUR FEMME', 180.00::numeric, 'https://media.zid.store/f38179ec-0568-4ea0-8b3d-faca5a202a53/c4966239-5e20-4773-b70f-4362f9bea24c.jpg')
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

-- Itens da lista atual explicitamente marcados como em falta e que já existem
-- no catálogo-base. Estoque físico, se houver, continua vendável; apenas a
-- encomenda ao fornecedor é desligada.
with unavailable(id, supplier_name) as (
  values
    ('lattafa-asad-bourbon', 'ASAD BOURBON'),
    ('afnan-supremacy-not-only-intense', 'SUPREMACY NOT ONLY INTENSE'),
    ('lattafa-oud-for-glory', 'BADEE OUD FOR GLORY'),
    ('lattafa-honor-and-glory', 'BADEE HONOR E GLORY')
)
update public.products p
set
  supplier_availability = 'Em falta no fornecedor',
  supplier_name_raw = u.supplier_name,
  preorder_enabled = false,
  preorder_limit = 0,
  active = (p.stock > 0),
  supplier_updated_at = now(),
  updated_at = now()
from unavailable u
where p.id = u.id;
