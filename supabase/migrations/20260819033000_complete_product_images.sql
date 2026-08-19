-- Zoryvena Perfumes
-- Completa somente imagens ausentes do catálogo-base.
-- Não altera preço, custo, estoque, disponibilidade, active ou preorder.

-- Falha de forma atômica se algum cadastro esperado tiver desaparecido.
do $block$
declare
  v_expected constant text[] := array[
    'afnan-9pm',
    'lattafa-asad-bourbon',
    'afnan-supremacy-not-only-intense',
    'lattafa-hayaati',
    'maison-alhambra-jean-lowe-immortel',
    'lattafa-mayar',
    'afnan-9pm-pour-femme',
    'lattafa-honor-and-glory',
    'lattafa-oud-for-glory',
    'paris-corner-khair-pistachio'
  ];
  v_found integer;
begin
  select count(*) into v_found
  from public.products
  where id = any(v_expected);

  if v_found <> cardinality(v_expected) then
    raise exception 'Catálogo divergente nas imagens: esperados %, encontrados %. Migração cancelada.', cardinality(v_expected), v_found;
  end if;
end;
$block$;

with image_sources(id, image) as (
  values
    (
      'afnan-9pm',
      'https://zaoud.it/cdn/shop/files/9pm-perfume-bottle-shows-against-white-background.jpg?v=1715938801&width=1946'
    ),
    (
      'lattafa-asad-bourbon',
      'https://zaoud.it/cdn/shop/files/lattafa-asad-bourbon-perfume-bottle-against-white-background.jpg?v=1735323952&width=1946'
    ),
    (
      'afnan-supremacy-not-only-intense',
      'https://zaoud.it/cdn/shop/files/Supremacy-not-only-intense-perfume-bottle-against-white-background.jpg?v=1741804266&width=1946'
    ),
    (
      'lattafa-hayaati',
      'https://zaoud.it/cdn/shop/files/HAYAATI-BLACK-edp-perfume-bottle-against-white-background.jpg?v=1714759260&width=1946'
    ),
    (
      'maison-alhambra-jean-lowe-immortel',
      'https://zaoud.it/cdn/shop/files/jean-lowe-immortel-perfume-bottle-agaisnt-white-background.jpg?v=1727037570&width=1946'
    ),
    (
      'lattafa-mayar',
      'https://zaoud.it/cdn/shop/files/MAYAR-EAU-DE-PARFUM-BOTTLE-AGAINST-WHITE-BACKGROUND_260e1d69-e188-4adb-a129-277371a24b31.jpg?v=1756095380&width=1946'
    ),
    (
      'afnan-9pm-pour-femme',
      'https://orientalaromas.com/cdn/shop/files/afna_590x767.webp?v=1693623294'
    ),
    (
      'lattafa-honor-and-glory',
      'https://zaoud.it/cdn/shop/files/Badee-al-oud-honor-and-glory-perfume-bottle-against-white-background.jpg?v=1741948314&width=1946'
    ),
    (
      'lattafa-oud-for-glory',
      'https://orientalaromas.com/cdn/shop/files/image_664a463c-b116-467e-ba37-d99f132dce23.webp?v=1693459205&width=320'
    ),
    (
      'paris-corner-khair-pistachio',
      'https://zaoud.it/cdn/shop/files/khair-pistachio-perfume-bottle-against-white-background.jpg?v=1726571259&width=1946'
    )
)
update public.products p
set image = case
  when nullif(trim(coalesce(p.image, '')), '') is not null then p.image
  else s.image
end
from image_sources s
where p.id = s.id;
