// Diagnostic: node scripts/probe.js
// One connection per server, one at a time, 3 seconds apart. Sends no data.
const net = require("net");
const fs = require("fs");
const path = require("path");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
const TIMEOUT = 10000;
const GAP = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function attempt(s) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (res) => { if (done) return; done = true; sock.destroy(); resolve(res + " (" + (Date.now() - start) + " ms)"); };
    sock.setTimeout(TIMEOUT);
    sock.once("connect", () => finish("OPEN"));
    sock.once("timeout", () => finish("TIMEOUT"));
    sock.once("error", (e) => finish(e.code || "ERROR"));
    sock.connect({ host: s.host, port: s.port, family: 4 });
  });
}

(async () => {
  for (const s of cfg.servers) {
    console.log(s.name, s.host + ":" + s.port, "->", await attempt(s));
    await sleep(GAP);
  }
})();
