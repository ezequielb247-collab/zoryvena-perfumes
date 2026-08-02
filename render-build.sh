#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
mkdir -p dist

# Publica os arquivos necessários para a loja e para o painel administrativo.
cp -R assets politicas produto admin dist/
cp index.html catalogo.html carrinho.html checkout.html cartao.html pagamento.html comparar.html contato.html quiz.html sobre.html 404.html dist/
cp manifest.webmanifest robots.txt sitemap.xml dist/

printf 'Build da Zoryvena criado em dist/ com loja, pagamentos e painel administrativo.\n'
