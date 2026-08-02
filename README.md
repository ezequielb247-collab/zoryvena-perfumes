# Zoryvena Perfumes

Loja virtual estática em HTML, CSS e JavaScript, publicada no Render e integrada ao Supabase e ao Mercado Pago.

## Recursos

- home responsiva, catálogo, busca e filtros;
- páginas individuais de produtos;
- carrinho, favoritos, comparação e quiz;
- checkout com Pix e cartão em ambiente controlado;
- painel administrativo autenticado pelo Supabase;
- autenticação em duas etapas TOTP obrigatória para ações administrativas;
- controle de acesso por RLS e RPCs protegidas;
- reserva e controle de estoque no banco de dados;
- confirmação de pagamentos no servidor e por webhook;
- políticas, SEO, sitemap, manifesto e canal de segurança.

## Executar localmente

Use Live Server no VS Code ou execute:

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500`.

## Painel administrativo

O painel está disponível em `/admin/` e aceita somente a conta administrativa cadastrada no Supabase.

Nenhuma senha, segredo de webhook, chave privada ou credencial de servidor deve ser registrada neste repositório. A primeira entrada exige a configuração de um aplicativo autenticador compatível com TOTP.

## Render

A configuração está em `render.yaml`:

- Build Command: `bash render-build.sh`
- Publish Directory: `dist`
- Branch: `main`

O build valida padrões inseguros, cria a pasta pública `dist` e publica a loja junto do painel autenticado. Cabeçalhos de segurança e regras de cache são definidos no `render.yaml`.

## Serviços externos

- Supabase: autenticação, banco, RLS, armazenamento e Edge Functions;
- Mercado Pago: Pix, cartão e confirmação de pagamento;
- Render: hospedagem do site estático;
- GitHub Actions: validação automática de segurança e build;
- Dependabot: acompanhamento das versões usadas nas Actions.

Credenciais privadas devem permanecer apenas nos Secrets dos serviços correspondentes. A chave publicável do Supabase e a Public Key do Mercado Pago podem existir no navegador, mas nunca concedem privilégios administrativos por conta própria.

## Antes do lançamento em produção

1. Concluir o cadastro legal e os dados públicos da operação.
2. Conferir procedência, notas e documentos dos fornecedores.
3. Revisar preços, estoque, imagens, frete e políticas.
4. Ativar e testar a autenticação em duas etapas da conta administrativa.
5. Configurar e testar os segredos produtivos do Mercado Pago.
6. Fazer uma compra controlada e validar pedido, pagamento, estoque e webhook.
7. Alterar o ambiente de pagamento somente depois de todos os itens anteriores.

## Segurança

Consulte `SECURITY.md` e `.well-known/security.txt` para reporte responsável e resposta a incidentes.
