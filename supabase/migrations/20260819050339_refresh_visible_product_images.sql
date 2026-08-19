-- Zoryvena Perfumes
-- Substitui imagens inadequadas dos produtos visíveis por fotos reais.
-- Esta migration altera exclusivamente public.products.image.

do $$
begin
  if (
    select count(*)
    from public.products
    where id in (
      'lattafa-asad',
      'lattafa-fakhar-black',
      'lattafa-qaed-al-fursan',
      'lattafa-yara',
      'lattafa-yara-moi',
      'lattafa-eclaire',
      'lattafa-khamrah'
    )
  ) <> 7 then
    raise exception 'Lote de imagens abortado: os 7 produtos esperados não foram encontrados.';
  end if;
end
$$;

update public.products as p
set image = source.image
from (values
  (
    'lattafa-asad',
    'https://www.lattafa-usa.com/cdn/shop/files/Asad-1_ceed76c7-7a80-46b3-b372-68cc309137f4.png?v=1747421311&width=1946'
  ),
  (
    'lattafa-fakhar-black',
    'https://www.lattafa-usa.com/cdn/shop/files/1_aa0a5a38-775b-4814-a909-837c1d360d9c.png?v=1747500778&width=1946'
  ),
  (
    'lattafa-qaed-al-fursan',
    'https://zaoud.it/cdn/shop/files/Qaed-Al-Fursan-Black-perfume-bottle-against-white-background.jpg?v=1739133527&width=1946'
  ),
  (
    'lattafa-yara',
    'https://www.lattafa-usa.com/cdn/shop/files/1_7682153c-2dce-4b60-a9e6-20557f8502cf.png?v=1747500015&width=1946'
  ),
  (
    'lattafa-yara-moi',
    'https://zaoud.it/cdn/shop/files/yara-moi-edp-perfume-botttle-against-white-background.jpg?v=1714574320&width=1946'
  ),
  (
    'lattafa-eclaire',
    'https://www.lattafa-usa.com/cdn/shop/files/Eclaire-1_5803282e-ea5b-4de5-99a5-7d06f5cbae33.png?v=1747415649&width=1946'
  ),
  (
    'lattafa-khamrah',
    'https://www.lattafa-usa.com/cdn/shop/files/Khamrah-1_0ffa4f52-30e3-4dea-9399-9bae4b8cb4af.png?v=1747421472&width=1946'
  )
) as source(id, image)
where p.id = source.id;
