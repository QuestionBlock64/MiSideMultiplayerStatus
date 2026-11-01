// Usage: node scripts/check.js <previous-status.json> <output-status.json>
// Probes every server (TCP, IPv4, retries), merges the result into the previous
// data (90-day history + incidents) and writes the new status.json.
const net = require("net");
const fs = require("fs");
const path = require("path");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
// Optional: keep real addresses out of the repo by putting a servers array in the SERVERS_JSON secret.
const servers = process.env.SERVERS_JSON ? JSON.parse(process.env.SERVERS_JSON) : cfg.servers;

const [, , prevPath, outPath] = process.argv;
if (!outPath) { console.error("usage: node scripts/check.js <prev.json> <out.json>"); process.exit(2); }

const TIMEOUT = cfg.timeoutMs || 8000;
const ATTEMPTS = cfg.attempts || 3;
const RETRY = cfg.retryDelayMs || 1000;
const STAGGER = cfg.staggerMs || 1000;
const SLOW = cfg.slowMs || 1500;
const INTERVAL = cfg.intervalMinutes || 5;
const KEEP_DAYS = 90;
const MAX_INCIDENTS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function attempt(host, port) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ok, ms: ok ? Date.now() - start : null, err: err || null });
    };
    sock.setTimeout(TIMEOUT);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false, "timeout"));
    sock.once("error", (e) => finish(false, e.code || "error"));
    sock.connect({ host, port, family: 4 });
  });
}

// Up if ANY attempt connects; down only if all attempts fail.
async function probe(host, port) {
  let last = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    const r = await attempt(host, port);
    if (r.ok) return { ok: true, ms: r.ms, err: null, tries: i };
    last = r;
    if (i < ATTEMPTS) await sleep(RETRY);
  }
  return { ok: false, ms: null, err: last.err, tries: ATTEMPTS };
}

(async () => {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(prevPath, "utf8")); } catch {}
  const prevById = Object.fromEntries((prev.servers || []).map((s) => [s.id, s]));
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const cutoff = new Date(now - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const ids = new Set(servers.map((s) => s.id));
  const nameById = Object.fromEntries(servers.map((s) => [s.id, s.name]));

  let incidents = (prev.incidents || []).filter((i) => ids.has(i.serverId));
  incidents.forEach((i) => { i.serverName = nameById[i.serverId]; });

  const results = await Promise.all(servers.map(async (s, i) => {
    await sleep(i * STAGGER);
    return [s, await probe(s.host, s.port)];
  }));

  const out = [];
  for (const [s, r] of results) {
    const p = prevById[s.id] || {};
    const isDown = !r.ok;
    const slow = r.ok && r.ms > SLOW;
    const state = isDown ? "down" : slow ? "slow" : "up";
    const wasDown = p.state === "down";

    // daily buckets: c = checks, u = up (incl. slow), s = slow
    const days = (p.days || []).filter((d) => d.d >= cutoff);
    let day = days.find((d) => d.d === today);
    if (!day) { day = { d: today, c: 0, u: 0, s: 0 }; days.push(day); }
    day.c++;
    if (r.ok) day.u++;
    if (slow) day.s++;
    days.sort((a, b) => (a.d < b.d ? -1 : 1));

    if (isDown && !wasDown) {
      incidents.push({ id: s.id + "-" + now, serverId: s.id, serverName: s.name, start: now, end: null, error: r.err });
    }
    if (!isDown && wasDown) {
      const open = [...incidents].reverse().find((i) => i.serverId === s.id && i.end == null);
      if (open) open.end = now;
    }

    const total = days.reduce((a, d) => a + d.c, 0);
    const up = days.reduce((a, d) => a + d.u, 0);
    out.push({
      id: s.id, name: s.name, state,
      latencyMs: r.ok ? r.ms : null,
      error: r.ok ? null : r.err,
      tries: r.tries,
      since: p.state && wasDown === isDown && p.since ? p.since : now,
      uptime90: total ? +(up / total * 100).toFixed(2) : null,
      days,
    });
    console.log(s.name, state, r.ok ? r.ms + " ms" : r.err, "(" + r.tries + " tries)");
  }

  incidents = incidents
    .filter((i) => i.end == null || i.end > now - KEEP_DAYS * 864e5)
    .slice(-MAX_INCIDENTS);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: now, intervalMinutes: INTERVAL, site: cfg.site || {}, servers: out, incidents,
  }));
})();
