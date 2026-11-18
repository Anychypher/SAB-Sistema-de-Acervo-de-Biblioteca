#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
if [[ ! -d node_modules ]]; then
    echo 'Dependências não encontradas. Rode bash instalacao/instalar-linux.sh primeiro.' >&2
    exit 1
fi

PORT_TO_OPEN="${PORT:-}"
if [[ -z "$PORT_TO_OPEN" && -f .env ]]; then
    PORT_TO_OPEN="$(sed -n 's/^PORT=\([0-9][0-9]*\)$/\1/p' .env | head -n 1)"
fi
PORT_TO_OPEN="${PORT_TO_OPEN:-8001}"
URL="http://localhost:${PORT_TO_OPEN}"
server_responding() {
    node -e "const request=require('http').get(process.argv[1], (response) => process.exit(response.statusCode === 200 ? 0 : 1)); request.setTimeout(1500, () => { request.destroy(); process.exit(1); }); request.on('error', () => process.exit(1));" "$URL" >/dev/null 2>&1
}

if ! server_responding; then
    echo "Iniciando o servidor em $URL ..."
    nohup npm start > "$PROJECT_ROOT/server.log" 2>&1 < /dev/null &
    echo $! > "$PROJECT_ROOT/.server.pid"
    SERVER_READY=false
    for _ in $(seq 1 40); do
        if server_responding; then
            SERVER_READY=true
            break
        fi
        sleep 1
    done
    if [[ "$SERVER_READY" != true ]]; then
        echo "O servidor não respondeu em $URL. Consulte server.log." >&2
        exit 1
    fi
fi

if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
elif command -v gio >/dev/null 2>&1; then
    gio open "$URL" >/dev/null 2>&1 &
else
    echo "Não encontrei um abridor de navegador. Acesse manualmente: $URL"
    exit 0
fi
echo "SAB aberto no navegador padrão: $URL"
