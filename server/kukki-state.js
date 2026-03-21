/**
 * Kukki chan live state manager
 *
 * Everyone visiting the site sees the same kukki.
 * X interactions drive her behavior. Between interactions,
 * she does deterministic idle cycles based on time so all clients sync.
 *
 * States: idle, walk_right, walk_left, eat, sleep, wave, hop, look, sit
 */

// ── Idle schedule ──
// Deterministic sequence that repeats. Each entry: [state, durationSec]
const IDLE_SCHEDULE = [
  ['idle', 6],
  ['look', 4],
  ['walk_right', 5],
  ['idle', 4],
  ['sit', 6],
  ['idle', 3],
  ['walk_left', 5],
  ['look', 3],
  ['idle', 5],
  ['walk_right', 4],
  ['sit', 5],
  ['idle', 4],
  ['walk_left', 4],
  ['idle', 6],
  ['hop', 3],
  ['idle', 4],
  ['walk_right', 6],
  ['look', 3],
  ['idle', 5],
  ['walk_left', 5],
  ['sit', 4],
  ['idle', 3],
  ['hop', 3],
  ['walk_right', 4],
  ['idle', 5],
  ['sleep', 10],
  ['idle', 4],
  ['look', 3],
  ['walk_left', 6],
  ['idle', 5],
];

// Total cycle length in seconds
const CYCLE_LENGTH = IDLE_SCHEDULE.reduce((s, [, d]) => s + d, 0);

// ── Interaction overrides ──
// When someone interacts on X, kukki does a special action for a duration
// After it expires, she returns to the idle schedule
let interactionState = null;    // { state, label, user, expiresAt }
let lastInteraction = null;     // { state, label, user, time } - for display even after expired

/**
 * Get what kukki should be doing right now.
 * If there's an active interaction, show that.
 * Otherwise, compute position in idle schedule based on current time.
 */
function getKukkiState() {
  const now = Date.now();

  // Check if there's an active interaction override
  if (interactionState && now < interactionState.expiresAt) {
    return {
      state: interactionState.state,
      label: interactionState.label,
      source: 'interaction',
      user: interactionState.user,
      lastInteraction,
    };
  }

  // Clear expired interaction
  if (interactionState && now >= interactionState.expiresAt) {
    interactionState = null;
  }

  // Deterministic idle based on time
  // Use epoch seconds mod cycle length to find position
  const epochSec = Math.floor(now / 1000);
  let pos = epochSec % CYCLE_LENGTH;

  let currentState = 'idle';
  for (const [state, dur] of IDLE_SCHEDULE) {
    if (pos < dur) {
      currentState = state;
      break;
    }
    pos -= dur;
  }

  return {
    state: currentState,
    label: getIdleLabel(currentState),
    source: 'idle',
    user: null,
    lastInteraction,
  };
}

function getIdleLabel(state) {
  const labels = {
    idle:       { ja: 'のんびり中...', en: 'standing around...' },
    walk_right: { ja: 'おさんぽ中...', en: 'walking...' },
    walk_left:  { ja: 'おさんぽ中...', en: 'walking...' },
    eat:        { ja: 'もぐもぐ！', en: 'nom nom nom!' },
    sleep:      { ja: 'すやすや...', en: 'zzz...' },
    wave:       { ja: 'ばいばい！', en: 'waving!' },
    hop:        { ja: 'ぴょんぴょん！', en: 'hop hop!' },
    look:       { ja: 'きょろきょろ...', en: 'looking around...' },
    sit:        { ja: 'クッキーとまったり~', en: 'sitting with cookie~' },
  };
  return labels[state] || { ja: 'のんびり...', en: 'idle...' };
}

/**
 * Trigger an interaction state from X bot
 * @param {string} action - what happened: 'feed', 'chat', 'walk', 'activity'
 * @param {string} username - who triggered it
 * @param {string} [message] - optional message content
 */
function triggerInteraction(action, username, message, avatar) {
  const now = Date.now();

  let state, label, duration;

  switch (action) {
    case 'feed':
      state = 'eat';
      label ={ ja: `@${username} がクッキーをくれた！`, en: `@${username} gave kukki a cookie!` };
      duration = 12000;
      break;
    case 'pat':
      state = 'sit';
      label ={ ja: `@${username} がなでなでしてる！`, en: `@${username} is patting kukki!` };
      duration = 8000;
      break;
    case 'poke':
      state = 'hop';
      label ={ ja: `@${username} がつんつんした！`, en: `@${username} poked kukki!` };
      duration = 6000;
      break;
    case 'sleep':
      state = 'sleep';
      label ={ ja: `@${username} がおやすみって言った`, en: `@${username} told kukki to rest` };
      duration = 10000;
      break;
    case 'chat':
      state = 'wave';
      label ={ ja: `@${username} とおしゃべり中`, en: `kukki is talking with @${username}` };
      duration = 8000;
      break;
    case 'walk':
    case 'activity':
      state = 'walk_right';
      label ={ ja: `@${username} とおでかけ中！`, en: `kukki is out with @${username}!` };
      duration = 10000;
      break;
    case 'play':
      state = 'hop';
      label ={ ja: `@${username} とあそんでる！`, en: `kukki is playing with @${username}!` };
      duration = 8000;
      break;
    default:
      state = 'look';
      label ={ ja: `@${username} が話しかけた！`, en: `@${username} said something to kukki!` };
      duration = 6000;
  }

  interactionState = {
    state,
    label,
    user: username,
    expiresAt: now + duration,
  };

  lastInteraction = {
    state,
    label,
    user: username,
    avatar: avatar || '',
    time: new Date().toISOString(),
    message: (message || '').slice(0, 100),
  };

  console.log(`[KUKKI] ${label}`);
}

/**
 * Get the deterministic position for kukki's X coordinate.
 * Based on time so all clients compute the same position.
 * Walk states move her, others keep her still.
 */
function getKukkiPosition(containerWidth) {
  const now = Date.now();
  const epochSec = Math.floor(now / 1000);
  let pos = epochSec % CYCLE_LENGTH;

  // Walk through the schedule, accumulating position changes
  let x = containerWidth * 0.35; // start near center-left
  let elapsed = 0;

  for (const [state, dur] of IDLE_SCHEDULE) {
    const stateStart = elapsed;
    const stateEnd = elapsed + dur;

    if (state === 'walk_right') {
      const activeTime = Math.min(pos - stateStart, dur);
      if (activeTime > 0 && pos >= stateStart) {
        x += activeTime * 12; // pixels per second
      }
    } else if (state === 'walk_left') {
      const activeTime = Math.min(pos - stateStart, dur);
      if (activeTime > 0 && pos >= stateStart) {
        x -= activeTime * 12;
      }
    }

    if (pos < stateEnd) break;
    elapsed += dur;
  }

  // Clamp
  x = Math.max(10, Math.min(containerWidth - 130, x));
  return Math.round(x);
}

/**
 * Update the last interaction with the reply tweet ID (called after posting to X)
 */
function setLastReplyTweetId(tweetId) {
  if (lastInteraction) {
    lastInteraction.replyTweetId = tweetId;
  }
}

module.exports = { getKukkiState, triggerInteraction, getKukkiPosition, setLastReplyTweetId };
