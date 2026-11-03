#!/usr/bin/env bash
# Compila o CelerOS do ESP32-S3 DevKitC-1 para o CelerBot.
#
# Duas variantes (o fragmento entra por cima dos defaults da placa):
#   (padrao) console na USB nativa (USJ) — um cabo so; PCA em 21/47/48.
#   --uart   console na UART0 (USB-C "UART"); sem USB host/USJ, libera
#            GPIO19/20 para o I2C (PCA em 21/20/19).
#
#   tools/build-firmware.sh            # build-celerbot (USJ)
#   tools/build-firmware.sh --uart     # build-celerbot-uart (UART)
#   tools/build-firmware.sh --fresh    # apaga o sdkconfig do build e regera
#
# Variaveis: CELEROS_DIR (default: ../CelerOS), BUILD (default por variante).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRAG_USJ="$ROOT/firmware/devkit-s3-celerbot.defaults"
FRAG_UART="$ROOT/firmware/devkit-s3-celerbot-uart.defaults"
FRAG=""
BUILD="${BUILD:-}"
FRESH=0
UART=0

for arg in "$@"; do
    case "$arg" in
        --fresh) FRESH=1 ;;
        --uart) UART=1 ;;
        -h|--help)
            sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "argumento desconhecido: $arg (use --uart, --fresh ou --help)" >&2
            exit 2
            ;;
    esac
done

if [ "$UART" = 1 ]; then
    FRAG="$FRAG_UART"
    [ -n "$BUILD" ] || BUILD="build-celerbot-uart"
else
    FRAG="$FRAG_USJ"
    [ -n "$BUILD" ] || BUILD="build-celerbot"
fi

if [ -z "${CELEROS_DIR:-}" ]; then
    CELEROS_DIR="$(cd "$ROOT/.." && pwd)/CelerOS"
fi
if [ ! -f "$CELEROS_DIR/CMakeLists.txt" ] || [ ! -d "$CELEROS_DIR/boards/devkit-s3" ]; then
    echo "erro: clone do CelerOS nao encontrado em $CELEROS_DIR" >&2
    echo "defina CELEROS_DIR para a arvore do CelerOS" >&2
    exit 1
fi
if [ ! -f "$FRAG" ]; then
    echo "erro: fragmento ausente: $FRAG" >&2
    exit 1
fi

cd "$CELEROS_DIR"

if [ "$FRESH" = 1 ]; then
    rm -f "$BUILD/sdkconfig"
    echo "sdkconfig de $BUILD apagado (--fresh)"
fi

# sdkconfig.defaults so chega num build dir existente se o sdkconfig for
# regerado. Falhar alto e melhor que compilar sem BT e o robo nao parear.
if [ -f "$BUILD/sdkconfig" ] && ! grep -q '^CONFIG_BT_ENABLED=y' "$BUILD/sdkconfig"; then
    echo "erro: $BUILD/sdkconfig existe SEM Bluetooth (gerado antes deste fragmento)." >&2
    echo "rode de novo com --fresh (apaga so o sdkconfig; os objetos ficam)." >&2
    exit 1
fi

# ESP-IDF 6.1 (~/esp/v6.1/esp-idf). O export.sh procura o env python do IDF:
# nao deixe o python 3.13 do uv na frente do PATH antes de chama-lo.
if ! command -v idf.py >/dev/null 2>&1; then
    IDF_PATH="${IDF_PATH:-$HOME/esp/v6.1/esp-idf}"
    if [ ! -f "$IDF_PATH/export.sh" ]; then
        echo "erro: ESP-IDF 6.1 nao encontrado em $IDF_PATH" >&2
        echo "instale/aponte IDF_PATH ou rode get_idf numa shell limpa" >&2
        exit 1
    fi
    # shellcheck disable=SC1090
    . "$IDF_PATH/export.sh" >/dev/null 2>&1 || true
fi

IDF=()
if command -v idf.py >/dev/null 2>&1; then
    IDF=(idf.py)
else
    IDF=(python3 "$IDF_PATH/tools/idf.py")
fi

echo "== CelerOS devkit-s3 + Celer Link (BT) =="
echo "   arvore:  $CELEROS_DIR"
echo "   build:   $BUILD"
echo "   extra:   $FRAG"
echo -n "   idf:     "
"${IDF[@]}" --version | head -1
"${IDF[@]}" -B "$BUILD" \
    -DSDKCONFIG="$BUILD/sdkconfig" \
    -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;boards/devkit-s3/sdkconfig.defaults;$FRAG" \
    -DCELEROS_BOARD=devkit-s3 set-target esp32s3
"${IDF[@]}" -B "$BUILD" build

echo ""
echo "firmware: $CELEROS_DIR/$BUILD/CelerOS.bin"
if [ "$UART" = 1 ]; then
    echo "grave pela USB nativa (USJ) enquanto ela existir; depois o console"
    echo "e o flash passam para a USB-C rotulada UART (CP2102N):"
    echo "  idf.py -B $BUILD -p /dev/ttyACM0 flash   # antes da troca"
    echo "  idf.py -B $BUILD -p /dev/ttyUSB1 flash   # depois"
else
    echo "grave pela USB-C rotulada USB (nativa, /dev/ttyACM0):"
    echo "  idf.py -B $BUILD -p /dev/ttyACM0 flash"
fi
