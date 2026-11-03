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
// Fiacao no ESP32-S3 DevKitC-1: I2C em GPIO21 (SDA) e GPIO47 (SCL); o OE do
// PCA fica no GPIO48 (ativo em nivel baixo: o app puxa LOW antes do init)
// ou direto no GND. GPIO19/20 sao o USB nativo (console/celerctl); 26..37
// sao flash/PSRAM octal; 43/44 a UART0; o S3 nao tem 22..25.
// No DevKitC-1 v1.0 o GPIO48 e o LED RGB onboard: como OE (saida LOW) ele
// so apaga o LED; NAO use 48 como SCL nessa revisao.
// VCC logico do PCA9685 em 3V3; servo V+ em fonte 5V separada com GND comum.

module.exports = {
    // PCA9685: endereco padrao 0x40 (A0..A5 em GND), 50 Hz para servos.
    // hz = clock do I2C (100 kHz tolera dupont longo com pull-up de 10k).
    // oe = GPIO do OE do PCA; use -1 se o OE estiver no GND.
    pca: { addr: 0x40, freq: 50, sda: 21, scl: 47, hz: 100000, oe: 48 },

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
