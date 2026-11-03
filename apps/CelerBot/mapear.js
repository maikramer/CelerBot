// mapear.js — modo de bancada para descobrir qual canal do PCA9685 move
// qual junta e conferir o mapa logico do miniKame.
//
// Roda SEM o Celer Link e com o robo frouxo: pca.allOff() tira o pulso de
// todos os canais e cada passo energiza UM servo so (o anterior volta a 0).
// O servo testado vai de 90 a 110 graus e volta a cada 800 ms, para dar
// tempo de olhar a junta; o logcat diz o logico, a junta esperada e o canal
// em que ele esta calibrado (calibracao.js).
//
// Mapa esperado (minikame.cpp / APLUX kame_robot):
//   0=quadril dianteiro esquerdo   1=quadril dianteiro direito
//   2=joelho  dianteiro esquerdo   3=joelho  dianteiro direito
//   4=quadril traseiro  esquerdo   5=quadril traseiro  direito
//   6=joelho  traseiro  esquerdo   7=joelho  traseiro  direito
//
// Marcador: /local/data/celeros.celerbot/mapear.txt (tools/deploy.sh --map).
// ES5 (Duktape).

var JUNTAS = [
    'quadril dianteiro esquerdo',
    'quadril dianteiro direito',
    'joelho dianteiro esquerdo',
    'joelho dianteiro direito',
    'quadril traseiro esquerdo',
    'quadril traseiro direito',
    'joelho traseiro esquerdo',
    'joelho traseiro direito'
];

var PASSO_MS = 400;   // 90 -> 110 -> 90: um twitch a cada 800 ms
var DELTA = 20;

function create(opts) {
    var robot = opts.robot;
    var log = opts.log || function () {};
    var pca = robot.pca;
    var i = -1;
    var t0 = 0;
    var alto = false;

    // Sem pulso: o servo fica frouxo (nao briga com a pose dos outros).
    function soltar(k) {
        pca.setPwm(robot.cfg.servos[k].ch, 0, 0);
    }

    function ir(k, now) {
        if (i >= 0) soltar(i);
        i = k;
        t0 = now;
        alto = false;
        // O write aplica trim/reverse da calibracao: a junta identificada e
        // a que o servo LOGICO realmente aciona.
        robot.write(i, 90);
        var ch = robot.cfg.servos[i].ch;
        log('mapa: logico ' + i + ' (' + JUNTAS[i] + ') -> canal ' + ch +
            ' (S' + ch + ') | BOOT = proximo, segure para sair');
    }

    return {
        start: function (now) {
            pca.allOff();
            log('mapa: todos os servos frouxos; um de cada vez');
            log('mapa: esperado 0=quadril DE, 1=quadril DD, 2=joelho DE, ' +
                '3=joelho DD, 4=quadril TE, 5=quadril TD, 6=joelho TE, 7=joelho TD');
            ir(0, now);
        },
        next: function (now) {
            ir((i + 1) % JUNTAS.length, now);
        },
        tick: function (now) {
            if (i < 0) return;
            if (now - t0 >= PASSO_MS) {
                t0 = now;
                alto = !alto;
                robot.write(i, alto ? 90 + DELTA : 90);
            }
        },
        index: function () { return i; },
        names: JUNTAS
    };
}

module.exports = { create: create, JUNTAS: JUNTAS };
