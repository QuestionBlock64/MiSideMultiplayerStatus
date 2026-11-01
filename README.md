# MiSide Multiplayer status page

A GitHub Action checks all servers every 5 minutes and publishes a static status page on GitHub Pages.

## Setup
1. Create a **public** GitHub repo and push everything in this folder to the `main` branch.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions** tab → **Status** → **Run workflow**. Enable workflows if GitHub asks.
4. Your page: `https://<your-username>.github.io/<repo-name>/`

## Logo and background
Put `logo.png` and `background.jpg` in `public/assets/`, then commit. Other names or formats: change `site.logo` and `site.background` in `config.json`.

## Servers
Edit `servers` in `config.json` (id, name, host, port). Keep each `id` the same if you only rename a server, so its history stays.

To keep addresses out of the public repo, add a repo secret named `SERVERS_JSON` holding the same `servers` array as JSON. It overrides `config.json`.

## Local preview
`node scripts/preview.js` then open http://localhost:8080
`node scripts/probe.js` tests every port one by one and all at once.

## Server load
Each check is one TCP connect per server, closed immediately, with no data sent. Servers are checked 3 seconds apart, once every 5 minutes, and a failed check is retried once after 5 seconds. Visitors to the page never touch your servers: they only read a saved `status.json`.
To check less often, change `*/5` in `.github/workflows/status.yml` (for example `*/10`) and set `intervalMinutes` in `config.json` to match.

## Notes
- Checks run from GitHub's servers, not your PC. Ping times are measured from there.
- GitHub runs scheduled jobs on a best-effort basis, so checks can be a few minutes late. The page warns if data is over 25 minutes old.
- History is kept on a branch named `data` in the same repo.
