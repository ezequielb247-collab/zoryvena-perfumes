#!/usr/bin/env bash
set -euo pipefail

fail_build() {
  printf 'Falha de segurança no build: %s\n' "$1" >&2
  exit 1
}

# Impede que atributos de eventos JavaScript voltem ao HTML público.
inline_event_matches="$(
  grep -RInE --include='*.html' --exclude-dir=.git --exclude-dir=dist \
    '\son[a-zA-Z]+[[:space:]]*=' . || true
)"
if [[ -n "$inline_event_matches" ]]; then
  printf '%s\n' "$inline_event_matches" >&2
  fail_build 'atributo de evento inline encontrado no HTML.'
fi

# Bloqueia JavaScript executável inline, mas permite JSON-LD não executável usado no SEO.
inline_script_matches="$(
  grep -RInE --include='*.html' --exclude-dir=.git --exclude-dir=dist \
    '<script([^>]*)>[[:space:]]*[^<[:space:]]' . || true
)"
if [[ -n "$inline_script_matches" ]]; then
  unsafe_inline_scripts="$(
    printf '%s\n' "$inline_script_matches" \
      | grep -vE 'type=["'"'"']application/ld\+json["'"'"']' || true
  )"
  if [[ -n "$unsafe_inline_scripts" ]]; then
    printf '%s\n' "$unsafe_inline_scripts" >&2
    fail_build 'script executável inline encontrado no HTML.'
  fi
fi

# Bloqueia formatos comuns de chave privada ou segredo de servidor no repositório público.
secret_matches="$(
  grep -RInE --exclude-dir=.git --exclude-dir=dist \
    --include='*.js' --include='*.json' --include='*.html' --include='*.yaml' --include='*.yml' \
    '(-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|sk_(live|test)_[A-Za-z0-9_.-]{16,}|SUPABASE_SERVICE_ROLE_KEY.{0,12}[:=].{0,6}[A-Za-z0-9_.-]{16,}|MERCADO_PAGO_ACCESS_TOKEN.{0,40}[:=].{0,6}[A-Za-z0-9_.-]{16,})' . || true
)"
if [[ -n "$secret_matches" ]]; then
  printf '%s\n' "$secret_matches" >&2
  fail_build 'possível segredo privado encontrado em arquivo público.'
fi

rm -rf dist
mkdir -p dist/.well-known

# Publica somente os arquivos necessários para a loja e o painel administrativo.
cp -R assets politicas produto admin dist/
cp index.html catalogo.html carrinho.html checkout.html cartao.html pagamento.html frete.html comparar.html contato.html quiz.html sobre.html 404.html dist/
cp manifest.webmanifest robots.txt sitemap.xml dist/
cp .well-known/security.txt dist/.well-known/security.txt

# Alguns HTMLs de produtos antigos permanecem no repositório para preservar URLs históricas.
# O build normaliza qualquer comunicação comercial antiga antes de publicar esses arquivos.
while IFS= read -r -d '' page; do
  sed -i \
    -e 's/🚚 Frete grátis para todo o Brasil nas compras acima de R\$ 299/📦 Entrega com cotação antes do pagamento • Retirada combinada em Macaé/g' \
    -e 's/Informações comerciais e empresariais serão preenchidas antes do lançamento\./Compra segura e atendimento exclusivamente pelos canais oficiais./g' \
    "$page"
done < <(find dist/produto -type f -name 'index.html' -print0)

if grep -RInF --include='*.html' 'Frete grátis para todo o Brasil' dist/produto; then
  fail_build 'página legada de produto ainda promete frete grátis.'
fi
if grep -RInF --include='*.html' 'Informações comerciais e empresariais serão preenchidas antes do lançamento' dist/produto; then
  fail_build 'página legada de produto ainda contém copy de pré-lançamento.'
fi

# Confere os arquivos essenciais antes de entregar o diretório ao Render.
test -f dist/index.html || fail_build 'página inicial ausente no dist.'
test -f dist/admin/index.html || fail_build 'painel administrativo ausente no dist.'
test -f dist/checkout.html || fail_build 'checkout ausente no dist.'
test -f dist/frete.html || fail_build 'página de cotação de frete ausente no dist.'
test -f dist/.well-known/security.txt || fail_build 'security.txt ausente no dist.'

printf 'Build seguro da Zoryvena criado em dist/.\n'
