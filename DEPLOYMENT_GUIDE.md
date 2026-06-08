# WhiteBoardDefense — Ollama + IIS Deployment Guide
## Windows Server 2025

---

## What Changed From the Original

| Original | Converted |
|---|---|
| `@google/genai` SDK | Native `fetch()` to Ollama REST API |
| `GEMINI_API_KEY` env var | `OLLAMA_HOST` + `OLLAMA_MODEL` env vars |
| Gemini model fallback chain | Single Ollama model with retry/backoff |
| Structured `responseSchema` (Gemini-specific) | JSON-in-prompt + `parseJsonResponse()` helper |

No frontend (React/TSX) files were changed — only `server.ts`, `package.json`, and `.env`.

---

## Prerequisites

### 1 — Install Node.js on the server
Download the LTS installer from https://nodejs.org and install.
Verify in PowerShell:
```
node -v   # should print v20.x or higher
npm -v
```

### 2 — Install Ollama on the server
Download from https://ollama.com/download/windows and run the installer.
After installation, open a new PowerShell window and pull the model:
```
ollama pull gemma4:latest
```
Verify Ollama is running:
```
curl http://localhost:11434/api/tags
```
You should see a JSON list of models.

> **Note:** Ollama runs as a background service on Windows after installation.
> If it's not running, start it with `ollama serve` in a terminal.

### 3 — Install IIS modules
In Server Manager → Add Roles and Features, ensure these are installed:
- Web Server (IIS)
- **URL Rewrite** module (download from IIS.net if not present)
- **Application Request Routing (ARR) 3.0** (download from Web Platform Installer)

After installing ARR, enable the global proxy:
1. Open IIS Manager
2. Click the **server node** (top level)
3. Double-click **Application Request Routing Cache**
4. Click **Server Proxy Settings** in the right-hand Actions panel
5. Check **Enable proxy** → click **Apply**

---

## Project Setup

### 1 — Copy files to server
Place the project folder somewhere accessible, e.g.:
```
C:\inetpub\wwwroot\WhiteBoardDefense\
```

The folder must contain:
```
WhiteBoardDefense/
├── server.ts          ← (replaced file from this package)
├── package.json       ← (replaced file — @google/genai removed)
├── .env               ← (new file — configure OLLAMA_HOST etc.)
├── web.config         ← (new IIS config)
├── tsconfig.json      ← (unchanged)
├── vite.config.ts     ← (unchanged)
├── index.html         ← (unchanged)
├── src/               ← (unchanged)
└── assets/            ← (unchanged)
```

### 2 — Configure .env
Edit `C:\inetpub\wwwroot\WhiteBoardDefense\.env`:
```
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma4:latest
PORT=3000
NODE_ENV=production
APP_URL=http://your-server-hostname-or-ip
```

If Ollama is on a **different machine** (e.g. a GPU workstation), change:
```
OLLAMA_HOST=http://192.168.1.50:11434
```

### 3 — Install dependencies and build
Open PowerShell **as Administrator**, navigate to the project folder, and run:
```powershell
cd C:\inetpub\wwwroot\WhiteBoardDefense
npm install
npm run build
```
This produces a `dist/` folder (React frontend) and `dist/server.cjs` (Node backend).

---

## Running the Node.js Server

### Option A — Run manually (for testing)
```powershell
cd C:\inetpub\wwwroot\WhiteBoardDefense
npm start
```
The server prints: `Whiteboard Defense Server (Ollama/gemma4:latest) live at http://0.0.0.0:3000`

### Option B — Run as a Windows Service (recommended for production)
Use **NSSM** (Non-Sucking Service Manager) to keep Node running automatically.

1. Download NSSM from https://nssm.cc/download and extract to `C:\nssm\`
2. In an elevated PowerShell:
```powershell
C:\nssm\win64\nssm.exe install WhiteboardDefense "C:\Program Files\nodejs\node.exe" "C:\inetpub\wwwroot\WhiteBoardDefense\dist\server.cjs"
C:\nssm\win64\nssm.exe set WhiteboardDefense AppDirectory "C:\inetpub\wwwroot\WhiteBoardDefense"
C:\nssm\win64\nssm.exe set WhiteboardDefense AppEnvironmentExtra "NODE_ENV=production"
C:\nssm\win64\nssm.exe set WhiteboardDefense Start SERVICE_AUTO_START
Start-Service WhiteboardDefense
```
3. Verify the service is running:
```powershell
Get-Service WhiteboardDefense
```

---

## IIS Site Configuration

1. Open **IIS Manager**
2. Right-click **Sites** → **Add Website**
   - Site name: `WhiteboardDefense`
   - Physical path: `C:\inetpub\wwwroot\WhiteBoardDefense`
   - Binding: HTTP, port 80 (or 443 with a certificate for HTTPS)
   - Host name: (optional — leave blank to match all hostnames)
3. Click **OK**
4. The `web.config` file already in the folder will be picked up automatically.

### WebSocket support
IIS must allow WebSocket pass-through. In IIS Manager:
- Select the **WhiteboardDefense** site
- Double-click **Configuration Editor**
- Navigate to `system.webServer/webSocket`
- Set `enabled` to `false` (this tells IIS to let ARR handle WebSocket upgrades instead of IIS's built-in WebSocket handler — already set in web.config)

---

## Verify Everything Works

1. Open a browser on the server and go to `http://localhost`
   - You should see the WhiteBoardDefense React UI.
2. Open the browser from another machine using the server's IP/hostname.
3. Try submitting a paper — the questions should be generated by Ollama.

### Firewall rule (if accessing from other machines)
```powershell
New-NetFirewallRule -DisplayName "WhiteboardDefense HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```
Port 3000 does **not** need to be opened externally — IIS proxies to it internally.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED` errors in Node logs | Ollama isn't running — run `ollama serve` or check the Ollama Windows service |
| Blank page / 502 Bad Gateway in IIS | Node isn't running on port 3000 — check `Get-Service WhiteboardDefense` |
| WebSocket disconnects immediately | Confirm ARR proxy is enabled and `web.config` is in the site root |
| Model not found error from Ollama | Run `ollama pull gemma4:latest` again |
| JSON parse errors from the model | The model returned malformed JSON; consider switching to `llama3.2:latest` or `mistral:latest` as they tend to follow JSON-in-prompt instructions more reliably |

---

## Swapping to a Different Model

Edit `.env` and change `OLLAMA_MODEL`, then restart the service:
```
OLLAMA_MODEL=llama3.2:latest
```
```powershell
Restart-Service WhiteboardDefense
```
Any model available in `ollama list` will work. Vision/multimodal features (whiteboard snapshot analysis) require a vision-capable model such as `gemma4`, `llava`, or `bakllava`.
