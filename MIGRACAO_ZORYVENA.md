# Migração para Zoryvena Perfumes

## Alterações aplicadas

- Velmora Perfumes → Zoryvena Perfumes
- VELMORA → ZORYVENA
- monograma VM → ZV
- @velmoraperfumes → @zoryvenaperfumes
- admin@velmora.local → admin@zoryvena.local
- senha local demonstrativa → zoryvena2026
- chaves de armazenamento local → zoryvena.*
- URL prevista → https://zoryvena-perfumes.onrender.com
- nome do serviço no render.yaml → zoryvena-perfumes
- sitemap, links canônicos, manifesto, políticas, páginas e documentação atualizados

## GitHub

Renomear o repositório `velmora-perfumes` para `zoryvena-perfumes` em:

Settings → General → Repository name

Depois, no computador, atualizar o endereço remoto:

```bash
git remote set-url origin https://github.com/ezequielb247-collab/zoryvena-perfumes.git
git add .
git commit -m "Renomeia marca para Zoryvena Perfumes"
git push
```

## Render

No serviço atual, abra Settings e altere o nome para `zoryvena-perfumes` quando o Render permitir. Caso a URL antiga permaneça, crie um novo Static Site/Blueprint usando o repositório renomeado.

Configuração:

- Build Command: `bash render-build.sh`
- Publish Directory: `dist`
- Branch: `main`

## Observação

A troca de nome no código não substitui uma busca formal e o pedido de registro no INPI.
