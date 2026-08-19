# Catálogo e Fornecedor

## Estado em 17/08/2026

Foi recebida uma nova lista ampla do fornecedor, separada em masculinos, femininos e itens em falta.

A lista representa **disponibilidade no fornecedor**, não estoque físico da Zoryvena. Por isso:

- nunca criar estoque de pronta entrega a partir da lista;
- produto disponível no fornecedor pode entrar como `preorder_enabled`;
- produto marcado como em falta não pode aceitar nova encomenda;
- se um item em falta ainda tiver estoque físico na Zoryvena, esse estoque continua vendável;
- conflitos de grafia, gênero, preço de custo ou identidade devem ficar fora da publicação até confirmação.

## Política de preço

Preços já cadastrados no banco são preservados.

Para um produto sem preço, a primeira regra operacional usa contribuição bruta suficiente para taxas, descontos e divisão entre duas pessoas:

- custo até R$ 220: acrescentar R$ 100 no cartão e R$ 80 no Pix;
- custo de R$ 220,01 a R$ 300: acrescentar R$ 120 no cartão e R$ 100 no Pix;
- custo de R$ 300,01 a R$ 400: acrescentar R$ 140 no cartão e R$ 120 no Pix;
- acima de R$ 400: acrescentar R$ 160 no cartão e R$ 140 no Pix.

O resultado é arredondado para preço terminado em `,90`. Isso é regra inicial de margem, não promessa de lucro líquido: impostos, taxas, frete subsidiado, perdas e descontos precisam ser considerados na revisão comercial.

## Primeiro lote seguro

O lote `20260819021934_supplier_catalog_batch_01.sql` cobre apenas correspondências inequívocas já existentes no catálogo-base. Ele foi originalmente preparado no PR #19 como `20260817150000_supplier_catalog_batch_01.sql`; ao ser aplicado pelo endpoint de migrações do Supabase em 18/08/2026 (horário de Brasília), o histórico remoto recebeu a versão `20260819021934`, e o arquivo versionado foi alinhado para evitar drift entre Git e banco.

Ele:

- atualiza o custo recebido do fornecedor;
- preserva preços de cartão e Pix que já existam;
- calcula preço apenas quando estiver ausente;
- não altera estoque físico;
- habilita encomenda apenas para itens informados como disponíveis;
- mantém a foto existente quando já houver uma;
- preenche foto real de referência quando o cadastro estava sem imagem;
- desabilita encomenda de itens do catálogo-base explicitamente marcados como em falta.

Validação pós-aplicação do lote 1:

- 21/21 produtos disponíveis encontrados;
- 21/21 custos conferidos;
- 21/21 preços de cartão preservados;
- 21/21 preços Pix preservados;
- 21/21 estoques físicos preservados;
- 21/21 imagens presentes;
- 21/21 produtos disponíveis com encomenda habilitada;
- 4/4 itens em falta com encomenda desabilitada e estoque físico preservado.

## Duplicidades e conflitos detectados

Não publicar automaticamente antes de resolver:

- `SALVO INTENSE`: apareceu com custo R$ 140 e R$ 150;
- `QIMMAH`: apareceu nos grupos masculino e feminino com custos diferentes;
- `CLUB DE NUIT PRIVATE KEY`: apareceu nos dois grupos com custos diferentes;
- `QUEEN`: apareceu disponível e também na seção “Em falta”;
- `ANA ABIYEDH ROUGE`: apareceu disponível e também na seção “Em falta”;
- grafias como `KHAMRAH DUKHAM`, `L’AVENTUI`, `HES CONFESSION`, `WOMAM` e similares devem ser normalizadas somente após confirmar o produto correto.

## Regra para imagens

Prioridade:

1. foto própria;
2. imagem fornecida/autorizada pelo fornecedor;
3. imagem oficial do fabricante;
4. referência real temporária de varejista confiável, somente quando necessária e com host explicitamente permitido.

Nunca usar imagem gerada por IA como foto de produto real. Hosts externos ficam em allowlist explícito no storefront e na CSP; não usar curinga geral de imagens.

O objetivo continua sendo migrar as referências temporárias para fotos próprias ou autorizadas armazenadas no Supabase Storage.

## Dados que ainda queremos manter por produto

- nome e marca;
- volume;
- custo;
- estoque físico real;
- disponibilidade no fornecedor;
- lote e origem;
- foto autorizada;
- condição de pagamento;
- prazo de reposição.

## Cadastro

Use o template [[Templates/Produto]].
