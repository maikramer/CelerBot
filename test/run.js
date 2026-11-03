#!/usr/bin/env node
// Bateria do CelerBot no harness PUBLICO do CelerOS.
// Uso: CELEROS_DIR=../CelerOS node test/run.js
//
// O app roda em Node (harness do CelerOS) com um PCA9685 em memoria e um
// Celer Link cujo controle ja esta pareado. O roteiro de comandos e as
// fotos dos registradores vivem em apps/CelerBot/test.js; aqui so entram as
// asseroes. Nada do app depende deste arquivo.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CELEROS = path.resolve(process.env.CELEROS_DIR || path.join(ROOT, "..", "CelerOS"));
const RUNNER = path.join(CELEROS, "tools", "sdk", "lib", "runner.js");

if (!fs.existsSync(RUNNER)) {
    console.error("harness publico nao encontrado em " + RUNNER);
    console.error("defina CELEROS_DIR para o clone do CelerOS");
    process.exit(2);
}

const { runAppFolder } = require(RUNNER);

const appDir = path.join(ROOT, "apps", "CelerBot");
const calib = require(path.join(appDir, "calibracao.js"));
const marchas = require(path.join(appDir, "marchas.js"));

let failures = 0;
function check(name, cond, extra) {
    if (cond) {
        console.log("  PASS  " + name);
    } else {
        failures++;
        console.log("  FAIL  " + name + (extra !== undefined ? "  [" + extra + "]" : ""));
    }
}

// ---- leitura do PWM que saiu no fio ---------------------------------------
function offDe(regs, ch) {
    const r = 0x06 + 4 * ch;
    return (regs[r + 2] | ((regs[r + 3] & 0x0F) << 8));
}

function offEsperado(ch, angulo) {
    const s = calib.servos[ch];
    let a = angulo + (typeof s.trim === "number" ? s.trim : 0);
    if (s.reverse) a = 180 - a;
    a = Math.max(0, Math.min(180, a));
    const us = Math.round(calib.minUs + (a / 180) * (calib.maxUs - calib.minUs));
    return Math.round(us * 4096 * calib.pca.freq / 1e6);
}

function perto(a, b, tol) {
    return Math.abs(a - b) <= (tol === undefined ? 2 : tol);
}

function todasHome(regs, tol) {
    for (let ch = 0; ch < 8; ch++) {
        if (!perto(offDe(regs, ch), offEsperado(ch, marchas.HOME[ch]), tol)) return false;
    }
    return true;
}

function quantosLongeDeHome(regs, tol) {
    let n = 0;
    for (let ch = 0; ch < 8; ch++) {
        if (!perto(offDe(regs, ch), offEsperado(ch, marchas.HOME[ch]), tol)) n++;
    }
    return n;
}

// ---- manifesto -----------------------------------------------------------
(function () {
    console.log("CelerBot: manifesto e calibracao");
    const app = JSON.parse(fs.readFileSync(path.join(appDir, "app.json"), "utf8"));
    const main = fs.readFileSync(path.join(appDir, "main.js"), "utf8");
    check("packageName do robo", app.packageName === "celeros.celerbot", app.packageName);
    check("API 54 (PCA9685/I2C)", app.api >= 54, app.api);
    check("permissoes gpio+fs", app.permissions.indexOf("gpio") >= 0 && app.permissions.indexOf("fs") >= 0,
          JSON.stringify(app.permissions));
    check("dep celeros.hw", !!app.deps && !!app.deps["celeros.hw"], JSON.stringify(app.deps));
    check("versao do app.json aparece no main.js", main.indexOf("'" + app.version + "'") >= 0,
          app.version);
    check("8 servos calibrados", calib.servos.length === 8, calib.servos.length);
    check("canais 0..7 unicos", (function () {
        const vistos = {};
        for (let i = 0; i < calib.servos.length; i++) {
            const ch = calib.servos[i].ch;
            if (vistos[ch]) return false;
            vistos[ch] = true;
        }
        return true;
    })());
    check("home do miniKame", marchas.HOME.join(",") === "110,70,55,125,70,110,125,55",
          marchas.HOME.join(","));

    // Toda marcha: 8 valores por vetor e o servo nunca precisa sair de 0..180
    // (o write clampa, mas bater no limite e sinal de offset/amplitude errados).
    const nomes = ["walk", "turn", "run", "omni", "dance", "upDown", "pushUp",
                   "frontBack", "moonwalk"];
    let tabelasOk = true, faixaOk = true;
    for (const nome of nomes) {
        const g = marchas[nome]();
        const vetores = [g.period, g.amplitude, g.offset, g.phase];
        if (!vetores.every((v) => v.length === 8)) {
            tabelasOk = false;
            console.log("        " + nome + ": vetor com tamanho != 8");
        }
        for (let i = 0; i < 8; i++) {
            const lo = g.offset[i] - g.amplitude[i];
            const hi = g.offset[i] + g.amplitude[i];
            if (lo < 0 || hi > 180) {
                faixaOk = false;
                console.log("        " + nome + " servo " + i + ": " + lo + ".." + hi);
            }
        }
    }
    check("todas as marchas com 8 servos", tabelasOk);
    check("offsets/amplitudes dentro de 0..180", faixaOk);
    check("truques tem marcha ou sequencia", marchas.TRICKS.every((t) => !!t.gait || !!t.seq));
})();

// ---- rodada principal: home -> andar -> parar -> virar -> keepalive ------
// -> correr -> truque -> home
(function () {
    console.log("CelerBot: marchas, keepalive e truque pelo Celer Remote");
    const r = runAppFolder(appDir, { stopAtMs: 6500 });
    const txt = (r.log || []).join("\n");
    const amostras = require(path.join(appDir, "test.js")).amostras();
    const writes = require(path.join(appDir, "test.js")).writes();

    check("app roda sem erro", r.err === null, r.err || "");
    check("PCA9685 inicializado", /PCA9685 ok/.test(txt), txt);

    const prescale = writes.filter((w) => w.addr === 0x40 && w.reg === 0xFE && w.data[0] === 121);
    check("PRESCALE 121 (50 Hz)", prescale.length >= 1,
          "writes=" + prescale.length);
    const modo1 = writes.filter((w) => w.addr === 0x40 && w.reg === 0x00);
    check("MODE1 passa por SLEEP e RESTART",
          modo1.some((w) => w.data[0] === 0x10) && modo1.some((w) => (w.data[0] & 0x80) !== 0),
          modo1.map((w) => w.data[0]).join(","));
    check("todo PWM vai para 0x40", writes.every((w) => w.addr === 0x40), "endereco errado");

    check("controle conectado (tel enviado)", /controle conectado/.test(txt) &&
          /"type":"tel"/.test(txt), txt);
    check("tel lista os truques", /"tricks":\["dancar"/.test(txt), txt);
    check("mode troca a marcha e ecoa no tel", /"mode":"correr"/.test(txt), txt);
    check("trick responde trick_res", /"type":"trick_res","ok":true/.test(txt), txt);
    check("keepalive para sozinho apos 900 ms", /sem comando ha 900 ms/.test(txt), txt);

    check("9 fotos dos registradores", amostras.length === 9, amostras.length);

    function marco(i) {
        const a = amostras[i];
        if (!a) {
            failures++;
            console.log("  FAIL  marco " + i + " ausente");
            return {};
        }
        return a.regs;
    }

    check("boot: patas no home", todasHome(marco(0)));
    check("move up: pelo menos 3 servos saem do home", quantosLongeDeHome(marco(1)) >= 3,
          quantosLongeDeHome(marco(1)));
    check("stop: volta ao home", todasHome(marco(2)));
    check("move left: pelo menos 3 servos saem do home", quantosLongeDeHome(marco(3)) >= 3,
          quantosLongeDeHome(marco(3)));
    check("sem repeticao de move: volta ao home", todasHome(marco(4)));
    check("modo correr: pelo menos 3 servos fora do home", quantosLongeDeHome(marco(5)) >= 3,
          quantosLongeDeHome(marco(5)));
    check("truque pular: pose muda", quantosLongeDeHome(marco(6)) >= 2,
          quantosLongeDeHome(marco(6)));
    check("fim do truque: volta ao home", todasHome(marco(7)));
    check("stop final: home", todasHome(marco(8)));
})();

// ---- pareamento: codigo so no logcat e canal fechado ----------------------
(function () {
    console.log("CelerBot: pareamento por codigo no devkit headless");
    const r = runAppFolder(appDir, {
        noAppWire: true,
        stopAtMs: 1500,
        events: (env) => {
            env.__harness.i2cAdd(0x40, {});
            env.__harness.setLink({ conn: true, pairing: true, code: "654321" });
            env.FS.writeTextFile(env.FS.appData() + "calibracao.json",
                JSON.stringify({ home: { stepMs: 20, rampMs: 20 } }));
        }
    });
    const txt = (r.log || []).join("\n");
    check("app roda sem erro", r.err === null, r.err || "");
    check("anuncia CelerBot com pareamento", /adv CelerBot \+pairing/.test(txt), txt);
    check("codigo de 6 digitos vai para o log", /digite 654321/.test(txt), txt);
    const regs = r.env.__harness.i2cRegs(0x40);
    check("canal fechado: robo fica no home", todasHome(regs));
})();

// ---- firmware sem Bluetooth: nao quebra, avisa e segura o home -----------
(function () {
    console.log("CelerBot: firmware sem Celer Link (BT desligado)");
    const r = runAppFolder(appDir, {
        noAppWire: true,
        stopAtMs: 1200,
        events: (env) => {
            env.__harness.i2cAdd(0x40, {});
            env.CelerLink = undefined;
            env.FS.writeTextFile(env.FS.appData() + "calibracao.json",
                JSON.stringify({ home: { stepMs: 20, rampMs: 20 } }));
        }
    });
    const txt = (r.log || []).join("\n");
    check("app roda sem erro", r.err === null, r.err || "");
    check("avisa que falta o Bluetooth", /Bluetooth desligado/.test(txt), txt);
    check("segura o home mesmo sem link", todasHome(r.env.__harness.i2cRegs(0x40)));
})();

// ---- PCA9685 ausente: erro claro, sem crash, com retry -------------------
(function () {
    console.log("CelerBot: PCA9685 ausente");
    const r = runAppFolder(appDir, {
        noAppWire: true,
        stopAtMs: 1200,
        events: () => { /* sem i2cAdd: ninguem responde em 0x40 */ }
    });
    const txt = (r.log || []).join("\n");
    check("app roda sem erro", r.err === null, r.err || "");
    check("erro do PCA9685 explicito", /PCA9685 sem resposta/.test(txt), txt);
})();

// ---- modo mapeamento: um servo por vez, sem Celer Link -------------------
(function () {
    console.log("CelerBot: modo mapeamento de servos");
    const r = runAppFolder(appDir, {
        noAppWire: true,
        stopAtMs: 1500,
        events: (env) => {
            env.__harness.i2cAdd(0x40, {});
            // appData cria /local/data/<pkg> no FS do harness
            const dir = env.FS.appData();
            env.FS.writeTextFile(dir + "mapear.txt", "1\n");
        }
    });
    const txt = (r.log || []).join("\n");
    check("app roda sem erro", r.err === null, r.err || "");
    check("entra no modo mapeamento", /modo mapeamento/.test(txt), txt);
    check("primeiro logico e o quadril dianteiro esquerdo",
          /mapa: logico 0 \(quadril dianteiro esquerdo\) -> canal 0/.test(txt), txt);
    check("nao sobe o Celer Link", !/\[link\] adv/.test(txt), txt);

    const writes = r.env.__harness.i2cWrites();
    check("allOff no inicio (todos frouxos)",
          writes.some((w) => w.addr === 0x40 && w.reg === 0xFA), "sem 0xFA");
    const ch0 = writes.filter((w) => w.addr === 0x40 && w.reg === 0x06);
    check("so o canal 0 recebe pulso", ch0.length >= 2, "writes=" + ch0.length);
    const outros = writes.filter((w) => w.addr === 0x40 && w.reg >= 0x0A && w.reg <= 0x25);
    check("canais 1..7 ficam sem pulso", outros.length === 0, "writes=" + outros.length);
    const offs = ch0.map((w) => w.data[2] | ((w.data[3] & 0x0F) << 8));
    check("alterna 90/110 graus (offs 307/353)",
          offs.indexOf(307) >= 0 && offs.indexOf(353) >= 0, offs.join(","));
})();

// ---- idleRelease: solta os servos depois de N ms parado (opt-in) ---------
(function () {
    console.log("CelerBot: idleRelease solta os servos parados");
    const r = runAppFolder(appDir, {
        noAppWire: true,
        stopAtMs: 2500,
        events: (env) => {
            env.__harness.i2cAdd(0x40, {});
            env.FS.writeTextFile(env.FS.appData() + "calibracao.json", JSON.stringify({
                home: { stepMs: 20, rampMs: 20 },
                idleReleaseMs: 1000
            }));
        }
    });
    const txt = (r.log || []).join("\n");
    check("app roda sem erro", r.err === null, r.err || "");
    check("libera apos 1000 ms parado", /servos liberados/.test(txt), txt);

    const regs = r.env.__harness.i2cRegs(0x40);
    let zerados = true;
    for (let ch = 0; ch < 8; ch++) if (offDe(regs, ch) !== 0) zerados = false;
    check("canais 0..7 com PWM 0", zerados);
    check("ALL_LED 0 no fio",
          r.env.__harness.i2cWrites().some((w) => w.addr === 0x40 && w.reg === 0xFA));
})();

console.log("");
if (failures) {
    console.log("FALHAS: " + failures);
    process.exit(1);
}
console.log("OK: todos os testes do CelerBot passaram");
