const config = require('./config');
const db = require('./db');
const ai = require('./ai');
const admin = require('./admin');
const { rateLimited, isGroup, chunkText, sleep, jidToPhone } = require('./utils');

async function sendText(sock, jid, text) {
  for (const part of chunkText(text)) {
    await sock.sendMessage(jid, { text: part });
    db.messages.log(jid, 'out', part);
    if (chunkText(text).length > 1) await sleep(300);
  }
}

async function handleIncoming(sock, msg) {
  try {
    if (!msg?.message) return;
    const jid = msg.key.remoteJid;
    if (!jid || isGroup(jid)) return; // ignore groups
    if (msg.key.fromMe) return; // ignore own outgoing

    const id = msg.key.id;
    if (id && db.messages.seen(id)) return;

    const text0 = extractText(msg);

    if (rateLimited(jid)) {
      await sendText(sock, jid, 'You are sending messages too quickly. Please slow down a bit. 🙏');
      return;
    }

    const text = text0;
    if (!text) {
      await sendText(sock, jid, 'Hi! Send me a text message and I will help you. 😊');
      return;
    }

    // capture prior history BEFORE logging this message
    const history = db.messages.recent(jid, config.maxHistory);

    const contact = db.contacts.upsert(jid, { name: msg.pushName || null });

    if (id) db.messages.log(jid, 'in', text, id);

    // classify intent
    const intent = await ai.classify(text, history);
    console.log(`[${jid}] intent=${intent}: ${text.slice(0, 60)}`);

    switch (intent) {
      case 'greeting':
        await sendText(
          sock,
          jid,
          `Hi ${msg.pushName || 'there'}! 👋 Welcome to ${config.orgName}.\n\n` +
            `I can help you:\n• Get access to opportunities (${config.opportunitiesDesc})\n• Answer your questions\n\n` +
            `Just tell me what you need.`
        );
        db.contacts.setState(jid, 'engaged');
        break;

      case 'opportunity_access':
        db.contacts.setState(jid, 'channeled');
        if (config.groupLink) {
          await sendText(
            sock,
            jid,
            `Great news! 🎉 To get access to opportunities, please join our group:\n\n${config.groupLink}\n\n` +
              `Once you join, you'll receive updates on ${config.opportunitiesDesc}. Welcome aboard! 🚀`
          );
        } else {
          await sendText(
            sock,
            jid,
            `I'd love to get you access! Our group link isn't set up yet — I've notified the team and they'll send it shortly.`
          );
          await admin.nudge(`New opportunity-access request from ${msg.pushName || jidToPhone(jid)} (${jidToPhone(jid)}). Group link not configured; please share manually.`);
        }
        break;

      case 'question':
        db.contacts.setState(jid, 'qa');
        const reply = await ai.answer(text, history, `User: ${msg.pushName || ''}`);
        await sendText(sock, jid, reply || "I'm not sure about that, but I've notified the team to get back to you.");
        if (!reply) {
          await admin.nudge(`Question I couldn't answer from ${msg.pushName || jidToPhone(jid)}: "${text}"`);
        }
        break;

      case 'action_needed':
        db.contacts.setState(jid, 'action_needed');
        await sendText(
          sock,
          jid,
          `Thanks for reaching out. That needs a closer look from our team — I've passed it along and someone will get back to you shortly. 🙏`
        );
        await admin.maybeNudge({ jid, name: msg.pushName, intent, text, history });
        break;

      default:
        // other: try to be helpful
        db.contacts.setState(jid, 'engaged');
        const r = await ai.answer(text, history, `User: ${msg.pushName || ''}`);
        await sendText(sock, jid, r || 'How can I help you today? You can ask about opportunities or any question.');
        break;
    }
  } catch (e) {
    console.error('[handler] error:', e);
  }
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return '';
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return '';
}

module.exports = { handleIncoming, sendText, extractText };