# WhiteBoardDefense -- Deployment Guide
## Windows Server / Windows PC

---

## Overview

WhiteBoardDefense is a React/TypeScript/Node.js academic oral defense platform.
It runs as a Node.js backend on port 3456, managed by PM2, serving **HTTPS directly**
using a self-signed certificate. Students connect to the server's IP address and
port (e.g. `https://192.168.0.102:3456`) -- no domain name is required.

| Component | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js (Express + WebSocket), HTTPS terminated in Node |
| Process Manager | PM2 |
| TLS | Self-signed certificate (OpenSSL), bound to the server's IP address |
| Reverse Proxy | Not required (Node serves HTTPS directly on 3456) |
| AI Providers | OpenAI (default), Anthropic Claude, Google Gemini |
| Source Control | GitHub (dbreeding2/WhiteBoardDefense) |

> **Note on IIS:** earlier deployments used IIS + ARR as a reverse proxy on port 80.
> Since students now connect over the internet by IP address rather than a campus
> domain, TLS is terminated directly in Node and IIS is no longer required for this
> app. If you later acquire a domain name, see **"Optional: Domain + IIS + Let's
> Encrypt"** at the end of this guide for a path to a browser-trusted certificate.

---

## Prerequisites

### 1 -- Install Node.js
Download the LTS installer (v18 or higher) from https://nodejs.org and install.
Verify in PowerShell:
```powershell
node -v    # should print v18.x or higher
npm -v
```

### 2 -- Install PM2 and PM2 Windows Startup
```powershell
npm install -g pm2
npm install -g pm2-windows-startup
```

### 3 -- OpenSSL (for generating the self-signed certificate)
If you don't already have OpenSSL on the server, Git for Windows includes it. If
you're running it from inside a conda environment, note that conda's OpenSSL
sometimes can't find its own config file by default (see Troubleshooting below).

---

## Installation

### 1 -- Clone the repository
```powershell
git clone https://github.com/dbreeding2/WhiteBoardDefense C:\inetpub\wwwroot\WhiteBoardDefense
cd C:\inetpub\wwwroot\WhiteBoardDefense
```

### 2 -- Install dependencies
```powershell
npm install
```

### 3 -- Generate a self-signed TLS certificate

Create the certificate folder:
```powershell
New-Item -ItemType Directory -Force -Path C:\certs\whiteboarddefense
```

Generate a cert/key pair. Include **every IP address** the server will be reached
by in the `subjectAltName` -- typically your LAN IP (for testing) and your public
IP (for real student access):

```powershell
openssl req -x509 -nodes -days 825 -newkey rsa:2048 -keyout C:\certs\whiteboarddefense\key.pem -out C:\certs\whiteboarddefense\cert.pem -subj "/CN=YOUR.PUBLIC.IP" -addext "subjectAltName=IP:192.168.0.102,IP:YOUR.PUBLIC.IP"
```

Replace `192.168.0.102` with your actual LAN IP and `YOUR.PUBLIC.IP` with your
actual public IP (or drop the public one for a LAN-only test build, and
regenerate later once you have it).

> **PowerShell note:** if writing this across multiple lines, use a backtick
> (`` ` ``) for line continuation, not a backslash (`\`) -- PowerShell treats `\`
> as part of the argument, which causes `Extra option` / `command not
> recognized` errors.

> **"Can't open openssl.cnf" error?** This means the `openssl` on your PATH can't
> find its config file (common with conda-installed OpenSSL). Find the real
> config with `where.exe openssl` and a search under that install's `ssl\`
> folder, then run `$env:OPENSSL_CONF = "C:\path\to\openssl.cnf"` before
> retrying the command above. This only lasts for the current PowerShell
> session -- set it again if you reopen the terminal to regenerate later.

The cert is valid for 825 days (~2.25 years). Set a reminder to regenerate it
before it expires.

### 4 -- Create the .env file
Create `C:\inetpub\wwwroot\WhiteBoardDefense\.env` with the following:
```
PORT=3456
AI_PROVIDER=openai

# TLS -- only needed if your cert files aren't at the defaults below
TLS_CERT_PATH=C:\certs\whiteboarddefense\cert.pem
TLS_KEY_PATH=C:\certs\whiteboarddefense\key.pem
```

If `TLS_CERT_PATH`/`TLS_KEY_PATH` point to files that exist, the server starts in
HTTPS mode automatically. If the cert files aren't found, it falls back to plain
HTTP with a console warning -- useful for local dev, but **not** suitable for
real student access.

**AI Provider options** -- set `AI_PROVIDER` to one of:
- `openai` (default) -- requires `OPENAI_API_KEY`
- `claude` -- requires `CLAUDE_API_KEY`
- `gemini` -- requires `GEMINI_API_KEY`

Add the corresponding API key to `.env`:
```
OPENAI_API_KEY=sk-...
```
or
```
CLAUDE_API_KEY=sk-ant-...
```
or
```
GEMINI_API_KEY=AI...
```

**Optional model overrides** (defaults shown):
```
OPENAI_MODEL=gpt-4o-mini
CLAUDE_MODEL=claude-haiku-4-5-20251001
GEMINI_MODEL=gemini-2.0-flash
```

**Optional -- force a specific share-link hostname** (only needed if you want
share links to show something other than what students actually typed in their
browser, e.g. a specific domain once you have one):
```
PUBLIC_BASE_URL=https://your-domain-if-you-get-one.example.com
```

> Note: API keys are stored in GitHub Secrets for CI/CD deployments.
> For manual installs, add them directly to the .env file.
> Never commit the .env file to Git -- it is in .gitignore.

### 5 -- Build the project
```powershell
npm run build
```
This produces:
- `dist/` -- compiled React frontend
- `dist/server.cjs` -- compiled Node.js backend

### 6 -- Start the server with PM2
```powershell
pm2 start dist/server.cjs --name WhiteBoardDefense
pm2 save
pm2-startup install
```

Check the logs for confirmation that HTTPS came up correctly:
```powershell
pm2 logs WhiteBoardDefense
```
You should see `[TLS] HTTPS enabled using cert: C:\certs\whiteboarddefense\cert.pem`.
If instead you see a `[TLS] WARNING: cert files not found...` line, double-check
the paths in `.env` and that step 3 actually produced both `.pem` files.

### 7 -- Open the firewall port
```powershell
New-NetFirewallRule -DisplayName "WhiteBoardDefense HTTPS 3456" -Direction Inbound -Protocol TCP -LocalPort 3456 -Action Allow
```
Run this from an **elevated** (Run as Administrator) PowerShell prompt.

### 8 -- Router / public access
If students will connect from off-campus, forward **port 3456** from your
router/firewall to this server's internal IP. (No port 80/443 forwarding is
needed since there's no domain or IIS in front of this app.)

---

## Verify Everything Works

1. From this machine: go to `https://localhost:3456` -- the WhiteBoardDefense UI
   should load (you'll get a certificate warning; click through it).
2. From another device on the same LAN: go to `https://<LAN-IP>:3456`.
3. From a device outside your network (e.g. phone on cellular data, once port
   forwarding is set up): go to `https://<PUBLIC-IP>:3456`.
4. Every one of these will show a **"Not secure"** warning in the browser --
   this is expected and correct for a self-signed certificate. Click
   **Advanced -> Proceed** to continue. See the Student Guide for how to explain
   this to students.
5. Upload a paper, generate questions -- the AI provider configured in `.env`
   should respond.
6. Confirm session persistence: get partway through a defense, refresh the
   page, and confirm it returns to the same stage instead of resetting to the
   setup screen.

---

## PM2 Commands

```powershell
pm2 start WhiteBoardDefense      # start
pm2 stop WhiteBoardDefense       # stop
pm2 restart WhiteBoardDefense    # restart
pm2 status                       # check status
pm2 logs WhiteBoardDefense       # view live logs
```

---

## Updating After Code Changes

```powershell
cd C:\inetpub\wwwroot\WhiteBoardDefense
git pull origin main
npm install
npm run build
pm2 restart WhiteBoardDefense
```

---

## AI Provider Temperature Settings

The platform uses different temperatures per task type for consistency and integrity:

| Task | Temperature | Reason |
|---|---|---|
| Question generation | 0.7 | Varied questions per student |
| Oral defense chat | 0.3 | Consistent, harder to fool |
| Diagram evaluation | 0.3 | Consistent grading |
| Written answer evaluation | 0.3 | Consistent grading |
| Metadata analysis | 0.3 | Deterministic scoring |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[TLS] WARNING: cert files not found` in logs | Confirm `TLS_CERT_PATH`/`TLS_KEY_PATH` in `.env` point to real files, and that step 3's OpenSSL command actually completed (check `C:\certs\whiteboarddefense\` for both `.pem` files) |
| `Can't open openssl.cnf for reading` when generating cert | Conda's OpenSSL can't find its config. Run `where.exe openssl` to find the active binary, locate its `ssl\openssl.cnf`, then `$env:OPENSSL_CONF = "<path>"` before retrying |
| `-keyout`/`-out`/etc. "not recognized as a cmdlet" in PowerShell | You used `\` for line continuation -- PowerShell needs a backtick (`` ` ``) instead, or put the whole command on one line |
| `Can't open ...\key.pem for writing` | The output folder doesn't exist yet -- run `New-Item -ItemType Directory -Force -Path C:\certs\whiteboarddefense` first |
| Browser shows "Not secure" | **Expected** with a self-signed cert -- click Advanced -> Proceed. This is not a bug |
| Certificate name mismatch error (not just the usual warning) | The IP you're connecting to isn't in the cert's `subjectAltName` list -- regenerate the cert including that IP |
| AI questions not generating | Check API key in `.env` and verify `AI_PROVIDER` matches the key |
| WebSocket disconnects | Confirm the page loaded over `https://` (not `http://`) -- the client builds `wss://` vs `ws://` based on the page's own protocol |
| Port already in use | Run `pm2 delete WhiteBoardDefense` then `pm2 start dist/server.cjs --name WhiteBoardDefense` |
| Students can't connect from off-campus | Confirm port 3456 is forwarded on your router, and allowed in Windows Firewall |
| Refresh loses a finished report | Confirmed fixed as of this version -- if you still see this, confirm you're running the latest `App.tsx` and haven't cleared browser storage |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | 3456 | Port Node.js listens on |
| `TLS_CERT_PATH` | Recommended | `C:\certs\whiteboarddefense\cert.pem` | Path to the TLS certificate file |
| `TLS_KEY_PATH` | Recommended | `C:\certs\whiteboarddefense\key.pem` | Path to the TLS private key file |
| `PUBLIC_BASE_URL` | No | derived from request | Force a specific hostname for share links (e.g. once you have a domain) |
| `AI_PROVIDER` | No | openai | AI backend: `openai`, `claude`, or `gemini` |
| `OPENAI_API_KEY` | If using OpenAI | -- | OpenAI API key |
| `OPENAI_MODEL` | No | gpt-4o-mini | OpenAI model name |
| `CLAUDE_API_KEY` | If using Claude | -- | Anthropic API key |
| `CLAUDE_MODEL` | No | claude-haiku-4-5-20251001 | Claude model name |
| `GEMINI_API_KEY` | If using Gemini | -- | Google AI API key |
| `GEMINI_MODEL` | No | gemini-2.0-flash | Gemini model name |

> `SERVER_IP` is no longer used -- share links are now built automatically from
> the actual request the browser made (correct IP, correct `https`), removing
> the need to hardcode or auto-detect a LAN IP.

---

## Optional: Domain + IIS + Let's Encrypt

If you later acquire a domain name and want a browser-trusted certificate (no
more "Not secure" warnings), the setup changes to:
1. Point a DNS A record at the server's public IP.
2. Install IIS + URL Rewrite + ARR, and enable the WebSocket Protocol feature.
3. Use `win-acme` to get a free, auto-renewing Let's Encrypt certificate bound
   to IIS on port 443.
4. Let IIS terminate TLS and reverse-proxy to Node on `localhost:3456` (plain
   HTTP internally).
5. Set `PUBLIC_BASE_URL=https://your-domain.example.com` in `.env` so share
   links use the domain instead of the raw IP.

Ask if/when you're ready to make this move -- it's a different setup path from
the IP-based one above, but the app code supports both without changes beyond
the `.env` settings.

---

## Repository

GitHub: https://github.com/dbreeding2/WhiteBoardDefense

API keys for CI/CD are stored as GitHub Secrets and injected automatically
on deployment -- they do not need to be in the repository.
