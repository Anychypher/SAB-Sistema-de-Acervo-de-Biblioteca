#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo 'Node.js 20+ e npm são necessários. Instale o Node.js LTS (https://nodejs.org/) e rode este script novamente.' >&2
    exit 1
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
    echo "É necessário Node.js 20 ou superior. Versão encontrada: $(node --version)" >&2
    exit 1
fi

echo 'Instalando as dependências do SAB...'
npm install

read -r -s -p 'Crie a senha secreta de recuperação do administrador: ' ADMIN_PASSWORD
echo
read -r -s -p 'Confirme a senha de recuperação: ' ADMIN_CONFIRMATION
echo
if (( ${#ADMIN_PASSWORD} < 8 || ${#ADMIN_PASSWORD} > 200 )); then
    echo 'A senha precisa ter entre 8 e 200 caracteres.' >&2
    exit 1
fi
if [[ "$ADMIN_PASSWORD" != "$ADMIN_CONFIRMATION" ]]; then
    echo 'As senhas não coincidem.' >&2
    exit 1
fi

ENV_FILE="$PROJECT_ROOT/.env"
TEMP_ENV="$PROJECT_ROOT/.env.tmp"
if [[ -f "$ENV_FILE" ]]; then
    grep -v '^ADMIN_RECOVERY_PASSWORD=' "$ENV_FILE" > "$TEMP_ENV" || true
else
    : > "$TEMP_ENV"
fi
printf 'ADMIN_RECOVERY_PASSWORD=%s\n' "$ADMIN_PASSWORD" >> "$TEMP_ENV"
mv "$TEMP_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"
chmod +x "$PROJECT_ROOT/instalacao/executar-linux.sh"
unset ADMIN_PASSWORD ADMIN_CONFIRMATION

if command -v xdg-user-dir >/dev/null 2>&1; then
    DESKTOP_DIR="$(xdg-user-dir DESKTOP)"
else
    DESKTOP_DIR="$HOME/Desktop"
fi
mkdir -p "$DESKTOP_DIR"
DESKTOP_FILE="$DESKTOP_DIR/SAB Biblioteca.desktop"
RUNNER_PATH="$(printf '%s' "$PROJECT_ROOT/instalacao/executar-linux.sh" | sed 's/%/%%/g')"
ICON_PATH="$(printf '%s' "$PROJECT_ROOT/public/img/logo.png" | sed 's/%/%%/g')"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=SAB - Sistema de Acervo de Biblioteca
Comment=Iniciar o sistema da biblioteca
Exec="$RUNNER_PATH"
Icon=$ICON_PATH
Terminal=false
Categories=Office;Education;
EOF
chmod +x "$DESKTOP_FILE"

echo "Instalação concluída. Atalho criado na área de trabalho: $DESKTOP_FILE"
