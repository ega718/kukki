const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_DIR = process.env.DB_PATH || path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'kukki.db');

class Database {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.ready = this.init();
  }

  async init() {
    this.SQL = await initSqlJs();
    this.isNewDatabase = false;

    if (fs.existsSync(DB_PATH)) {
      try {
        const buffer = fs.readFileSync(DB_PATH);
        if (buffer.length === 0) throw new Error('Database file is empty');
        this.db = new this.SQL.Database(buffer);
        console.log(`[DB] Loaded existing database from ${DB_PATH} (${buffer.length} bytes)`);
      } catch (err) {
        console.error(`[DB] Failed to load database:`, err.message);
        const backupPath = DB_PATH + '.broken.' + Date.now();
        try { fs.copyFileSync(DB_PATH, backupPath); } catch (e) {}
        this.db = new this.SQL.Database();
        this.isNewDatabase = true;
      }
    } else {
      console.log(`[DB] No database found, creating new one`);
      this.db = new this.SQL.Database();
      this.isNewDatabase = true;
    }

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS pets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ascii TEXT NOT NULL,
        name TEXT NOT NULL,
        race TEXT NOT NULL,
        owner TEXT NOT NULL,
        status TEXT DEFAULT 'Happy',
        next_feed_at INTEGER DEFAULT 0,
        feed_count INTEGER DEFAULT 0,
        growth_stage TEXT DEFAULT 'Baby',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        mood_text TEXT DEFAULT '',
        personality TEXT DEFAULT '',
        ai_activity TEXT DEFAULT '',
        last_ai_update INTEGER DEFAULT 0
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        api_key TEXT NOT NULL UNIQUE,
        x_username TEXT DEFAULT '',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ascii_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ascii TEXT NOT NULL,
        name TEXT NOT NULL,
        race TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS replied_tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id TEXT NOT NULL UNIQUE,
        reply_tweet_id TEXT DEFAULT '',
        from_username TEXT NOT NULL,
        tweet_content TEXT DEFAULT '',
        our_reply TEXT DEFAULT '',
        command TEXT DEFAULT '',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS pet_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pet1_id INTEGER NOT NULL,
        pet1_name TEXT NOT NULL,
        pet1_owner TEXT NOT NULL,
        pet2_id INTEGER NOT NULL,
        pet2_name TEXT NOT NULL,
        pet2_owner TEXT NOT NULL,
        activity TEXT NOT NULL,
        tweet_id TEXT DEFAULT '',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    this.insertDefaultTemplates();
    this.save();
    return this;
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    if (fs.existsSync(DB_PATH)) {
      const oldSize = fs.statSync(DB_PATH).size;
      if (oldSize > 5000 && buffer.length < oldSize * 0.5) {
        console.error(`[DB] REFUSING to save: possible data loss`);
        return;
      }
    }
    fs.writeFileSync(DB_PATH, buffer);
  }

  insertDefaultTemplates() {
    const defaultTemplates = [
      { ascii: `    /\\_/\\\n   ( o.o )\n    > ^ <`, name: 'Whiskers', race: 'Cat' },
      { ascii: `    /\\   /\\\n   (  . .)\n  o_)\\) (_o`, name: 'Buddy', race: 'Dog' },
      { ascii: `    .--.\n   |o_o |\n   |:_/ |\n  //   \\ \\\n (|     | )\n/'\\_   _/\`\\\n\\___)=(___/`, name: 'Robo', race: 'Robot' },
      { ascii: `   /\\   /\\\n  (  -_-  )\n __) ~~~ (__\n/  \\     /  \\`, name: 'Blaze', race: 'Dragon' },
      { ascii: `   {o,o}\n   |)__)\n   -"-"-`, name: 'Hoot', race: 'Owl' },
      { ascii: `   .---.\n  / o o \\\n  |  ^  |\n   \\___/`, name: 'Boo', race: 'Ghost' },
      { ascii: `  /\\   /\\\n  ( ^.^ )\n   (> <)\n  /|   |\\`, name: 'Foxy', race: 'Fox' },
      { ascii: `     .\n    / \\\n   / _ \\\n  | (_) |\n   \\   /\n    \\_/`, name: 'Orby', race: 'Cosmic Orb' },
      { ascii: `   ^   ^\n  (o   o)\n  ( =T= )\n  /|   |\\\n (_|   |_)`, name: 'Batsy', race: 'Bat' },
      { ascii: `    ___\n   (o o)\n  ( \\|/ )\n    / \\\n   _| |_`, name: 'Pengui', race: 'Penguin' },
      { ascii: `   (\\ /)\n   ( . .)\n   c(")(")`, name: 'Buns', race: 'Bunny' },
      { ascii: `  ><((('>`, name: 'Finn', race: 'Fish' },
      { ascii: `  ,;;\n ( o.o)\n/(    )\\\n\\_)~~(_/`, name: 'Shelly', race: 'Turtle' },
    ];

    const result = this.db.exec('SELECT race FROM ascii_templates');
    const existingRaces = new Set();
    if (result.length > 0) result[0].values.forEach(row => existingRaces.add(row[0]));

    const stmt = this.db.prepare('INSERT INTO ascii_templates (ascii, name, race) VALUES (?, ?, ?)');
    let inserted = 0;
    for (const t of defaultTemplates) {
      if (!existingRaces.has(t.race)) {
        stmt.run([t.ascii, t.name, t.race]);
        inserted++;
      }
    }
    stmt.free();
    if (inserted > 0) console.log(`Added ${inserted} ASCII templates`);
  }

  rowToObject(columns, values) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = values[i]; });
    return obj;
  }

  enrichPet(pet) {
    pet.hungerStatus = this.getHungerStatus(pet.next_feed_at);
    pet.ownerHandle = this.extractTwitterHandle(pet.owner);
    const sixHoursAgo = Math.floor(Date.now() / 1000) - (6 * 60 * 60);
    pet.activity = (pet.ai_activity && pet.last_ai_update > sixHoursAgo)
      ? pet.ai_activity
      : this.generateActivity(pet);
    if (!pet.mood_text) pet.mood_text = pet.status === 'Full' ? 'Feeling satisfied' : 'In a good mood';
    if (!pet.personality) pet.personality = '';
    return pet;
  }

  getAllPets() {
    return new Promise((resolve, reject) => {
      try {
        const result = this.db.exec('SELECT * FROM pets ORDER BY created_at DESC');
        if (result.length === 0) return resolve([]);
        const columns = result[0].columns;
        resolve(result[0].values.map(row => this.enrichPet(this.rowToObject(columns, row))));
      } catch (err) { reject(err); }
    });
  }

  getPetById(id) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT * FROM pets WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
          const pet = this.enrichPet(this.rowToObject(stmt.getColumnNames(), stmt.get()));
          stmt.free();
          resolve(pet);
        } else { stmt.free(); resolve(null); }
      } catch (err) { reject(err); }
    });
  }

  getPetByOwner(ownerHandle) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT * FROM pets WHERE owner LIKE ? LIMIT 1');
        stmt.bind([`%${ownerHandle}%`]);
        if (stmt.step()) {
          const pet = this.enrichPet(this.rowToObject(stmt.getColumnNames(), stmt.get()));
          stmt.free();
          resolve(pet);
        } else { stmt.free(); resolve(null); }
      } catch (err) { reject(err); }
    });
  }

  createPet(ascii, name, race, owner, status = 'Happy') {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('INSERT INTO pets (ascii, name, race, owner, status) VALUES (?, ?, ?, ?, ?)');
        stmt.run([ascii, name, race, owner, status]);
        stmt.free();
        const result = this.db.exec('SELECT last_insert_rowid()');
        const lastId = result[0].values[0][0];
        this.save();
        resolve(lastId);
      } catch (err) { reject(err); }
    });
  }

  updatePet(id, ascii, name, race, owner, status) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('UPDATE pets SET ascii = ?, name = ?, race = ?, owner = ?, status = ? WHERE id = ?');
        stmt.run([ascii, name, race, owner, status, id]);
        stmt.free();
        this.save();
        resolve(this.db.getRowsModified());
      } catch (err) { reject(err); }
    });
  }

  deletePet(id) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('DELETE FROM pets WHERE id = ?');
        stmt.run([id]);
        stmt.free();
        this.save();
        resolve(this.db.getRowsModified());
      } catch (err) { reject(err); }
    });
  }

  feedPet(id) {
    return new Promise((resolve, reject) => {
      this.getPetById(id).then(pet => {
        if (!pet) return reject(new Error('Pet not found'));
        const now = Math.floor(Date.now() / 1000);
        if (pet.next_feed_at > now) {
          const minutesLeft = Math.ceil((pet.next_feed_at - now) / 60);
          return reject(new Error(`Pet can be fed in ${minutesLeft} minutes`));
        }
        try {
          const newFeedCount = pet.feed_count + 1;
          const newGrowthStage = this.calculateGrowthStage(newFeedCount);
          const nextFeedAt = now + (60 * 60);
          const stmt = this.db.prepare("UPDATE pets SET feed_count = ?, growth_stage = ?, next_feed_at = ?, status = 'Full' WHERE id = ?");
          stmt.run([newFeedCount, newGrowthStage, nextFeedAt, id]);
          stmt.free();
          this.save();
          resolve({ success: true, feedCount: newFeedCount, growthStage: newGrowthStage, nextFeedAt });
        } catch (err) { reject(err); }
      }).catch(reject);
    });
  }

  updatePetAI(id, moodText, personality, aiActivity) {
    return new Promise((resolve, reject) => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare('UPDATE pets SET mood_text = ?, personality = ?, ai_activity = ?, last_ai_update = ? WHERE id = ?');
        stmt.run([moodText, personality, aiActivity, now, id]);
        stmt.free();
        this.save();
        resolve(true);
      } catch (err) { reject(err); }
    });
  }

  getStalestPet() {
    return new Promise((resolve, reject) => {
      try {
        const result = this.db.exec('SELECT * FROM pets ORDER BY last_ai_update ASC LIMIT 1');
        if (result.length === 0 || result[0].values.length === 0) return resolve(null);
        resolve(this.enrichPet(this.rowToObject(result[0].columns, result[0].values[0])));
      } catch (err) { reject(err); }
    });
  }

  // Activity methods
  saveActivity(pet1, owner1, pet2, owner2, activity, tweetId) {
    try {
      const stmt = this.db.prepare('INSERT INTO pet_activities (pet1_id, pet1_name, pet1_owner, pet2_id, pet2_name, pet2_owner, activity, tweet_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      stmt.run([pet1.id, pet1.name, owner1, pet2.id, pet2.name, owner2, activity, tweetId || '']);
      stmt.free();
      this.save();
    } catch (err) { console.error('[DB] Failed to save activity:', err.message); }
  }

  getLastActivity(petId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM pet_activities WHERE pet1_id = ? OR pet2_id = ? ORDER BY created_at DESC LIMIT 1');
      stmt.bind([petId, petId]);
      if (stmt.step()) {
        const obj = this.rowToObject(stmt.getColumnNames(), stmt.get());
        stmt.free();
        return obj;
      }
      stmt.free();
      return null;
    } catch (err) { return null; }
  }

  getActivities(petId, limit = 20) {
    try {
      const result = this.db.exec(`SELECT * FROM pet_activities WHERE pet1_id = ${petId} OR pet2_id = ${petId} ORDER BY created_at DESC LIMIT ${limit}`);
      if (result.length === 0) return [];
      return result[0].values.map(row => this.rowToObject(result[0].columns, row));
    } catch (err) { return []; }
  }

  // Agent methods
  createAgent(name, description) {
    return new Promise((resolve, reject) => {
      try {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'kukki_';
        for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
        const stmt = this.db.prepare('INSERT INTO agents (name, description, api_key) VALUES (?, ?, ?)');
        stmt.run([name, description, key]);
        stmt.free();
        this.save();
        resolve(key);
      } catch (err) { reject(err); }
    });
  }

  getAgentByKey(apiKey) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT * FROM agents WHERE api_key = ?');
        stmt.bind([apiKey]);
        if (stmt.step()) {
          const agent = this.rowToObject(stmt.getColumnNames(), stmt.get());
          stmt.free();
          resolve(agent);
        } else { stmt.free(); resolve(null); }
      } catch (err) { reject(err); }
    });
  }

  getAgentByName(name) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT * FROM agents WHERE name = ?');
        stmt.bind([name]);
        if (stmt.step()) {
          const agent = this.rowToObject(stmt.getColumnNames(), stmt.get());
          stmt.free();
          resolve(agent);
        } else { stmt.free(); resolve(null); }
      } catch (err) { reject(err); }
    });
  }

  getAllAgents() {
    return new Promise((resolve, reject) => {
      try {
        const result = this.db.exec('SELECT id, name, description, x_username, created_at FROM agents ORDER BY created_at DESC');
        if (result.length === 0) return resolve([]);
        resolve(result[0].values.map(row => this.rowToObject(result[0].columns, row)));
      } catch (err) { reject(err); }
    });
  }

  // Template methods
  getAllTemplates() {
    return new Promise((resolve, reject) => {
      try {
        const result = this.db.exec('SELECT * FROM ascii_templates ORDER BY name');
        if (result.length === 0) return resolve([]);
        resolve(result[0].values.map(row => this.rowToObject(result[0].columns, row)));
      } catch (err) { reject(err); }
    });
  }

  getTemplateById(id) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT * FROM ascii_templates WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
          const t = this.rowToObject(stmt.getColumnNames(), stmt.get());
          stmt.free();
          resolve(t);
        } else { stmt.free(); resolve(null); }
      } catch (err) { reject(err); }
    });
  }

  // Helper methods
  calculateGrowthStage(feedCount) {
    if (feedCount >= 6) return 'Adult';
    if (feedCount >= 3) return 'Teen';
    return 'Baby';
  }

  getHungerStatus(nextFeedAt) {
    const now = Math.floor(Date.now() / 1000);
    if (nextFeedAt <= now) return 'Hungry';
    const minutesLeft = Math.ceil((nextFeedAt - now) / 60);
    if (minutesLeft <= 15) return 'Getting Hungry';
    return `Next feed in ${minutesLeft}m`;
  }

  generateActivity(pet) {
    const activities = [
      "exploring the digital forest", "hunting for rare artifacts", "discovering hidden caves",
      "swimming in pixel rivers", "flying through code clouds", "chasing digital butterflies",
      "collecting stardust", "practicing combat moves", "sparring with shadow enemies",
      "chatting with other pets", "making new friends", "painting ASCII masterpieces",
      "composing digital music", "meditating quietly", "taking a power nap",
      "organizing inventory", "playing hide and seek", "pulling harmless pranks",
      "reading digital books", "solving puzzles", "foraging for data berries",
      "mining digital crystals", "collecting rainbow pixels"
    ];
    const seed = pet.id + Math.floor(Date.now() / (1000 * 60 * 15));
    return activities[Math.abs(seed) % activities.length];
  }

  extractTwitterHandle(ownerLink) {
    if (!ownerLink) return '';
    const match = ownerLink.match(/(?:twitter\.com\/|x\.com\/)([^\/\?]+)/);
    return match ? `@${match[1]}` : ownerLink;
  }

  // Settings
  getSetting(key) {
    try {
      const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
      stmt.bind([key]);
      if (stmt.step()) { const val = stmt.get()[0]; stmt.free(); return val; }
      stmt.free();
      return null;
    } catch (e) { return null; }
  }

  setSetting(key, value) {
    try {
      this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
      this.save();
    } catch (e) { console.error('[DB] setSetting error:', e.message); }
  }

  // Replied tweets
  hasReplied(tweetId) {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM replied_tweets WHERE tweet_id = ?');
      stmt.bind([tweetId]);
      const exists = stmt.step();
      stmt.free();
      return exists;
    } catch (e) { return false; }
  }

  saveRepliedTweet(tweetId, fromUsername, tweetContent, ourReply, replyTweetId, command) {
    try {
      const stmt = this.db.prepare('INSERT OR IGNORE INTO replied_tweets (tweet_id, reply_tweet_id, from_username, tweet_content, our_reply, command) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run([tweetId, replyTweetId || '', fromUsername, tweetContent, ourReply, command || '']);
      stmt.free();
      this.save();
    } catch (e) { console.error('[DB] saveRepliedTweet error:', e.message); }
  }

  getRecentReplies(limit = 20) {
    try {
      const result = this.db.exec(`SELECT * FROM replied_tweets ORDER BY created_at DESC LIMIT ${parseInt(limit)}`);
      if (result.length === 0) return [];
      return result[0].values.map(row => this.rowToObject(result[0].columns, row));
    } catch (e) { return []; }
  }

  countRepliesToday() {
    try {
      const startOfDay = Math.floor(new Date().setHours(0,0,0,0) / 1000);
      const result = this.db.exec(`SELECT COUNT(*) FROM replied_tweets WHERE created_at >= ${startOfDay}`);
      return result.length > 0 ? result[0].values[0][0] : 0;
    } catch (e) { return 0; }
  }

  close() {
    if (this.db) { this.save(); this.db.close(); }
  }
}

module.exports = Database;
