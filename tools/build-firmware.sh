#!/usr/bin/env bash
# Compila o CelerOS do ESP32-S3 DevKitC-1 com o Bluetooth do Celer Link.
#
# O fragmento firmware/devkit-s3-bt.defaults entra por cima dos defaults da
# placa; o build dir e proprio (build-celerbot) para nao sobrescrever o
# build-devkit-s3 de outros experimentos.
#
#   tools/build-firmware.sh            # configura (se preciso) e compila
#   tools/build-firmware.sh --fresh    # apaga build-celerbot/sdkconfig e regera
#
# Variaveis: CELEROS_DIR (default: ../CelerOS), BUILD (default: build-celerbot).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRAG="$ROOT/firmware/devkit-s3-bt.defaults"
BUILD="${BUILD:-build-celerbot}"
FRESH=0

for arg in "$@"; do
    case "$arg" in
        --fresh) FRESH=1 ;;
        -h|--help)
            sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "argumento desconhecido: $arg (use --fresh ou --help)" >&2
            exit 2
            ;;
    esac
done

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
echo "grave pela USB rotulada UART:"
echo "  idf.py -B $BUILD -p /dev/ttyACM0 flash"
