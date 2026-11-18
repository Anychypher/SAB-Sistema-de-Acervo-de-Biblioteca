#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ "$PROJECT_ROOT" == '/' || "$(basename "$PROJECT_ROOT")" != 'sab-biblioteca' || ! -f "$PROJECT_ROOT/package.json" || ! -f "$PROJECT_ROOT/src/server.js" ]]; then
    echo 'Não reconheci a pasta do SAB. Nenhum arquivo foi removido.' >&2
    exit 1
fi

echo
echo 'ATENÇÃO: a desinstalação apagará permanentemente toda esta pasta do SAB.' >&2
echo 'Isso inclui o banco e os backups guardados em data, o arquivo .env com a senha, dependências, código e histórico Git.' >&2
echo 'Antes de continuar, baixe um backup pelo painel Administração e salve-o fora desta pasta.' >&2
echo 'Feche também o servidor, se estiver em execução.' >&2
read -r -p 'Para confirmar a exclusão completa, digite APAGAR SAB: ' CONFIRMATION
if [[ "$CONFIRMATION" != 'APAGAR SAB' ]]; then
    echo 'Desinstalação cancelada. Nenhum arquivo foi removido.'
    exit 0
fi

if command -v xdg-user-dir >/dev/null 2>&1; then
    DESKTOP_DIR="$(xdg-user-dir DESKTOP)"
else
    DESKTOP_DIR="$HOME/Desktop"
fi
rm -f -- "$DESKTOP_DIR/SAB Biblioteca.desktop"

cd "$HOME"
rm -rf -- "$PROJECT_ROOT"
echo 'Atalho removido e pasta do SAB apagada.'
