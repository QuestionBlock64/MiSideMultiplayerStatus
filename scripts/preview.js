// Local preview: node scripts/preview.js  ->  http://localhost:8080
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const root = path.join(__dirname, "..");
const site = path.join(root, "site");
const status = path.join(site, "status.json");
const old = fs.existsSync(status) ? fs.readFileSync(status) : null;
fs.mkdirSync(site, { recursive: true });
fs.cpSync(path.join(root, "public"), site, { recursive: true });
if (old) fs.writeFileSync(status, old);
else fs.writeFileSync(status, "{}");
spawnSync("node", [path.join(__dirname, "check.js"), status, status], { stdio: "inherit" });
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  const u = req.url.split("?")[0];
  const f = path.join(site, u === "/" ? "index.html" : u);
  if (!f.startsWith(site)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(d);
  });
}).listen(8080, () => console.log("Preview on http://localhost:8080"));
