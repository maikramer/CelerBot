// calibracao.js — calibracao do CelerBot (miniKame de 8 servos no PCA9685).
//
// Edite e reinstale o app para mudar a mecanica; em campo, copie este objeto
// para /local/data/celeros.celerbot/calibracao.json (o app le e sobrepoe).
//
// Servos (mesma ordem do miniKame):
//   0,1 quadril dianteiro (esq, dir)     2,3 joelho dianteiro (esq, dir)
//   4,5 quadril traseiro  (esq, dir)     6,7 joelho traseiro  (esq, dir)
//
// trim   = ajuste fino em graus somado ao angulo antes do pulso (o miniKame
//          usa [0,-8,8,5,2,-6,6,5] para deixar as quatro patas no chao).
// reverse= inverte o sentido do servo (monte espelhado).
// ch     = canal do PCA9685 (0..15). Canais 8..15 ficam livres para pan/tilt.
//
// Fiacao ATUAL (variante provisoria, robo fechado): I2C em GPIO21 (SDA) e
// GPIO20 (SCL), OE no GPIO19. Esses dois sao os pinos da USB nativa do S3:
// esta calibracao exige o firmware sem USB (tools/build-firmware.sh --uart),
// com o console/celerctl na OUTRA USB-C (rotulada UART, CP2102N).
//
// Quando abrir o robo, mova SCL/OE para GPIO47/GPIO48 (ou 11-14) e volte ao
// firmware padrao (console na USB nativa, um cabo so); ai troque pca.scl/oe.
// 26..37 sao flash/PSRAM octal, 43/44 a UART0 e 19/20 a USB: nao use para
// outra coisa sem desligar a USB no build.
// VCC logico do PCA9685 em 3V3; servo V+ em fonte 5V separada com GND comum.

module.exports = {
    // PCA9685: endereco padrao 0x40 (A0..A5 em GND), 50 Hz para servos.
    // hz = clock do I2C (100 kHz tolera dupont longo com pull-up de 10k).
    // oe = GPIO do OE do PCA; use -1 se o OE estiver no GND.
    pca: { addr: 0x40, freq: 50, sda: 21, scl: 20, hz: 100000, oe: 19 },

    // Faixa de pulso dos servos (500..2500 us cobre a maioria dos SG90/MG90S;
    // aperte para 600..2400 se o servo zumbir nos extremos).
    minUs: 500,
    maxUs: 2500,

    servos: [
        { ch: 0, trim: 0, reverse: false },   // S0
        { ch: 1, trim: -8, reverse: false },  // S1
        { ch: 2, trim: 8, reverse: false },   // S2
        { ch: 3, trim: 5, reverse: false },   // S3
        { ch: 4, trim: 2, reverse: false },   // S4
        { ch: 5, trim: -6, reverse: false },  // S5
        { ch: 6, trim: 6, reverse: false },   // S6
        { ch: 7, trim: 5, reverse: false }    // S7
    ],

    // Laco principal: 20 ms (50 Hz) e o mesmo passo do servo.
    tickMs: 20,
    // Sem move repetido por este tempo (o Remote repete a cada 250 ms).
    idleStopMs: 900,
    // Pareamento por codigo (o codigo aparece no logcat; veja o README).
    pairing: true,
    // Nome anunciado no BLE (ate 29 bytes).
    name: 'CelerBot'
};
