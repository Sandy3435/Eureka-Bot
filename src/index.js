const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const db = require('./db');
const admin = require('./admin');
const { handleIncoming } = require('./handlers');
const { jidToPhone } = require('./utils');

const logger = pino({ level: 'warn' });

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 20;

async function connect() {
  const authDir = path.resolve(config.authDir);
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.macOS('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  admin.setSocket(sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp (Linked Devices):\n');
      qrcode.generate(qr, { small: true });
      console.log('\n');
    }
    if (connection === 'open') {
      reconnectAttempts = 0;
      console.log('✅ WhatsApp connected as', sock.user?.id);
      console.log('Bot name:', config.botName);
      if (!config.groupLink) console.warn('⚠️  GROUP_INVITE_LINK not set — opportunity requests will nudge admin.');
      if (!config.aiApiKey && config.aiProvider !== 'ollama') console.warn('⚠️  AI_API_KEY not set — Q&A will fail.');
      if (!config.adminNumber) console.warn('⚠️  ADMIN_WHATSAPP_NUMBER not set — admin nudges disabled.');
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log('Connection closed. code=', code, 'reconnect=', shouldReconnect);
      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        const delay = Math.min(30_000, 2000 * reconnectAttempts);
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
        setTimeout(connect, delay);
      } else if (code === DisconnectReason.loggedOut) {
        console.log('Logged out. Delete data/auth and re-pair.');
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify' && m.type !== 'append') return;
    for (const msg of m.messages) {
      // skip if from self and not a real incoming (we handle own? no)
      await handleIncoming(sock, msg);
    }
  });

  // optional: send a startup nudge to admin
  sock.ev.on('connection.update', async (u) => {
    if (u.connection === 'open' && config.adminNumber) {
      try {
        await admin.nudge('Bot started and connected. ✅');
      } catch {}
    }
  });
}

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  try { sock?.end(); } catch {}
  process.exit(0);
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

connect().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});