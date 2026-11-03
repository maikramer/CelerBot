#!/usr/bin/env bash
# Instala/atualiza o CelerBot num device CelerOS e (opcional) o poe no boot.
#
#   tools/deploy.sh                          # primeiro device do celerctl
#   tools/deploy.sh /dev/ttyACM0            # porta explicita
#   tools/deploy.sh /dev/ttyACM0 --boot     # + /local/autostart.txt (casa)
#   tools/deploy.sh /dev/ttyACM0 --local-deps  # deps do tools/sdk/engine
#   tools/deploy.sh --no-run                # instala e nao abre o app
#
# O app mora em apps/CelerBot (app.json + main.js + modulos). O celerctl
# resolve a dep celeros.hw no hub; --local-deps usa o engine do clone do
# CelerOS (bancada sem rede ou testando uma dep mais nova).
#
# CELEROS_DIR: clone do CelerOS (default: ../CelerOS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/apps/CelerBot"
PORT=""
BOOT=0
RUN=1
LOCAL_DEPS=0

while [ $# -gt 0 ]; do
    case "$1" in
        --boot) BOOT=1 ;;
        --no-run) RUN=0 ;;
        --local-deps) LOCAL_DEPS=1 ;;
        -p|--port)
            [ $# -ge 2 ] || { echo "erro: $1 pede uma porta" >&2; exit 2; }
            PORT="$2"
            shift
            ;;
        -h|--help)
            sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*)
            echo "argumento desconhecido: $1 (use --help)" >&2
            exit 2
            ;;
        *)
            if [ -n "$PORT" ]; then
                echo "erro: porta ja definida ($PORT) e veio outra ($1)" >&2
                exit 2
            fi
            PORT="$1"
            ;;
    esac
    shift
done

if [ -z "${CELEROS_DIR:-}" ]; then
    CELEROS_DIR="$(cd "$ROOT/.." && pwd)/CelerOS"
fi
CELERCTL="$CELEROS_DIR/tools/celerctl.py"
if [ ! -f "$CELERCTL" ]; then
    echo "erro: celerctl nao encontrado em $CELERCTL" >&2
    echo "defina CELEROS_DIR para o clone do CelerOS" >&2
    exit 1
fi
if [ ! -f "$APP/app.json" ] || [ ! -f "$APP/main.js" ]; then
    echo "erro: app incompleto em $APP" >&2
    exit 1
fi

ARGS=()
if [ -n "$PORT" ]; then
    ARGS+=(-p "$PORT")
fi

INSTALL=(apps install "$APP")
if [ "$RUN" = 1 ]; then
    INSTALL+=(--run)
fi
if [ "$LOCAL_DEPS" = 1 ]; then
    INSTALL+=(--deps-local)
fi

echo "== instalando CelerBot =="
python3 "$CELERCTL" "${ARGS[@]}" "${INSTALL[@]}"

if [ "$BOOT" = 1 ]; then
    TMP="$(mktemp)"
    printf 'celeros.celerbot\n' > "$TMP"
    echo "== autostart: celeros.celerbot =="
    python3 "$CELERCTL" "${ARGS[@]}" push "$TMP" /local/autostart.txt
    rm -f "$TMP"
    echo "o device abre o CelerBot no proximo boot (substitui o autostart anterior)"
fi

echo ""
echo "logcat do robo (codigo de pareamento, keepalive, erros):"
echo "  python3 $CELERCTL ${PORT:+-p $PORT} logcat"
