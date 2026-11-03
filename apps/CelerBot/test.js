// test.js — wire de bancada do CelerBot no harness do CelerOS.
//
// O harness emula o bus I2C com registradores (__harness.i2cAdd/i2cRegs) e o
// Celer Link (__harness.setLink/pushLink). Este wire:
//   1. pluga um PCA9685 vazio em 0x40 e um controle ja pareado;
//   2. empurra o roteiro de comandos pelo relogio virtual do app;
//   3. tira fotos dos registradores nos marcos que o test/run.js confere.
//
// O teste NAO conhece o estado interno do robo: le o PWM que saiu no fio,
// como o servo leria. Assim o porte das marchas e a calibracao sao testados
// de ponta a ponta (app + deps celeros.hw + driver do PCA9685).

var h = null;
var amostras = [];
var copiar = function (o) {
    var r = {}, k;
    if (!o) return r;
    for (k in o) if (o.hasOwnProperty(k)) r[k] = o[k];
    return r;
};

// Roteiro (ms desde o inicio do app). O keepalive e 900 ms: o move de 2500
// NAO e repetido de proposito, para provar que o robo para sozinho.
var PUSHES = [
    { at: 1000, msg: { type: 'move', dir: 'up' } },
    { at: 1700, msg: { type: 'stop' } },
    { at: 2500, msg: { type: 'move', dir: 'left' } },
    { at: 4000, msg: { type: 'mode', walk: 'correr' } },
    { at: 4100, msg: { type: 'move', dir: 'up' } },
    { at: 4700, msg: { type: 'trick', name: 'pular' } },
    { at: 5800, msg: { type: 'stop' } }
];

// Marcos de amostragem (ms).
var MARCOS = [800, 1300, 2100, 2800, 3900, 4400, 4900, 5700, 6300];

exports.wire = function (env) {
    h = env.__harness;
    h.i2cAdd(0x40, {});
    h.setLink({ conn: true, pairing: false });

    // Home curto no harness: os marcos antigos (800 ms) ainda pegam tudo
    // parado. No robo o padrao e 120/150 (protecao de corrente do boot).
    env.FS.writeTextFile(env.FS.appData() + 'calibracao.json',
        JSON.stringify({ home: { stepMs: 20, rampMs: 20 } }));

    var base = env.System.delay;
    var pi = 0, mi = 0;
    env.System.delay = function (ms) {
        var t = env.System.millis() - 1000;
        while (pi < PUSHES.length && t >= PUSHES[pi].at) {
            h.pushLink([JSON.stringify(PUSHES[pi].msg)]);
            pi++;
        }
        while (mi < MARCOS.length && t >= MARCOS[mi]) {
            amostras.push({ at: MARCOS[mi], regs: copiar(h.i2cRegs(0x40)) });
            mi++;
        }
        return base.call(env.System, ms);
    };
};

exports.amostras = function () { return amostras; };
exports.writes = function () { return h ? h.i2cWrites() : []; };
