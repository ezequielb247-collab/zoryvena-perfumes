#!/usr/bin/env bash
set -euo pipefail

fail_build() {
  printf 'Falha de segurança no build: %s\n' "$1" >&2
  exit 1
}

# Impede que padrões perigosos voltem ao HTML público.
if grep -RInE --include='*.html' --exclude-dir=.git --exclude-dir=dist \
  '\son[a-zA-Z]+[[:space:]]*=' .; then
  fail_build 'atributo de evento inline encontrado no HTML.'
fi

if grep -RInE --include='*.html' --exclude-dir=.git --exclude-dir=dist \
  '<script([^>]*)>[[:space:]]*[^<[:space:]]' .; then
  fail_build 'script inline encontrado no HTML.'
fi

# Bloqueia formatos comuns de chave privada ou segredo de servidor no repositório público.
if grep -RInE --exclude-dir=.git --exclude-dir=dist \
  --include='*.js' --include='*.json' --include='*.html' --include='*.yaml' --include='*.yml' \
  '(-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|sk_(live|test)_[A-Za-z0-9_-]{16,}|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*["'"'][^"'"']{16,}|MERCADO_PAGO_ACCESS_TOKEN[^[:space:]]*[[:space:]]*[:=][[:space:]]*["'"'][^"'"']{16,})' .; then
  fail_build 'possível segredo privado encontrado em arquivo público.'
fi

rm -rf dist
mkdir -p dist/.well-known

# Publica somente os arquivos necessários para a loja e o painel administrativo.
cp -R assets politicas produto admin dist/
cp index.html catalogo.html carrinho.html checkout.html cartao.html pagamento.html comparar.html contato.html quiz.html sobre.html 404.html dist/
cp manifest.webmanifest robots.txt sitemap.xml dist/
cp .well-known/security.txt dist/.well-known/security.txt

printf 'Build seguro da Zoryvena criado em dist/.\n'
