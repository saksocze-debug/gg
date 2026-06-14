// server.js — ANKA AI OS
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

// Modüller — backend/modules/ altında
const SettingsManager = require('./modules/settingsManager');
const MemoryManager   = require('./modules/memoryManager');
const DeviceManager   = require('./modules/deviceManager');
const NotesManager    = require('./modules/notesManager');
const AIProvider      = require('./modules/aiProvider');
const CommandParser   = require('./modules/commandParser');

// DB
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'jarvis.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const settings = new SettingsManager(db);
const memory   = new MemoryManager(db);
const notes    = new NotesManager(db);

const ai = new AIProvider({
  provider:        process.env.AI_PROVIDER,
  // Groq
  groqApiKey:      process.env.GROQ_API_KEY,
  groqModel:       process.env.GROQ_MODEL,
  // OpenAI
  openaiApiKey:    process.env.OPENAI_API_KEY,
  openaiModel:     process.env.OPENAI_MODEL,
  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel:  process.env.ANTHROPIC_MODEL,
  // Ollama
  ollamaBaseUrl:   process.env.OLLAMA_BASE_URL,
  ollamaModel:     process.env.OLLAMA_MODEL,
  temperature:     parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  maxTokens:       parseInt(process.env.AI_MAX_TOKENS   || '4096', 10)
});

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.FRONTEND_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX        || '60',    10)
});
app.use('/api/', limiter);

const io = new Server(server, { cors: { origin: allowedOrigin, methods: ['GET','POST'] } });
const devices = new DeviceManager(db, io);
const parser  = new CommandParser({ memory, notes, devices, settings });

// ─── API ────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, provider: process.env.AI_PROVIDER, ts: Date.now() }));

app.get('/api/settings', (_, res) => res.json(settings.getAll()));
app.put('/api/settings', (req, res) => res.json(settings.setMany(req.body || {})));

app.get('/api/conversations', (_, res) => res.json(memory.listConversations()));
app.post('/api/conversations', (req, res) => res.json(memory.createConversation(req.body?.title)));
app.delete('/api/conversations/:id', (req, res) => { memory.deleteConversation(req.params.id); res.json({ ok: true }); });
app.get('/api/conversations/:id/messages', (req, res) => res.json(memory.getRecentMessages(req.params.id, 100)));

app.get('/api/memory', (_, res) => res.json(memory.listMemory()));
app.post('/api/memory', (req, res) => {
  const { key, value } = req.body || {};
  if (!key || !value) return res.status(400).json({ error: 'key ve value zorunlu' });
  memory.remember(key, value);
  res.json({ ok: true });
});
app.delete('/api/memory', (_, res) => { memory.clearLongMemory(); res.json({ ok: true }); });
app.get('/api/memory/export', (_, res) => res.json(memory.exportAll()));

app.get('/api/notes', (req, res) => res.json(notes.list({ category: req.query.category, search: req.query.search })));
app.post('/api/notes', (req, res) => { try { res.json(notes.create(req.body)); } catch(e) { res.status(400).json({ error: e.message }); } });
app.put('/api/notes/:id', (req, res) => res.json(notes.update(parseInt(req.params.id,10), req.body)));
app.delete('/api/notes/:id', (req, res) => res.json(notes.delete(parseInt(req.params.id,10))));
app.get('/api/notes/categories', (_, res) => res.json(notes.categories()));

app.get('/api/devices', (_, res) => res.json(devices.list()));
app.put('/api/devices/:id/rename', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name zorunlu' });
  res.json(devices.rename(req.params.id, name));
});

// Chat
app.post('/api/chat', async (req, res) => {
  try {
    let { conversationId, message } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ error: 'Mesaj boş olamaz.' });

    if (!conversationId) {
      const c = memory.createConversation(message.slice(0, 40));
      conversationId = c.id;
    }

    if (parser.isCommand(message)) {
      const result = await parser.handle(message, { conversationId });
      memory.addMessage(conversationId, 'user', message);
      memory.addMessage(conversationId, 'assistant', result.message);
      return res.json({ conversationId, type: result.type, reply: result.message });
    }

    const implicit = parser.detectImplicitMemory(message);
    if (implicit) memory.remember('not', implicit);

    memory.addMessage(conversationId, 'user', message);

    const history      = memory.getRecentMessages(conversationId, 20);
    const memContext   = memory.searchMemory(message, 5);
    const notesContext = notes.list({ search: message }).slice(0, 3);
    const systemPrompt = ai.buildSystemPrompt({ settings: settings.getAll(), memoryContext: memContext, notesContext });

    const reply = await ai.chat({ systemPrompt, history: history.slice(0,-1), userMessage: message });
    memory.addMessage(conversationId, 'assistant', reply);

    res.json({ conversationId, type: 'message', reply });
  } catch (err) {
    console.error('Chat hatası:', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  socket.on('device:register',  (info) => { devices.register(socket.id, info); socket.emit('device:registered', { socketId: socket.id }); });
  socket.on('device:heartbeat', ()     => devices.heartbeat(socket.id));
  socket.on('disconnect',       ()     => devices.disconnect(socket.id));
});

const PORT = parseInt(process.env.PORT || '3400', 10);
server.listen(PORT, () => {
  console.log(`\n  ⚡ ANKA çalışıyor: http://localhost:${PORT}`);
  console.log(`  🤖 AI Sağlayıcı: ${process.env.AI_PROVIDER || 'mock'}`);
  console.log(`  💾 Veritabanı:   ${path.join(dbDir, 'jarvis.db')}\n`);
});
