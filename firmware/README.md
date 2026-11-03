# firmware/

Este é o CelerOS do devkit-s3 na **variante CelerBot**: Bluetooth (Celer
Link) ligado e o console/celerctl na **USB-Serial/JTAG nativa** — a mesma
USB-C que grava. Um cabo só resolve flash, `celerctl` e `logcat`.

O motivo: o `devkit-s3` do CelerOS nasce como "laboratório de USB host"
(`CONFIG_CELEROS_USB_HOST=y`, BT desligado). No ESP32-S3 o host OTG e a USJ
dividem o mesmo PHY interno, então o board padrão não tem console na USB
nativa. O robô não usa `USB.*`, mas precisa do Celer Link e do logcat; o
fragmento `devkit-s3-celerbot.defaults` troca o host pela USJ e liga o
NimBLE.

```
firmware/devkit-s3-celerbot.defaults
```

| Símbolo | Efeito |
|---------|--------|
| `CELEROS_LINK_ON_USJ=y` | SerialLink (celerctl) + logs na USB nativa; esptool continua gravando pela ROM |
| `# CONFIG_CELEROS_USB_HOST is not set` | libera o PHY da USJ (o robô não usa host USB) |
| `BT_ENABLED` + NimBLE (1 conexão, 4 papéis, MTU 256) | Celer Link / Celer Remote |
| `BT_NIMBLE_MEM_ALLOC_MODE_EXTERNAL=y` | pools do HOST na PSRAM (a RAM interna fica para o controller + WiFi + DMA) |
| `CELEROS_BLUETOOTH=y` | objeto global `CelerLink` |

## Compilar

```bash
../CelerBot/tools/build-firmware.sh            # build-celerbot/ no clone do CelerOS
../CelerBot/tools/build-firmware.sh --fresh    # apaga build-celerbot/sdkconfig e regera
```

O script usa `CELEROS_DIR` (default `../CelerOS`) e o ESP-IDF 6.1 de
`~/esp/v6.1/esp-idf`. Build dir próprio (`build-celerbot/`) para não
sobrescrever o `build-devkit-s3/` de outros experimentos.

## Gravar

O devkit tem duas USB-C. Nesta variante, use a rotulada **USB** (nativa,
`/dev/ttyACM0` no Linux); a **UART** (CP2102N) fica opcional — o console
dela não é usado.

```bash
idf.py -B build-celerbot -p /dev/ttyACM0 flash
```

Depois instale o app e (opcional) marque como casa do aparelho:

```bash
../CelerBot/tools/deploy.sh /dev/ttyACM0 --local-deps --boot
```

## Voltar ao firmware de laboratório de USB

Se um dia a placa precisar de `USB.*` (teclado/mouse/impressora), compile
**sem** este fragmento (o `boards/devkit-s3/sdkconfig.defaults` liga o host
OTG), mas aí o BT e o console na USB nativa saem — o `celerctl` volta a
exigir o cabo na USB rotulada UART.

## Sem Bluetooth, o app ainda roda

O app feature-detecta `typeof CelerLink`: sem BT ele avisa no logcat
("Bluetooth desligado neste firmware"), segura o robô no home e o BOOT
continua rodando os truques. O **modo mapeamento** (`deploy.sh --map`)
também funciona sem BT — é o caminho para a primeira bancada.
