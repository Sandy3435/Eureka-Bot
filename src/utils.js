const config = require('./config');

function jidToPhone(jid) {
  return (jid || '').split('@')[0].split(':')[0];
}

function isGroup(jid) {
  return (jid || '').endsWith('@g.us');
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

// simple in-memory rate limiter per jid
const buckets = new Map();
function rateLimited(jid) {
  const now = Date.now();
  const windowMs = 60_000;
  const b = buckets.get(jid) || { count: 0, reset: now + windowMs };
  if (now > b.reset) {
    b.count = 0;
    b.reset = now + windowMs;
  }
  b.count += 1;
  buckets.set(jid, b);
  return b.count > config.rateLimitPerMinute;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunkText(text, max = 1800) {
  if (!text || text.length <= max) return [text];
  const parts = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + max));
    i += max;
  }
  return parts;
}

module.exports = { jidToPhone, isGroup, normalizePhone, rateLimited, sleep, chunkText };