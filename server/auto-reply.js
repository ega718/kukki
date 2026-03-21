/**
 * Kukki X Auto-Reply Agent
 * - Polls X (Twitter) mentions every 60s
 * - Parses pet commands: spawn/claim, feed, check, activity
 * - Replies with pet info + generated card images via X API v2
 *
 * Required .env vars:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_BOT_USERNAME
 */

const axios = require('axios');
const crypto = require('crypto');
const cardGen = require('./card-generator');
const kukkiState = require('./kukki-state');

// Official X API (for posting only)
const X_API_KEY             = process.env.X_API_KEY;
const X_API_SECRET          = process.env.X_API_SECRET;
const X_ACCESS_TOKEN        = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;
const BOT_USERNAME          = (process.env.X_BOT_USERNAME || '').toLowerCase();
const POLL_MS               = parseInt(process.env.AUTOREPLY_INTERVAL_MS || '60000');

// GetXAPI (for reading mentions, profiles)
const GETXAPI_KEY           = process.env.GETXAPI_KEY;
const GETXAPI_BASE          = 'https://api.getxapi.com';

let pollerActive = false;
let pollerTimer = null;
let pollBusy = false;
let consecutiveErrors = 0;
let db = null;
let openai = null;

const stats = {
  repliesTotal: 0,
  repliesToday: 0,
  lastChecked: null,
  lastReplied: null,
  lastError: null
};

function init(database, aiClient) {
  db = database;
  openai = aiClient || null;
}

function getLastSeenId() {
  return db ? db.getSetting('autoreply_last_seen_id') : null;
}

function saveLastSeenId(id) {
  if (!id || !db) return;
  const current = getLastSeenId();
  if (!current || BigInt(id) > BigInt(current)) {
    db.setSetting('autoreply_last_seen_id', id);
  }
}

// OAuth 1.0a
function oauthHeader(method, baseUrl, queryParams = {}) {
  const p = {
    oauth_consumer_key:     X_API_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
    oauth_token:            X_ACCESS_TOKEN,
    oauth_version:          '1.0',
    ...queryParams,
  };

  const sorted = Object.keys(p).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`)
    .join('&');

  const base = [method.toUpperCase(), encodeURIComponent(baseUrl), encodeURIComponent(sorted)].join('&');
  const key  = `${encodeURIComponent(X_API_SECRET)}&${encodeURIComponent(X_ACCESS_TOKEN_SECRET)}`;

  p.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');

  const oauthOnly = Object.entries(p)
    .filter(([k]) => k.startsWith('oauth_'))
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ');

  return `OAuth ${oauthOnly}`;
}

// ── GetXAPI: read mentions via advanced search ──
async function fetchMentions() {
  if (!GETXAPI_KEY) {
    console.error('[XBOT] GETXAPI_KEY not set, cannot fetch mentions');
    return [];
  }

  const res = await axios.get(`${GETXAPI_BASE}/twitter/tweet/advanced_search`, {
    params: { q: `@${BOT_USERNAME}`, queryType: 'Latest' },
    headers: { Authorization: `Bearer ${GETXAPI_KEY}` },
  });

  const tweets = res.data?.tweets || [];
  const lastSeenId = getLastSeenId();

  // Filter out tweets we've already seen (by ID comparison)
  const filtered = lastSeenId
    ? tweets.filter(t => BigInt(t.id) > BigInt(lastSeenId))
    : tweets;

  return filtered.map(t => ({
    id: t.id,
    text: t.text,
    authorUsername: t.author?.userName || 'unknown',
    authorAvatar: t.author?.profilePicture || '',
    createdAt: t.createdAt,
  }));
}

// ── GetXAPI: get user profile (avatar etc) ──
async function fetchUserProfile(username) {
  if (!GETXAPI_KEY) return null;
  try {
    const res = await axios.get(`${GETXAPI_BASE}/twitter/user/info`, {
      params: { userName: username },
      headers: { Authorization: `Bearer ${GETXAPI_KEY}` },
    });
    return res.data?.data || null;
  } catch (err) {
    return null;
  }
}

async function uploadMedia(imageBuffer) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const boundary = '----KukkiUpload' + crypto.randomBytes(8).toString('hex');
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${imageBuffer.toString('base64')}\r\n`);
  parts.push(`--${boundary}--\r\n`);
  const bodyStr = parts.join('');

  const res = await axios.post(url, bodyStr, {
    headers: {
      Authorization: oauthHeader('POST', url),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    maxBodyLength: 10 * 1024 * 1024,
  });

  return res.data?.media_id_string;
}

async function postReply(text, inReplyToTweetId, mediaId) {
  const url = 'https://api.twitter.com/2/tweets';
  const body = { text, reply: { in_reply_to_tweet_id: inReplyToTweetId } };
  if (mediaId) body.media = { media_ids: [mediaId] };
  const res = await axios.post(url, body, {
    headers: { Authorization: oauthHeader('POST', url), 'Content-Type': 'application/json' },
  });
  return res.data?.data;
}

// ── Language detection ──
function detectLanguage(text) {
  const body = text.replace(/@\w+/g, '').trim();
  // Check for Japanese characters (hiragana, katakana, kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(body)) return 'ja';
  return 'en';
}

// ── Command parser ──
function parseCommandRegex(text) {
  const lower = text.toLowerCase();
  const body = lower.replace(/@\w+/g, '').trim();

  // Feed — EN + JP
  if (/\b(feed|fed|food|hungry|eat|snack|treat|cookie|cookies)\b/.test(body) ||
      /\bgive\b.*\b(cookie|food|snack|treat)\b/.test(body) ||
      /(ごはん|おやつ|クッキー|たべ|食べ|あげる|えさ|お菓子|もぐもぐ|おなか|はらぺこ)/.test(body)) {
    return 'feed';
  }

  // Pat/pet — EN + JP
  if (/\b(pat|pet|stroke|head\s*pat|rub|scratch|cuddle|hug)\b/.test(body) ||
      /(なでなで|ナデナデ|よしよし|撫で|なでて|ぎゅ|だっこ|抱っこ|もふもふ)/.test(body)) {
    return 'pat';
  }

  // Poke — EN + JP
  if (/\b(poke|boop|tap|nudge|flick)\b/.test(body) ||
      /(つんつん|ツンツン|ぽん|ちょん|つつく)/.test(body)) {
    return 'poke';
  }

  // Sleep/rest — EN + JP
  if (/\b(sleep|nap|rest|bedtime|good\s*night|oyasumi)\b/.test(body) ||
      /(おやすみ|ねんね|寝て|寝な|ねむ|眠)/.test(body)) {
    return 'sleep';
  }

  // Play — EN + JP
  if (/\b(play|game|fun|rps|rock|janken)\b/.test(body) ||
      /(あそ|遊|じゃんけん|ジャンケン|ゲーム)/.test(body)) {
    return 'play';
  }

  // Walk/activity — EN + JP
  if (/\b(walk|stroll|adventure|explore|exercise|outside)\b/.test(body) ||
      /\b(take|bring|let)\b.*\b(out|walk|outside)\b/.test(body) ||
      /(さんぽ|散歩|おでかけ|お出かけ|冒険|ぼうけん|おそと|外)/.test(body)) {
    return 'activity';
  }

  return null;
}

async function parseCommandAI(text) {
  if (!openai) return null;
  try {
    const body = text.replace(/@\w+/g, '').trim();
    const completion = await openai.chat.completions.create({
      model: 'moonshot-v1-auto',
      messages: [
        {
          role: 'system',
          content: `You classify messages sent to kukki chan, a bunny who loves cookies. Understand both English and Japanese. Commands:
- "feed" = give food, cookies, treats, snacks. JP: ごはん, クッキー, おやつ, 食べ
- "pat" = head pat, pet, cuddle, hug, stroke. JP: なでなで, よしよし, もふもふ, ぎゅ
- "poke" = poke, boop, tap, nudge. JP: つんつん, ぽん
- "sleep" = sleep, rest, good night. JP: おやすみ, ねんね
- "play" = play games, have fun, janken. JP: あそぼ, じゃんけん
- "activity" = walk, adventure, go outside, explore. JP: さんぽ, おでかけ, 冒険
- "chat" = everything else - greetings, questions, talking
Respond with ONLY one word: feed, pat, poke, sleep, play, activity, or chat`
        },
        { role: 'user', content: body }
      ],
      max_tokens: 10,
      temperature: 0
    });
    const cmd = completion.choices[0].message.content.trim().toLowerCase();
    if (['feed', 'pat', 'poke', 'sleep', 'play', 'activity', 'chat'].includes(cmd)) return cmd;
    return 'chat';
  } catch (err) {
    console.error('[XBOT] AI command parse failed:', err.message);
    return null;
  }
}

async function parseCommand(text) {
  const regexResult = parseCommandRegex(text);
  if (regexResult) return regexResult;
  const aiResult = await parseCommandAI(text);
  return aiResult || 'chat';
}

// ── Kukki chan system prompt (shared across all AI calls) ──
const KUKKI_PROMPT_EN = `You are kukki chan, a cute bunny who loves cookies. You live on X (twitter).

RULES:
- keep replies SHORT. max 140 chars. one or two sentences only.
- lowercase only. no capitals.
- NO emoji. NO emoticons. NO symbols like * or ~
- use simple small words. no big or fancy words.
- you are a bunny not a human. act like a small cute animal.
- you love cookies more than anything.
- you can be playful, sleepy, shy, or excited.
- never be mean or rude. always friendly.
- do not repeat the same reply pattern.`;

const KUKKI_PROMPT_JA = `あなたはくっきーちゃん。クッキーが大好きなうさぎ。Xに住んでる。

ルール:
- 返事は短く。最大140文字。1〜2文だけ。
- ひらがな・カタカナ中心。漢字は少なめ。
- 絵文字禁止。顔文字禁止。記号も使わない。
- かわいいうさぎとして話す。人間じゃない。
- クッキーが世界で一番好き。
- 遊び好き、眠い、照れ屋、わくわく、いろんな気分になれる。
- いつもやさしい。意地悪しない。
- 同じ返事パターンを繰り返さない。`;

function getKukkiPrompt(lang) {
  return lang === 'ja' ? KUKKI_PROMPT_JA : KUKKI_PROMPT_EN;
}

// ── AI reply helper ──
async function kukkiReply(username, body, lang, extraContext) {
  if (!openai) {
    return lang === 'ja'
      ? `@${username} やっほー!くっきーちゃんだよ。クッキーだいすき`
      : `@${username} hey! im kukki chan. i love cookies`;
  }

  try {
    const prompt = getKukkiPrompt(lang) + (extraContext ? '\n' + extraContext : '');
    const replyLang = lang === 'ja' ? '日本語で返事して' : 'Reply in English';

    const completion = await openai.chat.completions.create({
      model: 'moonshot-v1-auto',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `@${username}: "${body}"\n${replyLang} (start with @${username}):` }
      ],
      max_tokens: 80,
      temperature: 0.85
    });

    let reply = completion.choices[0].message.content.trim();
    // Strip any emoji that AI might sneak in
    reply = reply.replace(/[\u{1F600}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
    if (!reply.toLowerCase().startsWith(`@${username.toLowerCase()}`)) reply = `@${username} ${reply}`;
    // Enforce 280 char limit
    if (reply.length > 280) reply = reply.slice(0, 277) + '...';
    return reply;
  } catch (err) {
    console.error('[XBOT] AI reply failed:', err.message);
    return lang === 'ja'
      ? `@${username} えへへ、クッキーもぐもぐ`
      : `@${username} hehe *munches cookie*`;
  }
}

// ── Command handlers ──

async function handleFeed(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('feed', username, body, avatar);

  const extra = lang === 'ja'
    ? 'ユーザーがごはんかおやつをくれた。嬉しそうに食べるリアクションを書いて。'
    : 'User is giving you food or a cookie. React happily about eating it.';

  const reply = await kukkiReply(username, body, lang, extra);
  const image = cardGen.generateActionCard('feed', username, lang);
  return { text: reply, image };
}

async function handlePat(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('pat', username, body, avatar);

  const extra = lang === 'ja'
    ? 'ユーザーがなでなでしてくれた。気持ちよさそうにする。'
    : 'User is patting your head. React like you enjoy it.';

  const reply = await kukkiReply(username, body, lang, extra);
  const image = cardGen.generateActionCard('pat', username, lang);
  return { text: reply, image };
}

async function handlePoke(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('poke', username, body, avatar);

  const extra = lang === 'ja'
    ? 'ユーザーがつんつんしてきた。びっくりしたりくすぐったがったりする。'
    : 'User poked you. React surprised or ticklish.';

  const reply = await kukkiReply(username, body, lang, extra);
  const image = cardGen.generateActionCard('poke', username, lang);
  return { text: reply, image };
}

async function handleSleep(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('sleep', username, body, avatar);

  const extra = lang === 'ja'
    ? 'ユーザーがおやすみって言った。眠そうにする。クッキー持ったまま寝る。'
    : 'User says good night. Get sleepy. You fall asleep holding your cookie.';

  const reply = await kukkiReply(username, body, lang, extra);
  const image = cardGen.generateActionCard('sleep', username, lang);
  return { text: reply, image };
}

async function handlePlay(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('play', username, body, avatar);

  const extra = lang === 'ja'
    ? 'ユーザーが遊ぼうって言った。楽しそうにする。うさぎっぽく遊ぶ。'
    : 'User wants to play. Be excited and playful. Do bunny things like hopping.';

  const reply = await kukkiReply(username, body, lang, extra);
  const image = cardGen.generateActionCard('play', username, lang);
  return { text: reply, image };
}

async function handleActivity(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('activity', username, body, avatar);

  const extra = lang === 'ja'
    ? 'ユーザーがおさんぽや冒険に誘ってる。わくわくしてる。クッキー持って出かける。'
    : 'User wants to go on a walk or adventure. Be excited. Bring your cookie along.';

  const reply = await kukkiReply(username, body, lang, extra);
  const image = cardGen.generateActionCard('activity', username, lang);
  return { text: reply, image };
}

async function handleChat(username, tweetText, avatar) {
  const lang = detectLanguage(tweetText);
  const body = tweetText.replace(/@\w+/g, '').trim();
  kukkiState.triggerInteraction('chat', username, body, avatar);

  const reply = await kukkiReply(username, body, lang, null);
  return { text: reply, image: null };
}

// Timeout wrapper
function withTimeout(promise, ms = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}

// Process mention
async function processMention(tweet) {
  const command = await parseCommand(tweet.text);
  const av = tweet.authorAvatar || '';
  let result;
  switch (command) {
    case 'feed':     result = await handleFeed(tweet.authorUsername, tweet.text, av); break;
    case 'pat':      result = await handlePat(tweet.authorUsername, tweet.text, av); break;
    case 'poke':     result = await handlePoke(tweet.authorUsername, tweet.text, av); break;
    case 'sleep':    result = await handleSleep(tweet.authorUsername, tweet.text, av); break;
    case 'play':     result = await handlePlay(tweet.authorUsername, tweet.text, av); break;
    case 'activity': result = await handleActivity(tweet.authorUsername, tweet.text, av); break;
    case 'chat':     result = await handleChat(tweet.authorUsername, tweet.text, av); break;
    default:         result = await handleChat(tweet.authorUsername, tweet.text, av);
  }
  if (result.text.length > 280) result.text = result.text.slice(0, 277) + '...';
  return result;
}

// Poll loop
async function poll() {
  if (!pollerActive) return;
  if (pollBusy) {
    if (pollerActive) pollerTimer = setTimeout(poll, POLL_MS);
    return;
  }
  pollBusy = true;
  stats.lastChecked = new Date().toISOString();
  stats.repliesToday = db ? db.countRepliesToday() : 0;

  try {
    // Fetch mentions via GetXAPI (read-only)
    const mentions = await withTimeout(fetchMentions(), 15000);
    console.log(`[XBOT] ${mentions.length} new mention(s)`);

    for (const tweet of mentions) {
      if (db.hasReplied(tweet.id)) continue;
      if (tweet.authorUsername.toLowerCase() === BOT_USERNAME) continue;

      try {
        const command = await parseCommand(tweet.text);
        const result = await withTimeout(processMention(tweet), 30000);

        let mediaId = null;
        if (result.image) {
          try {
            mediaId = await withTimeout(uploadMedia(result.image), 15000);
            console.log(`[XBOT] Uploaded card image, media_id: ${mediaId}`);
          } catch (uploadErr) {
            console.error(`[XBOT] Image upload failed: ${uploadErr.message}`);
          }
        }

        const replyData = await withTimeout(postReply(result.text, tweet.id, mediaId), 10000);
        const replyTweetId = replyData?.id || '';

        db.saveRepliedTweet(tweet.id, tweet.authorUsername, tweet.text, result.text, replyTweetId, command || 'unknown');
        if (replyTweetId) kukkiState.setLastReplyTweetId(replyTweetId);
        saveLastSeenId(tweet.id);
        stats.repliesTotal++;
        stats.repliesToday++;
        stats.lastReplied = new Date().toISOString();
        console.log(`[XBOT] Replied to @${tweet.authorUsername}: ${result.text.slice(0, 80)}...`);

        // 12s gap between replies to avoid X spam filters
        await new Promise(r => setTimeout(r, 12000));
      } catch (err) {
        const detail = err.response?.data?.detail || err.message;
        console.error(`[XBOT] Reply failed for @${tweet.authorUsername}: ${detail}`);
        if (err.response?.status === 403 || err.response?.status === 429) {
          db.saveRepliedTweet(tweet.id, tweet.authorUsername, tweet.text, '[FAILED]', '', 'error');
        }
      }
    }

    stats.lastError = null;
    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    stats.lastError = err.response?.data?.detail || err.message;
    console.error(`[XBOT] Poll error (${consecutiveErrors}x): ${stats.lastError}`);

    if (consecutiveErrors >= 3) {
      const backoff = Math.min(consecutiveErrors * POLL_MS, 600000);
      console.warn(`[XBOT] Backing off for ${backoff / 1000}s`);
      pollBusy = false;
      if (pollerActive) pollerTimer = setTimeout(poll, backoff);
      return;
    }
  }

  pollBusy = false;
  if (pollerActive) pollerTimer = setTimeout(poll, POLL_MS);
}

function startAutoReply() {
  if (pollerActive) return { ok: false, error: 'Already running' };
  if (!GETXAPI_KEY) return { ok: false, error: 'GETXAPI_KEY missing in .env (needed for reading mentions)' };
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    return { ok: false, error: 'X API credentials missing in .env (needed for posting replies)' };
  }
  if (!BOT_USERNAME) return { ok: false, error: 'X_BOT_USERNAME not set in .env' };
  if (!db) return { ok: false, error: 'Database not initialized' };

  pollerActive = true;
  console.log(`[XBOT] Starting -- polling every ${POLL_MS / 1000}s for @${BOT_USERNAME}`);
  poll();
  return { ok: true };
}

function stopAutoReply() {
  pollerActive = false;
  if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
  console.log('[XBOT] Stopped');
  return { ok: true };
}

function getAutoReplyStatus() {
  return {
    active: pollerActive,
    botUsername: BOT_USERNAME,
    pollIntervalSec: POLL_MS / 1000,
    consecutiveErrors,
    lastSeenTweetId: getLastSeenId(),
    ...stats,
    configured: !!(X_API_KEY && X_ACCESS_TOKEN && BOT_USERNAME && GETXAPI_KEY),
  };
}

function getRecentReplies(limit = 20) {
  return db ? db.getRecentReplies(limit) : [];
}

// ── Test mode: simulate a mention without posting to X ──
async function testReply(username, tweetText) {
  const fakeText = `@${BOT_USERNAME || 'kukkichan718'} ${tweetText}`;
  const command = await parseCommand(fakeText);
  const fakeTweet = { id: 'test', text: fakeText, authorUsername: username, createdAt: new Date().toISOString() };
  const result = await processMention(fakeTweet);
  const lang = detectLanguage(tweetText);
  return { command, reply: result.text, lang, hasImage: !!result.image };
}

module.exports = { init, startAutoReply, stopAutoReply, getAutoReplyStatus, getRecentReplies, testReply };
