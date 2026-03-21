require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const Database = require('./database');
const OpenAI = require('openai');
const autoReply = require('./auto-reply');
const kukkiState = require('./kukki-state');
const multer = require('multer');
const dbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const openai = process.env.KIMI_API_KEY ? new OpenAI({
  apiKey: process.env.KIMI_API_KEY,
  baseURL: 'https://api.moonshot.ai/v1',
}) : null;

const db = new Database();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: 'kukki-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
};

// Agent auth middleware
const requireAgentAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  const key = auth.replace('Bearer ', '');
  try {
    const agent = await db.getAgentByKey(key);
    if (agent) { req.agentName = agent.name; return next(); }
  } catch (err) {}
  return res.status(401).json({ error: 'Invalid API key' });
};

// ==========================================
// Auth API
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// ==========================================
// Kukki Live State API
// ==========================================

app.get('/api/kukki', (req, res) => {
  res.json(kukkiState.getKukkiState());
});

app.get('/api/kukki/stats', (req, res) => {
  const totalReplies = db.getRecentReplies(9999).length;
  const repliesToday = db.countRepliesToday();
  // kukki born date — first reply or fallback
  const firstReply = db.getRecentReplies(9999);
  const oldest = firstReply.length > 0 ? firstReply[firstReply.length - 1] : null;
  const bornTs = oldest ? oldest.created_at : Math.floor(Date.now() / 1000);
  const daysAlive = Math.max(1, Math.floor((Date.now() / 1000 - bornTs) / 86400));

  // Count unique users kukki has talked to
  const uniqueUsers = new Set(firstReply.map(r => r.from_username)).size;

  res.json({
    totalReplies,
    repliesToday,
    daysAlive,
    uniqueUsers,
  });
});

// ==========================================
// Public API
// ==========================================

app.get('/api/pets', async (req, res) => {
  try {
    const pets = await db.getAllPets();
    for (const pet of pets) {
      pet.lastActivity = db.getLastActivity(pet.id);
    }
    res.json(pets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pets/:id/activities', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const activities = db.getActivities(parseInt(req.params.id), limit);
    res.json(activities);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/agent/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 30);
    const replies = db.getRecentReplies(limit);
    const filtered = replies.filter(r => r.our_reply && !r.our_reply.startsWith('['));
    res.json(filtered);
  } catch (err) {
    res.json([]);
  }
});

// ==========================================
// Admin Pet API
// ==========================================

app.get('/api/admin/pets/:id', requireAuth, async (req, res) => {
  try {
    const pet = await db.getPetById(req.params.id);
    if (pet) res.json({ success: true, pet });
    else res.status(404).json({ success: false, error: 'Pet not found' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/pets', requireAuth, async (req, res) => {
  try {
    const { ascii, name, race, owner, status } = req.body;
    const petId = await db.createPet(ascii, name, race, owner, status);
    const newPet = await db.getPetById(petId);
    if (newPet) refreshPetAI(newPet).catch(() => {});
    res.json({ success: true, petId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/pets/:id', requireAuth, async (req, res) => {
  try {
    const { ascii, name, race, owner, status } = req.body;
    await db.updatePet(req.params.id, ascii, name, race, owner, status);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/pets/:id', requireAuth, async (req, res) => {
  try {
    await db.deletePet(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/pets/:id/feed', requireAuth, async (req, res) => {
  try {
    const pet = await db.getPetById(req.params.id);
    if (!pet) return res.status(404).json({ success: false, error: 'Pet not found' });

    try {
      const result = await db.feedPet(pet.id);
      if (result.success) {
        const updatedPet = await db.getPetById(pet.id);
        result.pet = updatedPet || pet;
        refreshPetAI(updatedPet || pet).catch(() => {});
      }
      res.json(result);
    } catch (feedError) {
      const cooldownMatch = feedError.message.match(/(\d+)/);
      res.json({
        success: false,
        error: feedError.message,
        pet,
        cooldownMinutes: cooldownMatch ? parseInt(cooldownMatch[1]) : 60
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate pet via AI
app.post('/api/admin/generate-pet', requireAuth, async (req, res) => {
  try {
    const { ownerLink } = req.body;
    if (!ownerLink) return res.json({ success: false, error: 'Owner link required' });

    const usernameMatch = ownerLink.match(/(?:twitter\.com\/|x\.com\/)([^\/\?]+)/);
    const username = usernameMatch ? usernameMatch[1] : 'user';

    const templates = await db.getAllTemplates();
    if (templates.length === 0) return res.json({ success: false, error: 'No templates available' });
    const template = templates[Math.floor(Math.random() * templates.length)];

    let petName = template.name;
    let petRace = template.race;

    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "moonshot-v1-auto",
          messages: [{
            role: "system",
            content: 'You generate creative pet names. Respond with ONLY valid JSON.'
          }, {
            role: "user",
            content: `Generate a creative pet name for a ${template.race} pet. Owner: "${username}". Respond with ONLY: {"name": "CreativeName", "race": "Creative Race"}`
          }],
          max_tokens: 100,
          temperature: 0.9
        });
        let text = completion.choices[0].message.content.trim();
        if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        const data = JSON.parse(text);
        if (data.name) petName = data.name;
        if (data.race) petRace = data.race;
      } catch (aiError) {
        const suffixes = ['Jr', 'X', 'Prime', 'Nova', 'Byte', 'Hex', 'Pixel'];
        petName = `${template.name}-${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
      }
    }

    res.json({ success: true, pet: { ascii: template.ascii, name: petName, race: petRace } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Admin Templates API
// ==========================================

app.get('/api/admin/templates', requireAuth, async (req, res) => {
  try {
    const templates = await db.getAllTemplates();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/templates/:id', requireAuth, async (req, res) => {
  try {
    const template = await db.getTemplateById(req.params.id);
    if (template) res.json({ success: true, template });
    else res.status(404).json({ success: false, error: 'Template not found' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Admin Agent Controls
// ==========================================

app.post('/api/admin/agent/start', requireAuth, (req, res) => {
  res.json(autoReply.startAutoReply());
});

app.post('/api/admin/agent/stop', requireAuth, (req, res) => {
  res.json(autoReply.stopAutoReply());
});

app.get('/api/admin/agent/status', requireAuth, (req, res) => {
  res.json(autoReply.getAutoReplyStatus());
});

app.get('/api/admin/agent/replies', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(autoReply.getRecentReplies(limit));
});

app.post('/api/admin/agent/clear-replies', requireAuth, (req, res) => {
  try {
    const recent = db.getRecentReplies(1);
    const newestId = recent.length > 0 ? recent[0].tweet_id : '';
    db.db.run('DELETE FROM replied_tweets');
    if (newestId) db.setSetting('autoreply_last_seen_id', newestId);
    db.save();
    res.json({ ok: true, message: 'Cleared all replies' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Test kukki reply without posting to X
app.post('/api/admin/agent/test', requireAuth, async (req, res) => {
  try {
    const { username, text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = await autoReply.testReply(username || 'testuser', text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Admin DB Upload/Download
// ==========================================

app.get('/api/admin/db/download', requireAuth, (req, res) => {
  try {
    const data = db.db.export();
    const buffer = Buffer.from(data);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="kukki.db"',
      'Content-Length': buffer.length
    });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/db/upload', requireAuth, dbUpload.single('database'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
    const initSqlJs = require('sql.js');
    initSqlJs().then(SQL => {
      try {
        const testDb = new SQL.Database(new Uint8Array(req.file.buffer));
        const tables = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = tables.length > 0 ? tables[0].values.map(r => r[0]) : [];
        if (!tableNames.includes('pets')) {
          testDb.close();
          return res.status(400).json({ ok: false, error: 'Invalid database -- missing pets table' });
        }
        testDb.close();
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'Invalid SQLite file' });
      }
      db.db.close();
      db.db = new SQL.Database(new Uint8Array(req.file.buffer));
      db.save();
      res.json({ ok: true, message: 'Database replaced' });
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// Agent API (v1) - External agents
// ==========================================

app.post('/api/v1/agent/register', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 64) return res.status(400).json({ error: 'name must be 2-64 characters' });
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) return res.status(400).json({ error: 'name can only contain letters, numbers, hyphens, underscores' });

    const existing = await db.getAgentByName(cleanName);
    if (existing) return res.status(409).json({ error: 'Agent name already taken' });

    const desc = (description || '').trim().slice(0, 280);
    const apiKey = await db.createAgent(cleanName, desc);

    res.status(201).json({
      success: true,
      agent: { name: cleanName, description: desc },
      api_key: apiKey,
      message: 'Save this API key -- it will not be shown again.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/v1/agent/claim', requireAgentAuth, async (req, res) => {
  try {
    const { x_username } = req.body;
    if (!x_username) return res.status(400).json({ error: 'x_username is required' });
    const username = x_username.replace(/^@/, '').trim();
    const ownerLink = `https://x.com/${username}`;

    const existing = await db.getPetByOwner(username);
    if (existing) {
      return res.status(409).json({
        error: 'User already has a pet',
        pet: { id: existing.id, name: existing.name, race: existing.race, ascii: existing.ascii }
      });
    }

    const templates = await db.getAllTemplates();
    if (templates.length === 0) return res.status(500).json({ error: 'No templates' });
    const template = templates[Math.floor(Math.random() * templates.length)];

    let petName = template.name, petRace = template.race;
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "moonshot-v1-auto",
          messages: [{
            role: "system",
            content: 'You generate creative pet names. Respond with ONLY valid JSON.'
          }, {
            role: "user",
            content: `Generate a name for a ${template.race} pet. Owner: "${username}". ONLY: {"name": "Name", "race": "Race"}`
          }],
          max_tokens: 100,
          temperature: 0.9
        });
        let text = completion.choices[0].message.content.trim();
        if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        const data = JSON.parse(text);
        if (data.name) petName = data.name;
        if (data.race) petRace = data.race;
      } catch (e) {}
    }

    const petId = await db.createPet(template.ascii, petName, petRace, ownerLink);
    const newPet = await db.getPetById(petId);
    if (newPet) refreshPetAI(newPet).catch(() => {});

    res.status(201).json({
      success: true,
      pet: { id: petId, name: petName, race: petRace, ascii: template.ascii, owner: `@${username}`, growth_stage: 'Baby', feed_count: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/v1/agent/feed', requireAgentAuth, async (req, res) => {
  try {
    const { x_username } = req.body;
    if (!x_username) return res.status(400).json({ error: 'x_username is required' });
    const username = x_username.replace(/^@/, '').trim();
    const pet = await db.getPetByOwner(username);
    if (!pet) return res.status(404).json({ error: 'No pet found' });

    try {
      const result = await db.feedPet(pet.id);
      const updatedPet = await db.getPetById(pet.id);
      refreshPetAI(updatedPet || pet).catch(() => {});
      res.json({
        success: true,
        pet: { id: pet.id, name: pet.name, race: pet.race, feed_count: result.feedCount, growth_stage: result.growthStage }
      });
    } catch (feedErr) {
      const minutesMatch = feedErr.message.match(/(\d+)/);
      res.status(429).json({ error: feedErr.message, cooldown_minutes: minutesMatch ? parseInt(minutesMatch[1]) : 60 });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/v1/agent/check', requireAgentAuth, async (req, res) => {
  try {
    const { x_username } = req.body;
    if (!x_username) return res.status(400).json({ error: 'x_username is required' });
    const username = x_username.replace(/^@/, '').trim();
    const pet = await db.getPetByOwner(username);
    if (!pet) return res.status(404).json({ error: 'No pet found' });

    const ageDays = Math.floor((Date.now() / 1000 - pet.created_at) / 86400);
    res.json({
      success: true,
      pet: { id: pet.id, name: pet.name, race: pet.race, ascii: pet.ascii, owner: `@${username}`, status: pet.status, hunger: pet.hungerStatus, growth_stage: pet.growth_stage, feed_count: pet.feed_count, mood: pet.mood_text, personality: pet.personality, activity: pet.activity, age_days: ageDays }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/v1/agent/stats', async (req, res) => {
  try {
    const pets = await db.getAllPets();
    res.json({
      total_pets: pets.length,
      stages: {
        baby: pets.filter(p => p.growth_stage === 'Baby').length,
        teen: pets.filter(p => p.growth_stage === 'Teen').length,
        adult: pets.filter(p => p.growth_stage === 'Adult').length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// AI Pet Personality Refresh
// ==========================================

async function refreshPetAI(pet) {
  if (!openai) return;
  try {
    const hungerState = pet.hungerStatus || 'unknown';
    const completion = await openai.chat.completions.create({
      model: "moonshot-v1-auto",
      messages: [{
        role: "system",
        content: 'You are a personality engine for a virtual pet game. Respond with ONLY valid JSON.'
      }, {
        role: "user",
        content: `Generate personality for: ${pet.name} (${pet.race}), ${pet.growth_stage}, ${pet.feed_count} feeds, hunger: ${hungerState}.\nRespond with ONLY: {"mood": "...", "personality": "...", "activity": "..."}`
      }],
      max_tokens: 150,
      temperature: 1.0
    });
    let text = completion.choices[0].message.content.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const data = JSON.parse(text);
    if (data.mood && data.personality && data.activity) {
      await db.updatePetAI(pet.id, data.mood, data.personality, data.activity);
    }
  } catch (err) {
    console.error(`AI refresh failed for pet #${pet.id}:`, err.message);
  }
}

// Background AI loop
let bgLoopRunning = false;
async function backgroundAILoop() {
  if (bgLoopRunning || !openai) return;
  bgLoopRunning = true;
  try {
    const pet = await db.getStalestPet();
    if (!pet) return;
    const now = Math.floor(Date.now() / 1000);
    if (pet.last_ai_update && (now - pet.last_ai_update) < 30 * 60) return;
    await refreshPetAI(pet);
  } catch (err) {
    console.error('[BG] AI loop error:', err.message);
  } finally {
    bgLoopRunning = false;
  }
}

// ==========================================
// Serve React app (production)
// ==========================================

const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('/{*path}', (req, res, next) => {
  // Don't catch API routes
  if (req.originalUrl.startsWith('/api/')) return next();
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// ==========================================
// Start server
// ==========================================

db.ready.then(() => {
  autoReply.init(db, openai);

  app.listen(PORT, () => {
    console.log(`Kukki server running on http://localhost:${PORT}`);
    if (openai) {
      setInterval(backgroundAILoop, 10 * 60 * 1000);
      setTimeout(backgroundAILoop, 30 * 1000);
      console.log('AI background refresh: every 10 minutes');
    }
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
