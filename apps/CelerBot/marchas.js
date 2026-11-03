// marchas.js — tabelas de marcha do miniKame (Kame de 8 servos, 4 patas).
//
// Porte de code/arduino/src/minikame.cpp do repo bqlabs/miniKame: cada marcha
// e um conjunto de 8 osciladores senoidais (periodo/amplitude/offset/fase) do
// Octosnake. Angulos em GRAUS (0..180) no referencial do servo; trim/reverse
// ficam na calibracao (calibracao.js) e sao aplicados por minikame.js.
//
// Convencao dos servos (igual ao miniKame):
//   0,1  quadril dianteiro (esq, dir)      2,3  joelho dianteiro (esq, dir)
//   4,5  quadril traseiro  (esq, dir)      6,7  joelho traseiro  (esq, dir)
//
// Uma marcha "side" (walk) alterna os pares diagonais de joelho a cada meio
// periodo; as demais atualizam os 8 osciladores o tempo todo (execute()).
// ES5 (Duktape).

var PI = Math.PI;

// Home do MiniKame::home(): ap=20, hi=35.
var HOME = [110, 70, 55, 125, 70, 110, 125, 55];
var ZERO = [90, 90, 90, 90, 90, 90, 90, 90];

function copy(a) {
    var out = [], i;
    for (i = 0; i < a.length; i++) out.push(a[i]);
    return out;
}

// Vira a marcha no sentido contrario somando 180 graus em todas as fases.
function phaseDir(phase, dir) {
    var out = copy(phase), i;
    if (dir < 0) {
        for (i = 0; i < out.length; i++) out[i] = (out[i] + 180) % 360;
    }
    return out;
}

function gait(period, amplitude, offset, phase, extra) {
    var g = {
        period: copy(period),
        amplitude: copy(amplitude),
        offset: copy(offset),
        phase: copy(phase),
        side: false
    };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) g[k] = extra[k];
    return g;
}

function all(v) {
    return [v, v, v, v, v, v, v, v];
}

// MiniKame::walk — passo diagonal, joelhos a T/2 (side alterna os pares).
function walk(T, dir) {
    var x_amp = 15, z_amp = 20, ap = 20, hi = 10, front_x = 12;
    T = T || 550;
    return gait(
        [T, T, T / 2, T / 2, T, T, T / 2, T / 2],
        [x_amp, x_amp, z_amp, z_amp, x_amp, x_amp, z_amp, z_amp],
        [90 + ap - front_x, 90 - ap + front_x, 90 - hi, 90 + hi,
         90 - ap - front_x, 90 + ap + front_x, 90 + hi, 90 - hi],
        phaseDir([90, 90, 270, 90, 270, 270, 90, 270], dir || 1),
        { side: true, key: 'walk' }
    );
}

// MiniKame::turnL / turnR. dir=+1 gira a direita, dir=-1 a esquerda.
function turn(T, dir) {
    var x_amp = 15, z_amp = 15, ap = 15, hi = 23;
    T = T || 550;
    var phase = dir < 0
        ? [180, 0, 90, 90, 0, 180, 90, 90]
        : [0, 180, 90, 90, 180, 0, 90, 90];
    return gait(
        all(T),
        [x_amp, x_amp, z_amp, z_amp, x_amp, x_amp, z_amp, z_amp],
        [90 + ap, 90 - ap, 90 - hi, 90 + hi,
         90 - ap, 90 + ap, 90 + hi, 90 - hi],
        phase,
        { key: 'turn' }
    );
}

// MiniKame::run — galope, os 8 servos no mesmo periodo.
function run(T, dir) {
    var x_amp = 15, z_amp = 15, ap = 15, hi = 15, front_x = 6;
    T = T || 420;
    return gait(
        all(T),
        [x_amp, x_amp, z_amp, z_amp, x_amp, x_amp, z_amp, z_amp],
        [90 + ap - front_x, 90 - ap + front_x, 90 - hi, 90 + hi,
         90 - ap - front_x, 90 + ap + front_x, 90 + hi, 90 - hi],
        phaseDir([0, 0, 90, 90, 180, 180, 90, 90], dir || 1),
        { key: 'run' }
    );
}

// MiniKame::omniWalk — passo lateral. side=true anda de lado; turn_factor
// mistura a fase do giro (0 = lateral puro).
function omni(T, tf, dir) {
    var x_amp = 15, z_amp = 15, ap = 15, hi = 23;
    var front_x = 6 * (1 - tf * tf);
    var phase1 = [0, 0, 90, 90, 180, 180, 90, 90];
    var phase = [], i;
    for (i = 0; i < 8; i++) phase.push(phase1[i]);
    T = T || 600;
    return gait(
        all(T),
        [x_amp, x_amp, z_amp, z_amp, x_amp, x_amp, z_amp, z_amp],
        [90 + ap - front_x, 90 - ap + front_x, 90 - hi, 90 + hi,
         90 - ap - front_x, 90 + ap + front_x, 90 + hi, 90 - hi],
        phaseDir(phase, dir || 1),
        { key: 'omni' }
    );
}

// MiniKame::dance
function dance(T) {
    T = T || 1000;
    return gait(
        all(T),
        [0, 0, 40, 40, 0, 0, 40, 40],
        [120, 60, 70, 110, 60, 120, 110, 70],
        [0, 0, 0, 270, 0, 0, 90, 180],
        { key: 'dance' }
    );
}

// MiniKame::upDown
function upDown(T) {
    T = T || 250;
    return gait(
        all(T),
        [0, 0, 35, 35, 0, 0, 35, 35],
        [110, 70, 65, 115, 70, 110, 115, 65],
        [0, 0, 90, 270, 180, 180, 270, 90],
        { key: 'updown' }
    );
}

// MiniKame::pushUp
function pushUp(T) {
    T = T || 600;
    return gait(
        all(T),
        [0, 0, 40, 40, 0, 0, 0, 0],
        [90, 90, 60, 120, 25, 155, 120, 60],
        [0, 0, 0, 180, 0, 0, 0, 180],
        { key: 'pushup' }
    );
}

// MiniKame::frontBack
function frontBack(T) {
    T = T || 200;
    return gait(
        all(T),
        [30, 30, 25, 25, 30, 30, 25, 25],
        [110, 70, 60, 120, 70, 110, 120, 60],
        [0, 180, 270, 90, 0, 180, 90, 270],
        { key: 'frontback' }
    );
}

// MiniKame::moonwalkL
function moonwalk(T) {
    T = T || 800;
    return gait(
        all(T),
        [0, 0, 45, 45, 0, 0, 45, 45],
        [90, 90, 90, 90, 90, 90, 90, 90],
        [0, 0, 0, 120, 0, 0, 180, 290],
        { key: 'moonwalk' }
    );
}

// ---- poses e sequencias (MiniKame::hello / jump) --------------------------
//
// MiniKame::hello: sentado (150 ms) -> espera 200 -> 4 ciclos do oscilador
// (T=350: servos 1 e 3 a 90 graus de fase) -> goingUp (500 ms) -> espera 200.
// Cada ciclo vira 4 keyframes de 175 ms (mesmo periodo do servo no C++).
var SENTADO = [105, 75, 25, 155, 110, 70, 100, 80];
var GOING_UP = [160, 20, 90, 90, 70, 110, 100, 80];
var SALTO = [110, 70, 55, 125, 50, 150, 125, 55];

var OLA = [
    [105, 40, 25, 140, 110, 70, 100, 80],
    [105, 90, 25, 90, 110, 70, 100, 80],
    [105, 40, 25, 40, 110, 70, 100, 80],
    [105, 0, 25, 90, 110, 70, 100, 80]
];

var HELLO = [{ pose: SENTADO, ms: 150, wait: 200 }];
(function () {
    for (var i = 0; i < 8; i++) HELLO.push({ pose: OLA[i % 4], ms: 175 });
})();
HELLO.push({ pose: GOING_UP, ms: 500, wait: 200 });

var JUMP = [
    { pose: SENTADO, ms: 150, wait: 200 },
    { pose: SALTO, ms: 0, wait: 100 },
    { pose: HOME, ms: 250 }
];

// ---- modos e truques ------------------------------------------------------
//
// mode = marcha do D-pad para frente/tras (o Celer Remote troca pelo botao
// de marcha quando tel.modes tem mais de um nome).
var MODES = ['andar', 'correr', 'lateral'];

// steps = ciclos da marcha de um truque (igual as chamadas do main.cpp do
// miniKame: dance(2,1000), pushUp(2,2000), upDown(4,250)...).
var TRICKS = [
    { name: 'dancar', gait: dance(1000), steps: 2 },
    { name: 'flexao', gait: pushUp(2000), steps: 2 },
    { name: 'subir', gait: upDown(250), steps: 4 },
    { name: 'frente-tras', gait: frontBack(200), steps: 4 },
    { name: 'moonwalk', gait: moonwalk(800), steps: 2 },
    { name: 'saudar', seq: HELLO },
    { name: 'pular', seq: JUMP }
];

module.exports = {
    HOME: HOME,
    ZERO: ZERO,
    MODES: MODES,
    TRICKS: TRICKS,
    walk: walk,
    turn: turn,
    run: run,
    omni: omni,
    dance: dance,
    upDown: upDown,
    pushUp: pushUp,
    frontBack: frontBack,
    moonwalk: moonwalk
};
