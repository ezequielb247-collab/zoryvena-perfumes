#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
mkdir -p dist

# Publica apenas os arquivos necessários para a loja pública.
cp -R assets politicas produto dist/
cp index.html catalogo.html carrinho.html checkout.html comparar.html contato.html quiz.html sobre.html 404.html dist/
cp manifest.webmanifest robots.txt sitemap.xml dist/

# O painel local permanece no código-fonte, mas não é enviado ao site público.
printf 'Build público da Zoryvena criado em dist/ (painel administrativo excluído).\n'
