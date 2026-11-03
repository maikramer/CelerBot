// CelerBot — programa headless do robo miniKame no ESP32-S3 DevKitC-1.
//
// O devkit-s3 nao tem vidro (CONFIG_CELEROS_UI off): o programa nao desenha
// nada. O robo anda por comandos do Celer Remote (Celer Link/BLE) e o LED
// WS2812 da placa (GPIO38) mostra o estado. Sem Bluetooth no firmware, o
// BOOT ainda roda os truques em sequencia (bancada) e o logcat explica.
//
// Mecanica: 4 patas x 2 juntas (quadril + joelho) = 8 servos num PCA9685
// (I2C em GPIO8/GPIO9). As marchas sao o porte do miniKame/Octosnake
// (marchas.js + minikame.js); a calibracao fica em calibracao.js e pode ser
// sobreposta por /local/data/celeros.celerbot/calibracao.json.
//
// ES5 (Duktape). Permissoes: gpio (I2C/servos/neopixel), fs (override).

var HW = require('celeros.hw');
var MiniKame = require('minikame');
var Calibracao = require('calibracao');
var Link = require('link');

var VERSION = '0.1.0';   // manter igual ao app.json

function log(msg) {
    System.print('[CelerBot] ' + msg);
}

function copiarCfg(base, over) {
    var out = {}, k;
    for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    for (k in over) if (over.hasOwnProperty(k)) out[k] = over[k];
    if (base.pca || over.pca) {
        out.pca = {};
        var p = over.pca || {}, b = base.pca || {};
        for (k in b) if (b.hasOwnProperty(k)) out.pca[k] = b[k];
        for (k in p) if (p.hasOwnProperty(k)) out.pca[k] = p[k];
    }
    return out;
}

// Override de campo: /local/data/celeros.celerbot/calibracao.json. Invalido
// nao derruba o app — vale a calibracao do pacote.
function carregarCfg() {
    var cfg = Calibracao;
    try {
        if (typeof FS === 'undefined' || !FS.appData) return cfg;
        var dir = String(FS.appData());
        var path = dir + (dir.charAt(dir.length - 1) === '/' ? '' : '/') + 'calibracao.json';
        if (!FS.exists(path)) return cfg;
        var txt = FS.readTextFile(path);
        if (txt) {
            cfg = copiarCfg(Calibracao, JSON.parse(txt));
            log('calibracao de campo: ' + path);
        }
    } catch (e) {
        log('calibracao.json ignorado (' + e + ')');
    }
    return cfg;
}

var cfg = carregarCfg();
var info = System.getInfo ? System.getInfo() : {};
log('v' + VERSION + ' board=' + (info.board || '?') +
    ' api=' + System.getAPILevel() +
    (info.hasDisplay ? '' : ' headless'));
log('I2C sda=' + cfg.pca.sda + ' scl=' + cfg.pca.scl +
    ' PCA9685=0x' + (cfg.pca.addr | 0).toString(16) + ' @' + cfg.pca.freq + 'Hz');

// ---- hardware ---------------------------------------------------------------
var pca = null;
var bot = null;
var led = null;

function initHardware() {
    try {
        if (!pca) {
            var o = { addr: cfg.pca.addr, freq: cfg.pca.freq };
            if (typeof cfg.pca.sda === 'number' && cfg.pca.sda >= 0) {
                o.sda = cfg.pca.sda;
                o.scl = cfg.pca.scl;
                o.hz = cfg.pca.hz;
            }
            pca = HW.pca9685.create(o);
        }
        if (!pca.init()) {
            log('PCA9685 sem resposta: ' + pca.lastError);
            return false;
        }
        bot = new MiniKame({ pca: pca, cfg: cfg });
        bot.home(400);
        log('PCA9685 ok: 8 servos calibrados, indo para home');
        return true;
    } catch (e) {
        log('falha no hardware: ' + e);
        return false;
    }
}

if (typeof System.neopixel === 'function') {
    led = HW.led.strip({ index: 0, count: 1 });
}

function pintar(color) {
    if (!led) return;
    led.set(0, color).show();
}

// ---- controle ---------------------------------------------------------------
var link = null;

if (!initHardware()) {
    pintar(HW.led.rgb(120, 0, 0));
    // Tenta de novo: cabo solto/energia do PCA nao exige reboot do robo.
    while (true) {
        System.delay(2000);
        log('tentando o PCA9685 de novo...');
        if (initHardware()) break;
    }
}

link = Link.create({
    bot: bot,
    name: cfg.name,
    pairing: cfg.pairing,
    idleStopMs: cfg.idleStopMs,
    log: log
});
link.start();

// Bancada sem Celer Remote: toque curto no BOOT roda o proximo truque.
var trickIdx = 0;
var lastCor = -1;

function corStatus(now) {
    var st = link.status();
    var pisca = Math.floor(now / 400) % 2 === 0;
    if (!st.available) return pisca ? HW.led.rgb(90, 40, 0) : 0;   // ambar: sem BT
    if (st.pairing) return pisca ? HW.led.rgb(0, 0, 90) : 0;       // azul: pareando
    if (bot.state() === 'truque') return HW.led.rgb(0, 70, 70);   // ciano: truque
    if (bot.state() === 'andando') return HW.led.rgb(0, 90, 0);   // verde: andando
    if (st.connected) return HW.led.rgb(0, 24, 0);                // verde fraco: parado
    return HW.led.rgb(0, 0, 24);                                  // azul fraco: esperando
}

var tickMs = cfg.tickMs || 20;
var corProx = 0;
while (true) {
    var now = System.millis();

    bot.tick(now);
    link.tick(now);

    if (typeof System.button === 'function' && System.button() === 1) {
        var t = bot.tricks[trickIdx % bot.tricks.length];
        trickIdx++;
        if (bot.trick(t.name)) log('BOOT: truque "' + t.name + '"');
    }

    // status() monta um objeto no Duktape: 5 Hz basta para um LED.
    if (now >= corProx) {
        corProx = now + 200;
        var cor = corStatus(now);
        if (cor !== lastCor) {
            lastCor = cor;
            pintar(cor);
        }
    }

    var gasto = System.millis() - now;
    var espera = tickMs - gasto;
    System.delay(espera > 1 ? espera : 1);
}
