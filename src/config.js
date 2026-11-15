require('dotenv').config();

const env = (k, d = '') => (process.env[k] ?? d).trim();

module.exports = {
  // WhatsApp / bot
  botName: env('BOT_NAME', 'Opportunity Assistant'),
  adminNumber: env('ADMIN_WHATSAPP_NUMBER', ''), // E.164 without +, e.g. 2348012345678
  groupLink: env('GROUP_INVITE_LINK', ''),
  groupName: env('GROUP_NAME', 'Opportunities Group'),
  orgName: env('ORG_NAME', 'our community'),
  opportunitiesDesc: env(
    'OPPORTUNITIES_DESC',
    'grants, jobs, scholarships, fellowships and other opportunities'
  ),

  // AI
  aiProvider: env('AI_PROVIDER', 'groq').toLowerCase(), // groq | gemini | openai | ollama
  aiApiKey: env('AI_API_KEY', ''),
  aiModel: env('AI_MODEL', ''),
  ollamaBaseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
  aiSystemPrompt: env('AI_SYSTEM_PROMPT', ''),

  // Behavior
  rateLimitPerMinute: parseInt(env('RATE_LIMIT_PER_MINUTE', '20'), 10),
  maxHistory: parseInt(env('MAX_HISTORY', '8'), 10),
  autoNudge: env('AUTO_NUDGE', 'true').toLowerCase() === 'true',

  // Paths
  dataDir: env('DATA_DIR', './data'),
  authDir: env('AUTH_DIR', './data/auth'),
  dbPath: env('DB_PATH', './data/bot.db'),
};