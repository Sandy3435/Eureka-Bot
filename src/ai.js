const config = require('./config');

const DEFAULT_MODELS = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  ollama: 'llama3.2',
};

function model() {
  return config.aiModel || DEFAULT_MODELS[config.aiProvider] || DEFAULT_MODELS.groq;
}

function buildSystemPrompt(ctx) {
  if (config.aiSystemPrompt) return config.aiSystemPrompt;
  return [
    `You are ${config.botName}, a helpful WhatsApp assistant for ${config.orgName}.`,
    `We help people get access to opportunities: ${config.opportunitiesDesc}.`,
    `When someone wants access to opportunities or asks to join, direct them to our group: ${config.groupName} (${config.groupLink || 'link available on request'}).`,
    'Answer questions clearly, concisely and warmly. Keep replies short (WhatsApp-friendly, under ~600 chars when possible).',
    'If a request requires a human decision/approval/action that you cannot do, say so and that you will notify the team.',
    'Never invent facts; if unsure, say you will check and get back.',
    ctx ? `Context: ${ctx}` : '',
  ].filter(Boolean).join('\n');
}

// --- Providers ---

async function groqChat(messages, system) {
  const { Groq } = require('groq-sdk');
  const client = new Groq({ apiKey: config.aiApiKey });
  const res = await client.chat.completions.create({
    model: model(),
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: 0.4,
    max_tokens: 512,
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

async function openaiChat(messages, system) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: config.aiApiKey });
  const res = await client.chat.completions.create({
    model: model(),
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: 0.4,
    max_tokens: 512,
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

async function geminiChat(messages, system) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const client = new GoogleGenerativeAI(config.aiApiKey);
  const m = client.getGenerativeModel({ model: model(), systemInstruction: system });
  // convert messages to gemini format
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const last = messages[messages.length - 1];
  const chat = m.startChat({ history });
  const res = await chat.sendMessage(last.content);
  return res.response.text().trim();
}

async function ollamaChat(messages, system) {
  const base = config.ollamaBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model(), messages: [{ role: 'system', content: system }, ...messages], stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return (data.message?.content || '').trim();
}

async function chat(messages, system) {
  switch (config.aiProvider) {
    case 'gemini':
      return geminiChat(messages, system);
    case 'openai':
      return openaiChat(messages, system);
    case 'ollama':
      return ollamaChat(messages, system);
    case 'groq':
    default:
      return groqChat(messages, system);
  }
}

// Classify an incoming message into an intent.
// Returns one of: opportunity_access | question | action_needed | greeting | other
async function classify(text, history = []) {
  const system = [
    'You classify a WhatsApp message from someone contacting an opportunity-access assistant.',
    'Reply with ONLY one token from this set: opportunity_access, question, action_needed, greeting, other.',
    'opportunity_access: wants to join/get access to opportunities, group, or "help me access".',
    'question: asks for information/explanation.',
    'action_needed: requires a human to do something (approve, send file, schedule, payment, exception, complaint needing human).',
    'greeting: hi/hello/hey only.',
    'other: anything else.',
  ].join(' ');
  const msgs = [...history.slice(-4).map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.text })), { role: 'user', content: text }];
  try {
    const out = await chat(msgs, system);
    const token = (out || '').toLowerCase().match(/opportunity_access|question|action_needed|greeting|other/);
    return token ? token[0] : 'other';
  } catch (e) {
    // fallback heuristic
    const t = text.toLowerCase();
    if (/(join|access|opportunity|group|help me)/.test(t)) return 'opportunity_access';
    if (/\?/.test(t)) return 'question';
    return 'other';
  }
}

async function answer(text, history = [], ctx = '') {
  const msgs = [
    ...history.slice(-config.maxHistory).map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: text },
  ];
  return chat(msgs, buildSystemPrompt(ctx));
}

// Summarize a conversation/request for the admin nudge.
async function summarizeForAdmin(text, history = []) {
  const system =
    'Summarize this WhatsApp request for the admin in 2-3 short lines: who/what is needed and suggested next action. No fluff.';
  const msgs = [...history.slice(-6).map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.text })), { role: 'user', content: text }];
  try {
    return await chat(msgs, system);
  } catch (e) {
    return text;
  }
}

module.exports = { classify, answer, summarizeForAdmin, buildSystemPrompt };