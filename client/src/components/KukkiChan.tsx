import { useState, useEffect, useRef } from "react";

// ── Animation states ──
type KukkiState =
  | "idle"
  | "walk_right"
  | "walk_left"
  | "eat"
  | "sleep"
  | "wave"
  | "hop"
  | "look"
  | "sit";

// ── Frames per state ──
const FRAMES: Record<KukkiState, string[][]> = {
  idle: [
    [" {\\__/} ", " ( • . •)", " / >  🍪"],
    [" {\\__/} ", " ( • . •)", " / >  🍪"],
    [" {\\__/} ", " ( •‿• )", " / >  🍪"],
    [" {\\__/} ", " ( • . •)", " / >  🍪"],
  ],
  walk_right: [
    [" {\\__/} ", " ( • . •)", "  / >  🍪"],
    [" {\\__/} ", " ( • . •)", " / >  🍪 "],
    [" {\\__/} ", " ( •  .•)", "  />  🍪 "],
    [" {\\__/} ", " ( • . •)", " / >  🍪"],
  ],
  walk_left: [
    ["  {\\__/}", " ( •. • )", " 🍪 <  \\ "],
    ["  {\\__/}", " (• . • )", "🍪  <  \\  "],
    ["  {\\__/}", " ( •. • )", " 🍪 <  \\ "],
    ["  {\\__/}", " (• . • )", "🍪  < \\  "],
  ],
  eat: [
    [" {\\__/}    ", " ( • . •)  ", " / >  🍪  "],
    [" {\\__/}    ", " ( •ω•)🍪 ", " /|    |\\  "],
    [" {\\__/} nom", " ( •ω•)🍪 ", " /|    |\\  "],
    [" {\\__/} ♪ ", " ( •ω• )  ", " /|    |\\  "],
    [" {\\__/}   ", " ( •ω• )~ ", " / >  🍪  "],
  ],
  sleep: [
    [" {\\__/}   ", " ( - . -) ", " / >  🍪  "],
    [" {\\__/}  z", " ( - . -) ", " / >  🍪  "],
    [" {\\__/} zz", " ( -_- )  ", " / >  🍪  "],
    [" {\\__/}zzz", " ( -_- )  ", " / >  🍪  "],
    [" {\\__/} zz", " ( -_- )  ", " / >  🍪  "],
    [" {\\__/}  z", " ( - . -) ", " / >  🍪  "],
    [" {\\__/}   ", " ( o . o)!", " / >  🍪  "],
  ],
  wave: [
    [" {\\__/}  ", " ( • . •) ", " / >  🍪 "],
    [" {\\__/}  ", " ( • . •)/", " 🍪 <  | "],
    [" {\\__/}  ", " \\( • . •)", "  |  🍪 >"],
    [" {\\__/}  ", " ( • . •)/", " 🍪 <  | "],
    [" {\\__/}  ", " \\( • . •)", "  |  🍪 >"],
    [" {\\__/}  ", " ( •‿• )/ ", " 🍪 <  | "],
    [" {\\__/}  ", " ( • . •) ", " / >  🍪 "],
  ],
  hop: [
    ["            ", " {\\__/}    ", " ( • . •)  ", " / >  🍪  "],
    [" {\\__/}    ", " ( ^ . ^)  ", "  / > 🍪   ", "            "],
    ["            ", " {\\__/}    ", " ( ^ . ^)  ", "  / > 🍪   "],
    [" {\\__/}    ", " ( • . •)  ", " / >  🍪   ", "            "],
  ],
  look: [
    [" {\\__/}  ", " ( • . •)", " / >  🍪 "],
    [" {\\__/}  ", " ( •  . •)", " / >  🍪 "],
    [" {\\__/}  ", " ( •  . •) ?", " / >  🍪 "],
    [" {\\__/}  ", " (• .  • )", " / >  🍪 "],
    [" {\\__/}  ", " (• .  • ) ?", " / >  🍪 "],
    [" {\\__/}  ", " ( • . •)", " / >  🍪 "],
  ],
  sit: [
    [" {\\__/}  ", " ( • . •)", " /  🍪  \\"],
    [" {\\__/}  ", " ( •‿• )", " /  🍪  \\"],
    [" {\\__/}  ", " ( •‿• )~", " /  🍪  \\"],
    [" {\\__/}  ", " ( •‿• )", " /  🍪  \\"],
  ],
};

// Frame speed per state (ms per frame)
const FRAME_SPEED: Record<KukkiState, number> = {
  idle: 600,
  walk_right: 200,
  walk_left: 200,
  eat: 500,
  sleep: 700,
  wave: 350,
  hop: 250,
  look: 450,
  sit: 800,
};

// ── Idle schedule (same as server) so position computes in sync ──
const IDLE_SCHEDULE: [string, number][] = [
  ['idle', 6], ['look', 4], ['walk_right', 5], ['idle', 4],
  ['sit', 6], ['idle', 3], ['walk_left', 5], ['look', 3],
  ['idle', 5], ['walk_right', 4], ['sit', 5], ['idle', 4],
  ['walk_left', 4], ['idle', 6], ['hop', 3], ['idle', 4],
  ['walk_right', 6], ['look', 3], ['idle', 5], ['walk_left', 5],
  ['sit', 4], ['idle', 3], ['hop', 3], ['walk_right', 4],
  ['idle', 5], ['sleep', 10], ['idle', 4], ['look', 3],
  ['walk_left', 6], ['idle', 5],
];
const CYCLE_LENGTH = IDLE_SCHEDULE.reduce((s, [, d]) => s + d, 0);

// Compute deterministic position from time
function computePosition(containerWidth: number): number {
  const epochSec = Math.floor(Date.now() / 1000);
  let pos = epochSec % CYCLE_LENGTH;
  let x = containerWidth * 0.35;
  let elapsed = 0;

  for (const [state, dur] of IDLE_SCHEDULE) {
    const stateStart = elapsed;
    if (state === 'walk_right') {
      const activeTime = Math.min(pos - stateStart, dur);
      if (activeTime > 0 && pos >= stateStart) x += activeTime * 12;
    } else if (state === 'walk_left') {
      const activeTime = Math.min(pos - stateStart, dur);
      if (activeTime > 0 && pos >= stateStart) x -= activeTime * 12;
    }
    if (pos < elapsed + dur) break;
    elapsed += dur;
  }

  return Math.max(10, Math.min(containerWidth - 130, Math.round(x)));
}

interface LabelObj {
  ja: string;
  en: string;
}

interface ServerStatus {
  state: KukkiState;
  label: LabelObj | string;
  source: 'idle' | 'interaction';
  user: string | null;
  lastInteraction: {
    label: LabelObj | string;
    user: string;
    avatar: string;
    time: string;
    replyTweetId?: string;
  } | null;
}

function getLabelText(label: LabelObj | string, lang: string): string {
  if (typeof label === 'string') return label;
  return lang === 'ja' ? label.ja : label.en;
}

export default function KukkiChan({ lang = 'ja' }: { lang?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<KukkiState>("idle");
  const [label, setLabel] = useState<LabelObj | string>({ ja: 'のんびり中...', en: 'standing around...' });
  const [source, setSource] = useState<string>("idle");
  const [lastInteraction, setLastInteraction] = useState<ServerStatus["lastInteraction"]>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [posX, setPosX] = useState(150);

  // Poll server for kukki state every 3s
  useEffect(() => {
    const poll = () => {
      fetch("/api/kukki")
        .then((r) => r.json())
        .then((data: ServerStatus) => {
          setState(data.state as KukkiState);
          setLabel(data.label);
          setSource(data.source);
          if (data.lastInteraction) setLastInteraction(data.lastInteraction);
        })
        .catch(() => {});
    };
    poll();
    const i = setInterval(poll, 3000);
    return () => clearInterval(i);
  }, []);

  // Frame animation loop
  useEffect(() => {
    const speed = FRAME_SPEED[state] || 600;
    const frames = FRAMES[state] || FRAMES.idle;
    setFrameIdx(0);
    const i = setInterval(() => {
      setFrameIdx((f) => (f + 1) % frames.length);
    }, speed);
    return () => clearInterval(i);
  }, [state]);

  // Position update — deterministic from time for walk states
  useEffect(() => {
    const update = () => {
      const cw = containerRef.current?.clientWidth ?? 500;
      setPosX(computePosition(cw));
    };
    update();
    const i = setInterval(update, 200);
    return () => clearInterval(i);
  }, []);

  const frames = FRAMES[state] || FRAMES.idle;
  const currentLines = frames[frameIdx % frames.length];

  return (
    <div style={{ background: "#fff" }}>
      {/* Stage area */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ height: 180 }}
      >
        {/* Ground line */}
        <div className="absolute bottom-6 left-0 right-0" style={{ borderBottom: "1px dashed #e0e0e0" }}></div>

        {/* Grass dots */}
        {[10, 25, 45, 65, 80, 92].map((pct) => (
          <div key={pct} className="absolute bottom-7 text-[7px] select-none" style={{ left: `${pct}%`, color: "#ddd", fontFamily: "'IBM Plex Mono', monospace" }}>.</div>
        ))}

        {/* Kukki chan */}
        <div
          className="absolute bottom-8"
          style={{
            left: posX,
            transition: "left 0.2s ease-out",
          }}
        >
          <pre
            className="text-[18px] leading-[1.25] select-none whitespace-pre"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#333" }}
          >
            {currentLines.join("\n")}
          </pre>
        </div>

        {/* Shadow */}
        <div
          className="absolute bottom-5"
          style={{
            left: posX + 20,
            width: 80,
            transition: "left 0.2s ease-out",
          }}
        >
          <div className="mx-auto rounded-full" style={{ height: 2, width: 50, background: "#00000008" }}></div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-[6px] flex items-center justify-between" style={{ borderTop: "1px solid #eee", background: "#fafafa" }}>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold" style={{ color: "#333", fontFamily: "'IBM Plex Mono', monospace" }}>kukki chan</span>
          <span className="text-[10px]" style={{ color: "#999", fontFamily: "'IBM Plex Mono', monospace" }}>{getLabelText(label, lang)}</span>
        </div>
        <div className="flex items-center gap-2">
          {source === 'interaction' ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-[5px] h-[5px] rounded-full animate-pulse" style={{ background: "#ff0033" }}></span>
              <span className="text-[9px] font-bold" style={{ color: "#ff0033", fontFamily: "'IBM Plex Mono', monospace" }}>
                {lang === 'ja' ? 'リアクション中' : 'reacting'}
              </span>
            </span>
          ) : (
            <span className="text-[9px]" style={{ color: "#ccc", fontFamily: "'IBM Plex Mono', monospace" }}>
              {lang === 'ja' ? 'のんびり' : 'idle'}
            </span>
          )}
        </div>
      </div>

      {/* Last interaction banner */}
      {lastInteraction && (
        <div className="px-4 py-[5px] flex items-center justify-between" style={{ borderTop: "1px solid #f0f0f0", background: "#fefefe" }}>
          <div className="text-[10px] flex items-center gap-[6px]" style={{ color: "#aaa", fontFamily: "'IBM Plex Mono', monospace" }}>
            <span style={{ color: "#ccc" }}>{lang === 'ja' ? '最新' : 'last'}:</span>
            {lastInteraction.avatar && (
              <img
                src={lastInteraction.avatar}
                alt={lastInteraction.user}
                className="rounded-full"
                style={{ width: 14, height: 14, objectFit: "cover" }}
              />
            )}
            <span>{getLabelText(lastInteraction.label, lang)}</span>
          </div>
          {lastInteraction.replyTweetId && (
            <a
              href={`https://x.com/kukkichan718/status/${lastInteraction.replyTweetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 no-underline hover:opacity-70 transition-opacity"
              title={lang === 'ja' ? 'Xで見る' : 'view on X'}
            >
              <img src="/x-icon.svg" alt="X" className="w-[10px] h-[10px] opacity-30" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
