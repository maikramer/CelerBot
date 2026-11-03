# firmware/

O CelerOS do devkit-s3 **nao liga o Bluetooth por padrao** (a placa e o
laboratorio de USB host do projeto). O CelerBot depende do Celer Link para
receber comandos do Celer Remote, entao o firmware do robo e o CelerOS
publico compilado com este fragmento de sdkconfig por cima dos defaults da
placa:

```
firmware/devkit-s3-bt.defaults
```

Ele liga `BT_ENABLED` + NimBLE (1 conexao, 4 papeis, MTU 256), manda os pools
do HOST para a PSRAM (a RAM interna fica para o controller + WiFi + DMA) e
explicita `CELEROS_BLUETOOTH=y` — o objeto global `CelerLink`.

## Compilar

```bash
../CelerBot/tools/build-firmware.sh            # build-celerbot/ no clone do CelerOS
../CelerBot/tools/build-firmware.sh --fresh    # apaga build-celerbot/sdkconfig e regera
```

O script usa `CELEROS_DIR` (default `../CelerOS`) e o ESP-IDF 6.1 de
`~/esp/v6.1/esp-idf`. Build dir proprio (`build-celerbot/`) para nao
sobrescrever o `build-devkit-s3/` de outros experimentos.

## Gravar

O devkit tem duas USB-C: use a rotulada **UART** (console/celerctl/gravacao),
nao a **USB** (host OTG).

```bash
idf.py -B build-celerbot -p /dev/ttyACM0 flash
```

Depois instale o app e (opcional) marque como casa do aparelho:

```bash
../CelerBot/tools/deploy.sh /dev/ttyACM0 --boot
```

## Sem Bluetooth, o app ainda roda

O app feature-detecta `typeof CelerLink`: sem BT ele avisa no logcat
("Bluetooth desligado neste firmware"), segura o robo no home e o BOOT
continua rodando os truques. Bom para testar a mecanica antes de recompilar
o firmware.

## Custo

O devkit tem 16 MB de flash e 8 MB de PSRAM: o bloco NimBLE cabe sem
apertar o slot OTA (~6 MB) nem o heap interno. O que muda e o consumo de
RAM interna do controller BLE — por isso os pools do HOST vao para a PSRAM.
