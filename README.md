# Zoryvena Perfumes

Loja virtual em HTML, CSS e JavaScript publicada no Render, com backend no Supabase/PostgreSQL e pagamentos integrados ao Mercado Pago.

## Estado atual

A operação está em **soft launch controlado**. O Mercado Pago está configurado em produção, o catálogo público usa dados reais do Supabase e o checkout valida preço, disponibilidade e pagamento no servidor.

A loja é exclusivamente virtual. O cliente pode combinar retirada em Macaé ou solicitar entrega. Na entrega, a cotação de frete é registrada antes da cobrança; o estoque só é revalidado e reservado quando o cliente decide iniciar o pagamento após receber o valor do frete.

## Recursos

- home responsiva, catálogo, busca e filtros;
- páginas individuais de produtos;
- carrinho, favoritos, comparação e quiz;
- checkout com Pix e cartão pelo Mercado Pago;
- entrega com cotação manual registrada antes do pagamento;
- retirada combinada em Macaé;
- painel administrativo autenticado pelo Supabase;
- autenticação em duas etapas TOTP obrigatória para ações administrativas sensíveis;
- controle de acesso por RLS e RPCs protegidas;
- reserva e controle de estoque no banco de dados;
- confirmação e reconciliação de pagamentos no servidor e por webhook;
- políticas, SEO, sitemap, manifesto e canal de segurança;
- testes de regressão, build e smoke tests contra catálogo e Edge Functions ao vivo.

## Executar localmente

Use Live Server no VS Code ou execute:

```bash
python -m http.server 5500
```

Acesse `http://localhost:5500`.

## Painel administrativo

O painel está disponível em `/admin/` e aceita somente a conta administrativa cadastrada no Supabase.

Nenhuma senha, segredo de webhook, chave privada ou credencial de servidor deve ser registrada neste repositório. Ações administrativas sensíveis exigem MFA/TOTP verificado.

## Render

A configuração está em `render.yaml`:

- Build Command: `bash render-build.sh`
- Publish Directory: `dist`
- Branch: `main`

O build valida padrões inseguros, cria a pasta pública `dist`, elimina comunicação comercial legada de páginas históricas e publica a loja junto do painel autenticado. Cabeçalhos de segurança e regras de cache são definidos no `render.yaml`.

## Serviços externos

- Supabase: autenticação, banco, RLS, armazenamento, RPCs e Edge Functions;
- Mercado Pago: Pix, cartão e confirmação de pagamento;
- Render: hospedagem do site estático;
- GitHub Actions: regressões, validações de segurança, build e smoke tests ao vivo;
- Dependabot: acompanhamento das versões usadas nas Actions.

Credenciais privadas devem permanecer apenas nos Secrets dos serviços correspondentes. A chave publicável do Supabase e a Public Key do Mercado Pago podem existir no navegador, mas não concedem privilégios administrativos por conta própria.

## Regras de operação antes de ampliar a divulgação

1. Revisar preços, custos, estoque e imagens antes de cada campanha.
2. Manter a comunicação transparente enquanto a documentação de procedência do fornecedor não estiver disponível; a exceção operacional registrada não deve ser apresentada como prova de procedência.
3. Manter MFA administrativo ativo.
4. Não remover as validações produtivas, webhook e smoke tests do Mercado Pago.
5. Fazer uma compra controlada ponta a ponta após mudanças relevantes no checkout ou pagamento.
6. Validar o fluxo de entrega: solicitação de cotação → frete informado → pagamento → estoque → preparação.
7. Definir domínio próprio antes de escalar anúncios, se essa for a estratégia comercial.

## Segurança

Consulte `SECURITY.md` e `.well-known/security.txt` para reporte responsável e resposta a incidentes.
