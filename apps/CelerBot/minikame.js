// minikame.js — executor das marchas do miniKame sobre um PCA9685.
//
// Recebe o driver ja inicializado (celeros.hw.pca9685) e a calibracao, e
// expoe um robo nao-bloqueante: tick(now) escreve os 8 servos e devolve o
// controle, para o laco principal continuar drenando o Celer Link.
//
// A matematica vem do Octosnake (minikame.cpp): 8 osciladores com o MESMO
// instante de referencia; as poses e os truques sao sequencias de keyframes
// interpoladas a cada tick. ES5 (Duktape; permissao "gpio").

var M = require('marchas');

var SERVOS = 8;

function clamp(v, a, b) {
    if (v < a) return a;
    if (v > b) return b;
    return v;
}

function copy(a) {
    var out = [], i;
    for (i = 0; i < a.length; i++) out.push(a[i]);
    return out;
}

// ---- oscilador do Octosnake -------------------------------------------------
function Osc() {
    this.period = 2000;
    this.amplitude = 50;
    this.phase = 0;
    this.offset = 0;
}

// refresh(now, t0): (now - t0) % periodo, em fase com os outros servos.
Osc.prototype.refresh = function (now, t0) {
    var d = (now - t0) % this.period;
    if (d < 0) d += this.period;
    return this.amplitude * Math.sin(d * 2 * Math.PI / this.period +
                                      this.phase * Math.PI / 180) + this.offset;
};

// ---- robo -------------------------------------------------------------------
// opts: { pca, cfg } — cfg e o objeto de calibracao.js (ou o override lido de
// /local/data/<pkg>/calibracao.json).
function Robot(opts) {
    if (!opts || !opts.pca) throw new Error('minikame: pca obrigatorio');
    var cfg = opts.cfg || {};
    var servos = cfg.servos || [];
    if (servos.length !== SERVOS)
        throw new Error('minikame: calibracao precisa de 8 servos');

    this.pca = opts.pca;
    this.cfg = cfg;
    this.osc = [];
    for (var i = 0; i < SERVOS; i++) this.osc.push(new Osc());

    this.pos = copy(M.ZERO);      // angulo LOGICO (antes de trim/reverse)
    this.gait = null;             // {def, t0, duration, key}
    this.tween = null;            // {from, to, t0, ms}
    this.seq = null;              // lista de keyframes
    this.seqIdx = 0;
    this.seqUntil = 0;
    this.mode = M.MODES[0];
    this.modes = M.MODES;
    this.tricks = M.TRICKS;
    this._state = 'parado';

    for (var s = 0; s < SERVOS; s++) {
        var ch = servos[s].ch;
        if (typeof ch !== 'number' || ch < 0 || ch > 15)
            throw new Error('minikame: servo ' + s + ' sem canal 0..15');
    }
}

// Aplica trim/reverse e manda o pulso. Um unico setServoUs por servo/tick:
// a rampa e a propria senoide da marcha (o PCA9685 segura o pulso sozinho).
Robot.prototype.write = function (i, angle) {
    var s = this.cfg.servos[i];
    angle = clamp(angle, 0, 180);
    var a = angle + (typeof s.trim === 'number' ? s.trim : 0);
    if (s.reverse) a = 180 - a;
    a = clamp(a, 0, 180);
    var minUs = typeof this.cfg.minUs === 'number' ? this.cfg.minUs : 500;
    var maxUs = typeof this.cfg.maxUs === 'number' ? this.cfg.maxUs : 2500;
    var us = Math.round(minUs + (a / 180) * (maxUs - minUs));
    this.pos[i] = angle;
    this.pca.setServoUs(s.ch, us);
};

Robot.prototype.pose = function (angles) {
    for (var i = 0; i < SERVOS; i++) this.write(i, angles[i]);
};

// Rampeia ate uma pose (ms=0 escreve na hora).
Robot.prototype.to = function (angles, ms) {
    if (!ms || ms <= 0) {
        this.tween = null;
        this.pose(angles);
        return;
    }
    this.tween = { from: copy(this.pos), to: copy(angles), t0: this.now(), ms: ms };
};

Robot.prototype.now = function () {
    return typeof System !== 'undefined' && System.millis ? System.millis() : 0;
};

// Home do miniKame (patas plantadas). Cancela marcha/truque.
Robot.prototype.home = function (ms) {
    this.gait = null;
    this.seq = null;
    this.tween = null;
    this._state = 'parado';
    this.to(M.HOME, ms === undefined ? 300 : ms);
};

Robot.prototype.zero = function () {
    this.gait = null;
    this.seq = null;
    this.tween = null;
    this._state = 'parado';
    this.pose(M.ZERO);
};

// ---- marcha continua ---------------------------------------------------------
Robot.prototype._startGait = function (def, opts) {
    opts = opts || {};
    this.seq = null;
    this.tween = null;
    this.gait = {
        def: def,
        t0: this.now(),
        duration: opts.steps ? def.period[0] * opts.steps : 0,
        key: opts.key || def.key || 'gait'
    };
    this._state = opts.steps ? 'truque' : 'andando';
};

// Marcha de locomoção: mesma tecla nao reinicia (o Remote repete move a cada
// 250 ms e reiniciar a fase a cada repeticao daria passos picados).
Robot.prototype.move = function (dir) {
    if (this.seq) return false;
    if (this.gait && this.gait.duration > 0) return false;   // truque em curso
    var def = null, key = null;
    if (dir === 'up' || dir === 'down') {
        var fwd = dir === 'up' ? 1 : -1;
        if (this.mode === 'correr') {
            def = M.run(420, fwd);
            key = 'run:' + fwd;
        } else {
            def = M.walk(550, fwd);
            key = 'walk:' + fwd;
        }
    } else if (dir === 'left' || dir === 'right') {
        var sgn = dir === 'left' ? -1 : 1;
        if (this.mode === 'lateral') {
            def = M.omni(600, 0, sgn);
            key = 'omni:' + sgn;
        } else {
            def = M.turn(550, sgn);
            key = 'turn:' + sgn;
        }
    }
    if (!def) return false;
    if (this.gait && this.gait.key === key) return true;     // ja andando assim
    this._startGait(def, { key: key });
    return true;
};

Robot.prototype.stop = function () {
    this.home(300);
};

Robot.prototype.setMode = function (mode) {
    var ok = false, i;
    for (i = 0; i < M.MODES.length; i++) if (M.MODES[i] === mode) ok = true;
    if (!ok) return false;
    if (this.mode === mode) return true;
    this.mode = mode;
    if (this.moving()) this.home(200);
    return true;
};

// ---- truques -----------------------------------------------------------------
Robot.prototype._startSeq = function (steps) {
    this.gait = null;
    this.tween = null;
    this.seq = steps;
    this.seqIdx = 0;
    this.seqUntil = 0;
    this._state = 'truque';
    this._nextSeq(this.now());
};

Robot.prototype._nextSeq = function (now) {
    var st = this.seq[this.seqIdx];
    if (!st) {
        this.seq = null;
        this.home(250);
        return;
    }
    if (st.ms > 0) this.to(st.pose, st.ms);
    else { this.tween = null; this.pose(st.pose); }
    this.seqUntil = now + (st.ms > 0 ? st.ms : 0) + (st.wait || 0);
};

Robot.prototype.trick = function (name) {
    var i;
    for (i = 0; i < M.TRICKS.length; i++) {
        var t = M.TRICKS[i];
        if (t.name !== name) continue;
        if (t.seq) this._startSeq(t.seq);
        else this._startGait(t.gait, { steps: t.steps, key: 'trick:' + name });
        return true;
    }
    return false;
};

// ---- tick --------------------------------------------------------------------
// Devolve true quando o robo esta executando algo (marcha/truque/rampa).
Robot.prototype.tick = function (now) {
    now = now || this.now();

    if (this.tween && !this._tickTween(now)) return true;

    if (this.seq) {
        if (now >= this.seqUntil) {
            this.seqIdx++;
            this._nextSeq(now);
        }
        return true;
    }

    if (this.gait) {
        var g = this.gait;
        if (g.duration > 0 && now - g.t0 >= g.duration) {
            this.home(250);
            return true;
        }
        this._tickGait(now);
        return true;
    }
    return false;
};

Robot.prototype._tickTween = function (now) {
    var tw = this.tween;
    var t = (now - tw.t0) / tw.ms;
    if (t >= 1) {
        this.pose(tw.to);
        this.tween = null;
        return true;
    }
    for (var i = 0; i < SERVOS; i++) {
        this.write(i, tw.from[i] + (tw.to[i] - tw.from[i]) * t);
    }
    return false;
};

Robot.prototype._tickGait = function (now) {
    var g = this.gait;
    var def = g.def;
    var i, o;
    for (i = 0; i < SERVOS; i++) {
        o = this.osc[i];
        o.period = def.period[i];
        o.amplitude = def.amplitude[i];
        o.offset = def.offset[i];
        o.phase = def.phase[i];
    }

    // walk: so o par diagonal que esta no ar atualiza joelho (2,3,6,7).
    var side = -1;
    if (def.side) {
        side = Math.floor((now - g.t0) / (def.period[0] / 2)) % 2;
    }

    for (i = 0; i < SERVOS; i++) {
        if (side >= 0) {
            var knee = (i === 2 || i === 3 || i === 6 || i === 7);
            if (knee) {
                var active = (side === 0) ? (i === 3 || i === 6) : (i === 2 || i === 7);
                if (!active) continue;   // servo segura a posicao (igual ao C++)
            }
        }
        this.write(i, this.osc[i].refresh(now, g.t0));
    }
};

Robot.prototype.state = function () { return this._state; };
Robot.prototype.moving = function () { return this._state !== 'parado'; };

module.exports = Robot;
