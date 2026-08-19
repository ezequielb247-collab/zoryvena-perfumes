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

## Segundo lote seguro

O lote `20260819022922_supplier_catalog_batch_02.sql` adiciona mais três correspondências confirmadas que já existiam no catálogo-base. Ele foi originalmente preparado e mergeado no PR #20 como `20260817153000_supplier_catalog_batch_02.sql`; ao ser aplicado pelo endpoint de migrações do Supabase em 18/08/2026 (horário de Brasília), o histórico remoto recebeu a versão `20260819022922`, e o arquivo versionado foi alinhado para evitar drift entre Git e banco.

Produtos:

- `L’AVENTUI` → **L’Aventure**, Al Haramain, custo R$ 270;
- `FAKHAR ROSE` → **Fakhar Rose**, Lattafa, custo R$ 175;
- `CLUB DE NUIT INTENSE WOMAM` → **Club de Nuit Intense Woman**, Armaf, custo R$ 220.

O lote segue exatamente as mesmas regras do lote 1: preserva preços existentes, não inventa estoque físico, habilita somente encomenda e usa foto real apenas quando o cadastro ainda não possui imagem. A referência do Fakhar Rose usa host já autorizado na política de imagens, sem ampliar a CSP.

Validação pós-aplicação do lote 2:

- 3/3 produtos encontrados;
- 3/3 custos conferidos;
- 3/3 preços de cartão preservados;
- 3/3 preços Pix preservados;
- 3/3 estoques físicos preservados em zero;
- 3/3 imagens reais de referência presentes;
- 3/3 produtos ativos e com encomenda habilitada;
- 3/3 produtos expostos pelo RPC público da vitrine.

## Duplicidades e conflitos detectados

Não publicar automaticamente antes de resolver:

- `SALVO INTENSE`: apareceu com custo R$ 140 e R$ 150;
- `QIMMAH`: apareceu nos grupos masculino e feminino com custos diferentes;
- `CLUB DE NUIT PRIVATE KEY`: apareceu nos dois grupos com custos diferentes;
- `QUEEN`: apareceu disponível e também na seção “Em falta”;
- `ANA ABIYEDH ROUGE`: apareceu disponível e também na seção “Em falta”;
- grafias como `KHAMRAH DUKHAM`, `HES CONFESSION` e similares devem ser normalizadas somente após confirmar o produto correto.

## Regra para imagens

Prioridade:

1. foto própria;
2. imagem fornecida/autorizada pelo fornecedor;
3. imagem oficial do fabricante;
4. referência real temporária de varejista confiável, somente quando necessária e com host explicitamente permitido.

Nunca usar imagem gerada por IA como foto de produto real. Hosts externos ficam em allowlist explícito no storefront e na CSP; não usar curinga geral de imagens.

O objetivo continua sendo migrar as referências temporárias para fotos próprias ou autorizadas armazenadas no Supabase Storage.

## Cobertura de imagens do catálogo

Em 19/08/2026 foi preparado o lote `20260819033000_complete_product_images.sql` para completar os cadastros-base que ainda estavam sem foto.

Antes dessa mudança, todos os produtos efetivamente expostos na vitrine já possuíam imagem. Os dez cadastros abaixo estavam sem imagem e permanecem com o mesmo estado comercial; adicionar a foto **não ativa venda, não habilita encomenda e não altera preço, custo ou estoque**:

- `afnan-9pm` — 9PM;
- `lattafa-asad-bourbon` — Asad Bourbon;
- `afnan-supremacy-not-only-intense` — Supremacy Not Only Intense;
- `lattafa-hayaati` — Hayaati;
- `maison-alhambra-jean-lowe-immortel` — Jean Lowe Immortel;
- `lattafa-mayar` — Mayar;
- `afnan-9pm-pour-femme` — 9PM Pour Femme;
- `lattafa-honor-and-glory` — Bade’e Al Oud Honor & Glory;
- `lattafa-oud-for-glory` — Bade’e Al Oud Oud for Glory;
- `paris-corner-khair-pistachio` — Khair Pistachio.

As identidades foram conferidas em páginas de fabricante quando disponíveis, incluindo Afnan, Lattafa e Paris Corner. Para manter a política de segurança já implantada, os arquivos usados no cadastro vêm apenas de `zaoud.it` e `orientalaromas.com`, dois hosts reais de varejistas que já estavam explicitamente autorizados no storefront e na CSP. Essas referências continuam sendo temporárias e devem ser substituídas por foto própria, fornecedor ou arquivo oficial armazenado no Supabase Storage quando disponível.

A migration possui trava atômica para os dez IDs e só preenche `image` quando o campo ainda está vazio; uma imagem existente nunca é sobrescrita.

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
