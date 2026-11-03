// link.js — protocolo do Celer Remote sobre o Celer Link (BLE).
//
// O robo e o lado periferico (CelerLink.start): anuncia "CelerBot" e espera
// um controle. O contrato e o mesmo do Dog Face, para o Celer Remote da loja
// nao precisar de uma tela nova:
//
//   robo -> controle   {type:"tel", state, mode, modes, tricks, batt?}
//   controle -> robo   {type:"move", dir:"up|down|left|right"} (repetido a
//                        cada 250 ms enquanto a seta esta apertada)
//   controle -> robo   {type:"stop"}
//   controle -> robo   {type:"mode", walk:"andar|correr|lateral"}
//   controle -> robo   {type:"trick", name}
//   robo -> controle   {type:"trick_res", ok}
//
// Seguranca: sem repeticao de move por 900 ms o robo para sozinho (o Remote
// repete enquanto a seta esta apertada e manda stop ao soltar); se o link
// cair, para na hora. Pareamento por codigo (API 11): o codigo so existe no
// lado local (status().code) — no devkit headless ele vai para o logcat e o
// LED de status pisca enquanto o handshake pende. ES5 (Duktape).

function nowMs() {
    return typeof System !== 'undefined' && System.millis ? System.millis() : 0;
}

function create(opts) {
    var bot = opts.bot;
    var log = opts.log || function () {};
    var idleStopMs = typeof opts.idleStopMs === 'number' ? opts.idleStopMs : 900;
    var pairing = opts.pairing !== false;
    var name = opts.name || 'CelerBot';

    var started = false;
    var wasConnected = false;
    var lastMove = 0;
    var lastCode = '';
    var lastTel = 0;

    function available() {
        return typeof CelerLink !== 'undefined' && CelerLink !== null;
    }

    function trickNames() {
        var out = [], i;
        for (i = 0; i < bot.tricks.length; i++) out.push(bot.tricks[i].name);
        return out;
    }

    function tel() {
        var t = {
            type: 'tel',
            state: bot.state(),
            mode: bot.mode,
            modes: bot.modes,
            tricks: trickNames()
        };
        var b = null;
        try {
            b = (typeof System.batteryInfo === 'function') ? System.batteryInfo() : null;
        } catch (e) { b = null; }
        if (b && typeof b.mv === 'number') t.batt = b.mv;
        return t;
    }

    function sendTel() {
        if (!available()) return false;
        return !!CelerLink.send(tel());
    }

    function handle(raw, now) {
        var v = null;
        try { v = JSON.parse(raw); } catch (e) { return; }
        if (!v || typeof v.type !== 'string') return;

        if (v.type === 'move') {
            var dir = String(v.dir || '');
            if (bot.move(dir)) lastMove = now;
        } else if (v.type === 'stop') {
            lastMove = 0;
            bot.stop();
        } else if (v.type === 'mode') {
            if (bot.setMode(String(v.walk || ''))) {
                lastMove = 0;
                sendTel();
            }
        } else if (v.type === 'trick') {
            var ok = bot.trick(String(v.name || ''));
            lastMove = 0;
            CelerLink.send({ type: 'trick_res', ok: ok });
        } else if (v.type === 'ping') {
            sendTel();
        }
    }

    function start() {
        if (!available()) {
            log('Bluetooth desligado neste firmware: sem Celer Link (rebuild com o fragmento firmware/devkit-s3-bt.defaults)');
            return false;
        }
        started = !!CelerLink.start(name, { pairing: pairing });
        if (started) {
            log('Celer Link anunciando "' + name + '"' +
                (pairing ? ' (pareamento por codigo)' : ' (link aberto)'));
        } else {
            log('Celer Link nao subiu (start() devolveu false)');
        }
        return started;
    }

    function tick(now) {
        if (!started) return;
        now = now || nowMs();

        var st = CelerLink.status();

        // Drena sempre; so executa com o canal autorizado (verified sobe
        // depois do verify() do controle, ou direto em link sem pareamento).
        for (var k = 0; k < 8; k++) {
            var msg = CelerLink.poll();
            if (msg === null) break;
            if (st.verified) handle(msg, now);
        }

        if (st.pairing && st.code && String(st.code) !== lastCode) {
            lastCode = String(st.code);
            log('pareamento: digite ' + lastCode + ' no Celer Remote');
        }

        if (st.connected && !wasConnected) {
            wasConnected = true;
            lastTel = now;
            log('controle conectado: ' + (st.peer || '?'));
            sendTel();
        } else if (!st.connected && wasConnected) {
            wasConnected = false;
            log('link caiu: parando');
        }

        if (!st.connected && bot.moving()) bot.stop();

        // Keepalive: sem move repetido, para.
        if (bot.state() === 'andando' && lastMove && now - lastMove > idleStopMs) {
            lastMove = 0;
            bot.stop();
            log('sem comando ha ' + idleStopMs + ' ms: parado');
        }

        if (st.connected && now - lastTel >= 1000) {
            lastTel = now;
            sendTel();
        }
    }

    function status() {
        if (!started || !available()) {
            return { available: available(), started: false, pairing: false,
                     connected: false, code: '', peer: '' };
        }
        var st = CelerLink.status();
        return {
            available: true,
            started: true,
            pairing: !!st.pairing,
            connected: !!st.connected,
            code: st.code ? String(st.code) : '',
            peer: st.peer || ''
        };
    }

    return {
        start: start,
        tick: tick,
        status: status,
        tel: tel,
        available: available
    };
}

module.exports = { create: create };
