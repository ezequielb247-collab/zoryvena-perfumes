# Velmora Perfumes

Loja virtual estática em HTML, CSS e JavaScript, preparada para publicação no Render.

## Recursos

- home profissional e responsiva;
- catálogo com busca e filtros;
- 30 páginas individuais de produtos;
- carrinho, favoritos e comparação local;
- quiz de recomendação;
- checkout assistido por WhatsApp;
- painel administrativo local separado;
- políticas, SEO, sitemap e manifesto;
- estrutura pronta para imagens oficiais;
- documentação compatível com Obsidian.

## Executar localmente

Abra a pasta no VS Code e use Live Server. Alternativamente:

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500`.

## Painel administrativo local

- caminho: `/admin/`
- e-mail: `admin@velmora.local`
- senha: `velmora2026`

Este login é somente demonstrativo e não oferece segurança real. Antes do lançamento, conecte autenticação e banco de dados.

## Render

### Repositório exclusivo

Use o `render.yaml` na raiz e crie um Blueprint ou Static Site.

### Dentro do repositório Central Ezequiel

Crie um Static Site manualmente e configure:

- Root Directory: `Projetos/Velmora Perfumes/Site`
- Build Command: `echo "Site estático pronto"`
- Publish Directory: `.`
- Branch: `main`

## Antes do lançamento

1. Validar a marca no INPI.
2. Preencher WhatsApp, Instagram, e-mail e dados empresariais.
3. Inserir preços, estoque e fotos oficiais.
4. Revisar políticas com os dados reais da operação.
5. Migrar o painel para Supabase ou outro backend.
6. Integrar pagamento e frete.
