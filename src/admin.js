const config = require('./config');
const { jidToPhone, normalizePhone } = require('./utils');
const db = require('./db');

let sockRef = null;
function setSocket(sock) { sockRef = sock; }

function adminJid() {
  const num = normalizePhone(config.adminNumber);
  if (!num) return null;
  return `${num}@s.whatsapp.net`;
}

async function nudge(text) {
  const jid = adminJid();
  if (!jid || !sockRef) {
    console.log('[admin] nudge skipped (no admin number/socket):', text);
    return false;
  }
  try {
    await sockRef.sendMessage(jid, { text: `🔔 *Action needed*\n\n${text}` });
    db.messages.log(jid, 'out', text);
    return true;
  } catch (e) {
    console.error('[admin] nudge failed:', e.message);
    return false;
  }
}

// Decide if a message/intent requires admin action. We nudge on 'action_needed' intent
// and optionally on first contact. Could be extended.
async function maybeNudge({ jid, name, intent, text, history }) {
  if (!config.autoNudge) return;
  if (intent !== 'action_needed') return;
  const { summarizeForAdmin } = require('./ai');
  const summary = await summarizeForAdmin(text, history);
  const phone = jidToPhone(jid);
  await nudge(`From: ${name || phone} (${phone})\nIntent: ${intent}\n\n${summary}`);
}

module.exports = { setSocket, nudge, maybeNudge, adminJid };