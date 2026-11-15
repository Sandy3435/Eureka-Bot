# WhatsApp Opportunity Bot

Self-hosted WhatsApp automation for a **regular WhatsApp number**. It:
- Channels people asking for access to opportunities into your WhatsApp group.
- Answers incoming questions using a free AI (Groq by default).
- Nudges you on WhatsApp when an action is required.

> ⚠️ This uses an **unofficial** WhatsApp Web library (Baileys). There is a real risk of the number being banned. Use a secondary number if possible, avoid spamming, and keep volumes human-like.

## Requirements
- Node.js 20+ (tested on 24)
- A WhatsApp account (regular number) for the bot
- A WhatsApp group + its invite link
- A free AI API key (Groq recommended: https://console.groq.com)

## Quick start (local)
1. `cp .env.example .env` (or copy manually on Windows) and fill in values.
2. `npm install`
3. `npm start`
4. Scan the QR code with WhatsApp → Linked Devices.
5. Send a test message to the bot number from another phone.

## Get your group invite link
WhatsApp group → group info → Invite via link → Copy link. Paste into `GROUP_INVITE_LINK`.

## Free AI setup (Groq)
1. Sign up at https://console.groq.com (free).
2. Create an API key.
3. Set `AI_PROVIDER=groq` and `AI_API_KEY=...` in `.env`.

## Hosting (please read)

⚠️ **Vercel / serverless platforms will NOT work for this bot.** Baileys needs a *persistent* WebSocket connection and a writable filesystem for auth state. Serverless functions time out and are stateless. Use a platform that runs a long-lived Node process instead:

- **Render** (Web Service, paid starter or free with sleep) — `render.yaml` included.
- **Railway** / **Fly.io** — Dockerfile included.
- **VPS** (DigitalOcean, Hetzner, etc.) — recommended for true 24/7.
- Your own always-on PC.

## Deploy on your hosting (24/7)
Your hosting plan must support **Node.js apps / long-running processes** (not shared PHP-only hosting).

### If your hosting supports Node (e.g., VPS, PaaS, Node-capable shared host)
1. Upload the project folder (without `node_modules` and `data/`).
2. Create a Node app / subdomain, e.g. `bot.yourdomain.com`.
3. Set environment variables from `.env` in the host panel.
4. Run `npm install` on the server.
5. Start with PM2 (recommended):
   - `npm i -g pm2`
   - `pm2 start src/index.js --name wa-bot`
   - `pm2 save && pm2 startup`
6. First run: check logs for the QR code (`pm2 logs wa-bot`), scan it. Auth state persists in `data/auth`.

### If your hosting is PHP/static only
Use a cheap VPS ($5/mo) or a free/low-cost Node host (Render, Railway, Fly.io). Note: some PaaS sleep on free tiers — WhatsApp needs a persistent connection, so prefer a VPS or always-on plan.

## Pairing / re-pairing
- First run prints a QR code in the terminal. Scan via WhatsApp → Settings → Linked Devices → Link a device.
- To re-pair: `npm run reset-auth` then `npm start`.

## How it works
- `src/index.js` — Baileys connection, QR, reconnect.
- `src/handlers.js` — incoming message routing + flows.
- `src/ai.js` — intent classification + Q&A (pluggable provider).
- `src/admin.js` — nudges you on WhatsApp.
- `src/db.js` — SQLite (node:sqlite) for contacts/messages/state.

## Flows
1. **Opportunity access** → sends group invite link; if not configured, nudges admin.
2. **Question** → AI answers; if AI fails, nudges admin.
3. **Action needed** → polite holding reply + nudge to admin with summary.
4. **Greeting** → welcome menu.

## Customizing
- Edit the system prompt via `AI_SYSTEM_PROMPT` or `src/ai.js` → `buildSystemPrompt`.
- Add new intents in `ai.classify` and handle in `handlers.handleIncoming`.
- Change rate limits, history length via env.

## Action items for you (checklist)
- [ ] Create a WhatsApp group for opportunities; get invite link.
- [ ] Sign up for free Groq (or Gemini) API key.
- [ ] Decide hosting (VPS recommended for 24/7).
- [ ] Fill `.env` (admin number, group link, API key).
- [ ] Run locally, scan QR, test all 3 flows.
- [ ] Deploy + set up PM2 + scan QR again on server.
- [ ] (Recommended) Use a secondary number to reduce ban risk.

## Troubleshooting
- **QR not showing / connection drops**: ensure only one instance runs; check Node version.
- **"Logged out"**: re-pair with `npm run reset-auth`.
- **AI errors**: verify API key and provider; check logs.
- **No nudges**: set `ADMIN_WHATSAPP_NUMBER`.