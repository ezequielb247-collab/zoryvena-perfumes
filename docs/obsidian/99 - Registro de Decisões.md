# Registro de Decisões

## 2026-07 — Nome inicial

A marca de trabalho será **Zoryvena Perfumes**, sujeita à estratégia de validação e registro no INPI.

## 2026-07 — Catálogo

A operação começará com perfumes árabes masculinos, femininos e unissex mais procurados.

## 2026-07 — Tecnologia inicial

O MVP começou como site estático hospedado no Render, com evolução planejada para backend real.

## 2026-07 — Imagens

Usar fotos oficiais/autorizadas em vez de imagens geradas.

## 2026-08 — Backend e segurança

O backend passou a usar Supabase/PostgreSQL, com RLS/RPCs, Edge Functions, autenticação administrativa e MFA para ações sensíveis. Estoque e pedidos são validados no servidor e o navegador não tem credenciais administrativas.

## 2026-08 — Pagamentos

Mercado Pago foi adotado para Pix e cartão. A aprovação do pagamento não depende apenas do navegador: o servidor valida identificadores, valor, método e status com o Mercado Pago, usando webhook e reconciliação.

## 2026-08 — Procedência

A documentação de procedência do fornecedor ainda não está disponível. Foi registrada uma exceção operacional; a loja não deve apresentar procedência documental como comprovada enquanto essa documentação não existir.

## 2026-08 — Entrega

A loja permanece virtual. Retirada em Macaé é combinada individualmente. Para entrega, a cotação de frete deve ser registrada antes da cobrança.

A solicitação de cotação não reserva estoque. Depois que o frete é informado e o cliente decide pagar, preço e disponibilidade são revalidados no servidor; só então o estoque elegível é reservado por tempo limitado e a cobrança é iniciada.

## 2026-08 — Controle de versão do checkout

Edge Functions críticas do checkout devem permanecer versionadas no GitHub, mesmo quando o deploy ocorre no Supabase. Produção não deve depender de função existente apenas no ambiente remoto.
