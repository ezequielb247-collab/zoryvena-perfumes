-- Referências visuais verificadas para o catálogo inicial.
-- As URLs externas são temporárias e devem ser substituídas por arquivos
-- autorizados pelo fornecedor ou fotos próprias armazenadas no Supabase.

update public.products
set image = 'https://images.tcdn.com.br/img/img_prod/1361374/perfume_watani_al_wataniah_707_1_aca910c1b9c7f982daa5aadb69e19e6a.jpg',
    updated_at = now()
where id = 'al-wataniah-watani';

update public.products
set image = 'https://orientalaromas.com/cdn/shop/files/375x500.78154_590x767.jpg?v=1701447272',
    volume = '85 ml',
    updated_at = now()
where id = 'al-wataniah-durrat-al-aroos';

update public.products
set image = 'https://zaoud.it/cdn/shop/files/sabah-al-ward-perfume-bottle-beside-box-shows-against-white-background.jpg?v=1716425079&width=1946',
    updated_at = now()
where id = 'al-wataniah-sabah-al-ward';

update public.products
set image = 'https://media.zid.store/f38179ec-0568-4ea0-8b3d-faca5a202a53/c4966239-5e20-4773-b70f-4362f9bea24c.jpg',
    updated_at = now()
where id = 'maison-alhambra-rose-seduction-vip-pour-femme';

update public.products
set image = 'https://lattafa-brasil.com/products/yara.webp',
    updated_at = now()
where id = 'lattafa-yara';
