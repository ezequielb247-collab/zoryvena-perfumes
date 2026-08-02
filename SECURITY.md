# Segurança da Zoryvena Perfumes

## Reporte responsável

Possíveis vulnerabilidades, acessos indevidos ou vazamentos devem ser enviados de forma privada para **zoryvenaperfumes@gmail.com** com o assunto `SEGURANÇA — Zoryvena`.

Não publique detalhes técnicos, dados de clientes, tokens, chaves, capturas do painel ou passos de exploração em issues públicas, redes sociais ou grupos.

Inclua apenas o necessário:

- página ou função afetada;
- horário aproximado;
- comportamento observado;
- impacto estimado;
- passos seguros para reprodução, sem dados reais de terceiros.

Nunca envie número completo de cartão, CVV, senha, Access Token, chave `service_role`, segredo de webhook ou QR Code de MFA.

## Prioridades de resposta

- **Crítica:** acesso a pedidos/clientes, alteração de preço ou estoque, pagamento divergente, credencial privada exposta ou controle do painel.
- **Alta:** quebra de autenticação, upload não autorizado, XSS persistente, bypass de RLS ou assinatura de webhook.
- **Média:** exposição limitada sem dados pessoais, abuso com impacto restrito ou configuração insegura sem exploração confirmada.
- **Baixa:** melhoria de cabeçalho, informação pública não sensível ou problema sem impacto de segurança demonstrável.

## Contenção imediata

Em incidente crítico ou alto:

1. colocar a loja em modo de preparação e manter pagamentos produtivos desativados;
2. revogar sessões administrativas e trocar a senha do administrador;
3. revisar e, quando necessário, rotacionar os segredos do Mercado Pago e do Supabase;
4. preservar logs do Supabase, Mercado Pago, Render e GitHub;
5. verificar alterações em produtos, configurações, pedidos, cupons e administradores na trilha de auditoria;
6. bloquear o vetor antes de restaurar a operação;
7. avaliar comunicação a clientes e autoridades conforme o impacto e as obrigações legais.

## Regras permanentes

- O painel exige senha forte e autenticação em duas etapas.
- Credenciais privadas ficam somente nos Secrets do Supabase e nunca no GitHub ou navegador.
- Alterações administrativas passam por RPCs validadas e auditadas.
- Pagamentos são confirmados apenas após consulta ao Mercado Pago, validação de valor, método, referência e assinatura do webhook.
- Imagens enviadas são decodificadas, redimensionadas, regravadas em WebP e limitadas por tamanho e caminho.
- Dependências e verificações de segurança devem permanecer ativas no GitHub.

## Escopo

Esta política cobre o site público, checkout, painel administrativo, banco Supabase, Edge Functions, armazenamento de imagens, integração Mercado Pago e configuração de deploy da Zoryvena Perfumes.
