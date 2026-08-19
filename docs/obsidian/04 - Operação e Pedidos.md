# Operação e Pedidos

## Fluxo pretendido

### Retirada em Macaé

1. Cliente escolhe o produto.
2. Carrinho calcula subtotal.
3. Cliente informa os dados e escolhe retirada em Macaé.
4. Pedido é criado e o cliente segue para Pix ou cartão.
5. Pagamento é aprovado.
6. Estoque é baixado conforme a confirmação do pagamento.
7. Retirada é combinada com o cliente.

### Entrega com frete cotado

1. Cliente escolhe o produto.
2. Carrinho calcula subtotal.
3. Cliente informa endereço, forma de pagamento e escolhe receber no endereço.
4. O site registra uma solicitação de cotação de frete sem gerar cobrança e sem reservar estoque.
5. O cliente é direcionado para `/frete.html`, onde acompanha a cotação pelo link seguro do pedido.
6. A Zoryvena informa o valor do frete no painel administrativo.
7. Quando a cotação estiver disponível, o cliente usa o botão **Continuar para o pagamento** no mesmo link.
8. Antes de gerar Pix ou cartão, o sistema confere novamente preço e disponibilidade e reserva o estoque por tempo limitado.
9. Pagamento é aprovado e o pedido segue para separação e envio.
10. Código de rastreio é comunicado quando aplicável.

> O checkout de entrega não deve redirecionar diretamente para o WhatsApp. O WhatsApp fica como canal de atendimento durante a cotação; o pagamento continua pelo link seguro de frete do próprio site.

## Correção validada em 2026-08-19

Durante um teste controlado com CEP `01001-000` (São Paulo/SP), a etapa **Continuar para o pagamento** revelou uma falha em `prepare_shipping_order_payment`: a função tentava atualizar `order_items.line_total`, mas essa coluna é gerada automaticamente pelo Postgres.

A correção remove a atribuição manual de `line_total`. O valor continua sendo recalculado automaticamente a partir dos campos base da linha, enquanto a função segue atualizando SKU, produto, marca, preço unitário, quantidade pronta e quantidade sob encomenda antes de reservar o pedido.

## Status

- Aguardando confirmação
- Aguardando cotação de frete
- Frete cotado
- Aguardando pagamento
- Pagamento em análise
- Pagamento aprovado
- Separando pedido
- Enviado
- Entregue
- Cancelado
