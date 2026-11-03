# CelerBot

Robô quadrúpede **miniKame** (4 patas × 2 juntas, 8 servos) controlado por um
**ESP32-S3 DevKitC-1** rodando **CelerOS**. O programa é JS headless: as
marchas do miniKame/Octosnake foram portadas para ES5, os servos ficam num
**PCA9685** por I2C e o controle vem do **Celer Remote** pelo Celer Link
(BLE), com o LED WS2812 da placa mostrando o estado.

> **Status:** o porte está coberto pelo harness do CelerOS (marchas,
> calibração, keepalive, pareamento e falhas de hardware). **Ainda não rodou
> na bancada** — o primeiro teste físico é pendente.

## Por que headless

O `devkit-s3` é a placa sem vidro do CelerOS (`CONFIG_CELEROS_UI` off): não
há pilha de UI, então um programa do Celer Studio com telas Kui não desenha
nada. O CelerBot é um app de verdade do CelerOS (`app.json` + `main.js` +
módulos ES5), com interface = rádio (Celer Link) + LED + BOOT.

## Mecânica e eletrônica

| Peça | Observação |
|------|------------|
| ESP32-S3 DevKitC-1 **N16R8** | 16 MB flash, 8 MB PSRAM (o `devkit-s3` do CelerOS) |
| PCA9685 | 16 canais PWM de 12 bits, I2C, 50 Hz para servos |
| 8 servos | miniKame: S0..S7 (quadril + joelho de cada pata) |
| Fonte 5 V | **externa**, 5 A ou mais; 8 servos podem puxar picos altos |

### Ligação

```
DevKitC-1            PCA9685                  servos
GPIO21 ─── SDA ───── SDA
GPIO9  ─── SCL ───── SCL
3V3    ─── VCC ───── VCC (lógico)
GND    ─── GND ───── GND ─────────────── GND da fonte 5 V (comum!)
GND    ─── OE  ───── (habilita as saídas; OE é ativo em nível baixo)
                     V+ ────────────────── +5 V da fonte (NUNCA o 5 V do devkit)
                     CH0..CH7 ──────────── S0..S7 (ordem em calibracao.js)
GPIO38 ───────────── LED WS2812 onboard (status)
```

- **GPIO19/20 são o USB nativo** (D-/D+) e o perfil `devkit-s3` os reserva em
  `gpioDeniedMask`: `System.i2c.beginAt(..., 20)` falha com "GPIO 20 invalido
  para I2C (saida/reservado)". Não use 19/20 para I2C nem para OE.
- **OE não é GPIO**: o driver `celeros.hw.pca9685` nunca configura OE. Ligue
  ao **GND** para habilitar os 16 canais; solto (ou alto) as saídas ficam
  desligadas e os servos não recebem PWM.
- O S3 **não tem GPIO22..25**. O exemplo `{sda:22,scl:27}` do driver é de
  outra placa; aqui o bus é criado com `beginAt(21, 9, 400k)`.
- Outros GPIOs livres servem (ex.: SDA 8 + SCL 9, o par do exemplo da doc do
  CelerOS) desde que não sejam 19/20, 26..37 (flash/PSRAM octal) nem 43/44
  (UART0 do console) — aí é só trocar `pca.sda`/`pca.scl` em `calibracao.js`.
- Endereço padrão do PCA9685: `0x40` (A0..A5 em GND). O app tenta de novo a
  cada 2 s se o chip não responder (cabo solto não exige reboot).
- Um capacitor de 1000 µF na entrada de 5 V do PCA ajuda nos picos.

## Firmware

O CelerOS do devkit-s3 **não liga o Bluetooth por padrão** (a placa é o
laboratório de USB host do projeto). Para o Celer Remote, recompile com o
fragmento `firmware/devkit-s3-bt.defaults`:

```bash
tools/build-firmware.sh            # CELEROS_DIR=../CelerOS, build-celerbot/
tools/build-firmware.sh --fresh    # se build-celerbot/sdkconfig já existia sem BT
```

Grave pela USB-C rotulada **UART** (a outra é o host OTG):

```bash
idf.py -B build-celerbot -p /dev/ttyACM0 flash
```

Detalhes e o porquê dos pools NimBLE na PSRAM: [firmware/README.md](firmware/README.md).

## Instalar o app

O CelerBot **não está no catálogo do hub** — é instalado do repo:

```bash
tools/deploy.sh /dev/ttyACM0            # instala e abre
tools/deploy.sh /dev/ttyACM0 --boot     # + autostart (o robô já sobe nele)
tools/deploy.sh /dev/ttyACM0 --local-deps   # dep celeros.hw do clone do CelerOS
```

O `celerctl` resolve `celeros.hw` (PCA9685/servo/LED) no hub. Publicar no
catálogo público é opcional e independente deste repo:

```bash
cd ../CelerOS
node tools/sdk/celer.js publish --dry ../CelerBot/apps/CelerBot   # valida sem subir
node tools/sdk/celer.js publish ../CelerBot/apps/CelerBot          # requer token do hub
```

O publish exige `version` nova a cada envio (o hub recusa a mesma) e árvore
git limpa.

## Parear e dirigir

No outro device CelerOS com Bluetooth (SmartDisplay, watch ou cão — **a CYD
não tem rádio BT**), abra o **Celer Remote** e escaneie. O robô aparece como
`CelerBot`.

O código de pareamento de 6 dígitos existe **só no lado do robô** e, como o
devkit não tem tela, sai no logcat:

```bash
celerctl logcat | grep CelerBot
# [CelerBot] pareamento: digite 654321 no Celer Remote
```

O código vale 60 s (3 erros derrubam a conexão); controles aprovados ficam
lembrados no NVS e reconectam sem código.

### Comandos

| Entrada | Ação |
|---------|------|
| D-pad ↑ / ↓ | andar / andar de ré |
| D-pad ← / → | girar (no modo `lateral`, andar de lado) |
| Centro | parar (volta ao home) |
| Botão de marcha | alterna `andar` / `correr` / `lateral` |
| Truques | `dancar`, `flexao`, `subir`, `frente-tras`, `moonwalk`, `saudar`, `pular` |
| BOOT (sem rádio) | toque curto roda o próximo truque (bancada) |

O Remote repete `move` a cada 250 ms enquanto a seta está apertada. **Sem
repetição por 900 ms o robô para sozinho** e volta ao home; se o link cair,
para na hora. Truques são de uma vez só e terminam no home.

### LED de status (GPIO38)

| Cor | Estado |
|-----|--------|
| azul piscando | pareando (código no logcat) |
| verde | andando |
| verde fraco | controle conectado, parado |
| ciano | truque |
| azul fraco | esperando controle |
| âmbar piscando | firmware sem Bluetooth |
| vermelho piscando | PCA9685 não responde |

## Mapear os servos (bancada)

O miniKame espera esta ordem (a mesma do `minikame.cpp` e do `kame_robot`):

| lógico | junta | canal padrão |
|--------|-------|--------------|
| 0 | quadril dianteiro esquerdo | 0 |
| 1 | quadril dianteiro direito | 1 |
| 2 | joelho dianteiro esquerdo | 2 |
| 3 | joelho dianteiro direito | 3 |
| 4 | quadril traseiro esquerdo | 4 |
| 5 | quadril traseiro direito | 5 |
| 6 | joelho traseiro esquerdo | 6 |
| 7 | joelho traseiro direito | 7 |

Se o chicote não estiver nessa ordem, não recrimpe o servo: **mapeie**. O app
tem um modo de bancada que energiza **um servo por vez** (os outros ficam
frouxos) e alterna 90° → 110° → 90° a cada 800 ms.

1. Apoie o robô: no modo mapeamento só o servo testado recebe pulso.
2. Entre no modo e reabra o app:
   ```bash
   tools/deploy.sh /dev/ttyACM0 --map
   ```
   (equivale a criar `/local/data/celeros.celerbot/mapear.txt` e
   `celerctl apps run celeros.celerbot`).
3. Cada toque curto no **BOOT** passa para o próximo servo lógico. O logcat
   diz qual lógico, qual junta ele deveria acionar e em que canal está:
   ```
   [CelerBot] mapa: logico 0 (quadril dianteiro esquerdo) -> canal 0 (S0)
   ```
4. Anote qual junta mexe em cada canal. Depois acerte o `ch` de cada servo
   lógico em `apps/CelerBot/calibracao.js` — o `trim` e o `reverse`
   acompanham a **junta**, não o canal.
5. Rode `--map` de novo: agora cada lógico deve mover a junta certa. Se uma
   junta girar ao contrário quando o robô for para o home, marque
   `reverse: true` nela.
6. Saia do modo: `tools/deploy.sh /dev/ttyACM0 --map-off` (remove o
   marcador e reabre no modo normal). Segurar o BOOT também sai do app.

## Calibração

`apps/CelerBot/calibracao.js` é a fonte: `trim` (graus somados ao ângulo),
`reverse` (servo espelhado), `ch` (canal do PCA) e a faixa de pulso
`minUs`/`maxUs`. O `trim` é o mesmo do miniKame: `[0,-8,8,5,2,-6,6,5]`.

Para ajustar sem reinstalar o app, empurre um override para a pasta privada:

```json
{
  "minUs": 500,
  "maxUs": 2500,
  "servos": [
    { "ch": 0, "trim": 0,  "reverse": false },
    { "ch": 1, "trim": -8, "reverse": false },
    { "ch": 2, "trim": 8,  "reverse": false },
    { "ch": 3, "trim": 5,  "reverse": false },
    { "ch": 4, "trim": 2,  "reverse": false },
    { "ch": 5, "trim": -6, "reverse": false },
    { "ch": 6, "trim": 6,  "reverse": false },
    { "ch": 7, "trim": 5,  "reverse": false }
  ]
}
```

```bash
celerctl push calibracao.json /local/data/celeros.celerbot/calibracao.json
celerctl apps run CelerBot
```

Sem o arquivo (ou com JSON inválido) vale a calibração do pacote. A pose de
repouso (`HOME`) e as marchas ficam em `marchas.js`.

## Protocolo (para um controle próprio)

O robô é o lado **periférico** do Celer Link e fala o mesmo contrato do Dog
Face, para o Celer Remote da loja servir sem tela nova:

| Direção | Mensagem |
|---------|----------|
| robô → controle | `{type:"tel", state, mode, modes, tricks, batt?}` (1×/s e ao conectar) |
| controle → robô | `{type:"move", dir:"up"\|"down"\|"left"\|"right"}` |
| controle → robô | `{type:"stop"}` |
| controle → robô | `{type:"mode", walk:"andar"\|"correr"\|"lateral"}` |
| controle → robô | `{type:"trick", name}` |
| robô → controle | `{type:"trick_res", ok}` |

`state` é `"parado"`, `"andando"` ou `"truque"`; `batt` só aparece em placa
com bateria (o devkit não tem, então o anel do Remote fica em 0%). Sem
`tel.wifi`, o botão de Wi-Fi do Remote não aparece.

## Testes

A bateria roda no harness público do CelerOS:

```bash
CELEROS_DIR=../CelerOS node test/run.js
```

O wire (`apps/CelerBot/test.js`) pluga um PCA9685 em memória no `0x40`, um
controle já pareado e empurra um roteiro de comandos pelo relógio virtual;
as asserções leem o PWM que saiu no fio (não o estado interno), então o
porte das marchas e a calibração são testados de ponta a ponta — app +
`celeros.hw` + driver do chip. Cobre:

- init do PCA (SLEEP → PRESCALE 121 = 50 Hz → RESTART);
- home no boot, sair do home ao andar/girar/correr, voltar no stop;
- keepalive de 900 ms, `mode` no `tel`, `trick_res`;
- pareamento: código no log e canal fechado (robô fica no home);
- firmware sem `CelerLink` (avisa e segura o home);
- PCA ausente (erro claro, sem crash, com retry).

## Estrutura

```
apps/CelerBot/          o app (ES5, API 54)
  app.json              manifesto (packageName celeros.celerbot, deps celeros.hw)
  main.js               laço de 50 Hz: PCA, link, LED, BOOT
  minikame.js           executor das marchas (osciladores + keyframes)
  marchas.js            tabela de marchas/poses/truques (porte do miniKame)
  calibracao.js         calibração dos 8 servos e parâmetros do robô
  mapear.js             modo de bancada: um servo por vez, sem Celer Link
  link.js               protocolo do Celer Remote + keepalive
  test.js               wire do harness (não vai no pacote)
firmware/               fragmento sdkconfig com o Bluetooth do Celer Link
test/run.js             bateria no harness público
tools/                  build-firmware.sh + deploy.sh
```

Os "assets" do robô são módulos JS (`marchas.js`/`calibracao.js`): não há
PNG nem som porque a placa não tem tela nem áudio digital.

## Limitações conhecidas

- **Bancada pendente.** O harness cobre a lógica e o protocolo I2C, não a
  mecânica real: ângulos, trim e corrente dos servos precisam de ajuste no
  robô montado.
- **PCA9685 segura o PWM depois que o app sai** (o chip é externo; a API 54
  só zera as saídas GPIO do ESP32). O robô fica na última pose — desligue a
  fonte dos servos quando não estiver usando.
- O firmware do devkit-s3 precisa do rebuild com BT; sem ele o app roda,
  mas só no BOOT e no logcat.
- Sem controle por Wi-Fi/web: o servidor web do CelerOS é gerenciador de
  arquivos/OTA, sem rotas de app em JS. O caminho é o Celer Link.
- Sem bateria no devkit, `tel.batt` não é enviado.

## Créditos e licença

- Marchas, poses e o oscilador vêm do **[miniKame](https://github.com/JavierIH/miniKame)**
  (JavierIH), cujo motor é o **[Octosnake](https://github.com/JavierIH/Octosnake)**
  (GPL-2.0). O porte para JS e o app CelerOS são deste repositório.
- **[CelerOS](https://github.com/Celer-Brasil/CelerOS)** — firmware, API 54
  (`System.i2c`), deps `celeros.hw.*` e harness de testes.
- Licença: **GPL-2.0** (ver [LICENSE](LICENSE)) — o porte deriva do
  Octosnake. Se você reescrever as marchas do zero, pode relicenciar.
