-- Lista de atacado recebida em 04/08/2026.
-- Pedido mínimo do fornecedor: 5 peças, podendo ser consolidado entre produtos.

update public.products
set supplier_minimum_order = 5,
    supplier_updated_at = now(),
    updated_at = now()
where supplier_availability = 'Disponível no fornecedor';

update public.products
set cost = 100.00,
    price = 199.90,
    pix_price = 179.90,
    stock = 1,
    active = true,
    preorder_enabled = true,
    preorder_limit = 1,
    supplier_availability = 'Disponível no fornecedor',
    supplier_name_raw = 'SABAH',
    supplier_match_confidence = 'confirmed_by_owner',
    supplier_minimum_order = 5,
    supplier_updated_at = now(),
    updated_at = now()
where id = 'al-wataniah-sabah-al-ward';

update public.products
set stock = 1,
    active = true,
    preorder_enabled = true,
    preorder_limit = greatest(preorder_limit, 1),
    supplier_minimum_order = 5,
    supplier_updated_at = now(),
    updated_at = now()
where id = 'lattafa-yara';

insert into public.products (
  id, sku, rank, badge, priority, name, brand, volume, gender, family, occasion,
  climate, price, pix_price, cost, stock, minimum_stock, fixation, projection,
  inspired_by, description, top_notes, heart_notes, base_notes, visual, image,
  active, preorder_enabled, preorder_limit, supplier_availability,
  supplier_name_raw, supplier_match_confidence, supplier_minimum_order,
  supplier_updated_at
) values
(
  'al-wataniah-watani', 'CAT-031', 31, null, 'Pronta entrega', 'Watani',
  'Al Wataniah', '100 ml', 'Feminino', 'Floral frutado oriental',
  'Dia a dia e encontros', 'Ameno e quente', 299.90, 279.90, 200.00,
  2, 1, 'Perfil envolvente', 'Média',
  'Perfil tropical, floral e almiscarado',
  'Fragrância feminina de perfil tropical e sofisticado, com frutas luminosas, flores delicadas e uma base almiscarada confortável.',
  'Frutas tropicais e notas frutadas', 'Acorde floral',
  'Almíscar e notas adocicadas', 'pink', null, true, true, 1,
  'Disponível no fornecedor', 'WATANI', 'confirmed_by_owner', 5, now()
),
(
  'al-wataniah-durrat-al-aroos', 'CAT-032', 32, null, 'Pronta entrega',
  'Durrat Al Aroos', 'Al Wataniah', '100 ml', 'Feminino',
  'Oriental almiscarado', 'Encontros e ocasiões especiais', 'Ameno e frio',
  219.90, 199.90, 120.00, 1, 1, 'Perfil confortável', 'Média',
  'Perfil cremoso, almiscarado e amadeirado',
  'Perfume feminino oriental e cremoso, combinando almíscar, especiarias suaves, baunilha e madeiras para uma presença elegante.',
  'Almíscar branco e óleo de cypriol', 'Baunilha, cardamomo e açafrão',
  'Fava-tonka e madeira guaiac', 'pink', null, true, true, 1,
  'Disponível no fornecedor', 'DURRAT AL AROOS', 'exact', 5, now()
),
(
  'asdaaf-ameerat-al-arab', 'CAT-033', 33, null, 'Sob encomenda',
  'Ameerat Al Arab', 'Asdaaf', '100 ml', 'Feminino', 'Floral frutado',
  'Dia a dia', 'Quente e ameno', 199.90, 179.90, 100.00, 0, 1,
  'Perfil versátil', 'Média', 'Perfil frutado, floral e almiscarado',
  'Fragrância feminina versátil e delicadamente adocicada, com frutas, flores brancas, almíscar e madeiras suaves.',
  'Cítricos e bergamota', 'Flores brancas e frutas',
  'Almíscar, âmbar e madeiras', 'pink', null, true, true, 1,
  'Disponível no fornecedor', 'AMERAT ASDAAF', 'probable', 5, now()
),
(
  'maison-alhambra-rose-seduction-vip-pour-femme', 'CAT-034', 34, null,
  'Pronta entrega', 'Rose Seduction VIP Pour Femme', 'Maison Alhambra',
  '100 ml', 'Feminino', 'Floral frutado', 'Festas e encontros', 'Ameno e quente',
  259.90, 239.90, 180.00, 1, 1, 'Perfil elegante', 'Média',
  'Perfil rosado, festivo e sofisticado',
  'Perfume feminino vibrante e sofisticado, com abertura de champanhe rosé e pimenta-rosa, coração floral e fundo almiscarado.',
  'Pimenta-rosa e champanhe rosé', 'Flor de pêssego e rosa',
  'Notas amadeiradas e almíscar branco', 'pink', null, true, true, 1,
  'Disponível no fornecedor', 'ROSE VIP POUR FEMME', 'confirmed_by_owner', 5, now()
)
on conflict (id) do update set
  rank = excluded.rank,
  name = excluded.name,
  brand = excluded.brand,
  volume = excluded.volume,
  gender = excluded.gender,
  family = excluded.family,
  occasion = excluded.occasion,
  climate = excluded.climate,
  price = excluded.price,
  pix_price = excluded.pix_price,
  cost = excluded.cost,
  stock = excluded.stock,
  minimum_stock = excluded.minimum_stock,
  fixation = excluded.fixation,
  projection = excluded.projection,
  inspired_by = excluded.inspired_by,
  description = excluded.description,
  top_notes = excluded.top_notes,
  heart_notes = excluded.heart_notes,
  base_notes = excluded.base_notes,
  visual = excluded.visual,
  active = excluded.active,
  preorder_enabled = excluded.preorder_enabled,
  preorder_limit = excluded.preorder_limit,
  supplier_availability = excluded.supplier_availability,
  supplier_name_raw = excluded.supplier_name_raw,
  supplier_match_confidence = excluded.supplier_match_confidence,
  supplier_minimum_order = excluded.supplier_minimum_order,
  supplier_updated_at = excluded.supplier_updated_at,
  updated_at = now();
