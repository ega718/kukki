import { useState, useEffect } from "react";
import KukkiChan from "@/components/KukkiChan";

const t = {
  ja: {
    subtitle: "くっきーちゃんポータル",
    nav: [
      { label: "トップ", href: "#" },
      { label: "くっきー", href: "#kukki" },
      { label: "について", href: "#about" },
    ],
    langLabel: "EN",
    heroLabel: "kukki chan",
    heroTitle: "くっきーちゃん、いつでもここにいるよ",
    heroDesc: "くっきーちゃんはXに住んでるちいさなうさぎ。AIで会話を理解して、日本語でも英語でもお返事するよ。クッキーをあげたり、なでたり、一緒にあそんだり。",
    heroTagline: "OpenClaw AI Agent",
    heroCta: "Xで話しかける",
    animLabel: "くっきーちゃん",
    animOnline: "オンライン",
    animIdle: "のんびり中",
    profileTitle: "プロフィール",
    species: "しゅるい",
    speciesVal: "うさぎ",
    likes: "すきなもの",
    likesVal: "クッキー",
    mood: "きぶん",
    moodVal: "いつもしあわせ",
    home: "おうち",
    homeVal: "X",
    xAccount: "Xアカウント",
    xCta: "ここで話しかけてね",
    xBuilt: "愛をこめて作った",
    howTitle: "あそびかた",
    howSteps: [
      "Xで @kukkichan718 にメンション",
      "「クッキーあげる」でごはん",
      "「なでなで」でなでる",
      "「つんつん」でつつく",
      "「おさんぽ」でおでかけ",
      "なんでも話しかけてOK",
    ],
    statsTitle: "アクティビティ",
    statReplies: "おへんじ",
    statToday: "きょう",
    statFriends: "おともだち",
    statDays: "にっすう",
    aboutTitle: "くっきーちゃんについて",
    aboutHeading: "ストレスを忘れて、ちょっとだけ休もう",
    aboutP1: "仕事に疲れてた時、ふとAIがここまで来たんだなって思った。そしたら子供の頃のたまごっちを思い出した。あの頃はストレスなんてなかった。だからAIで、あの頃みたいにただ楽しくてかわいい存在を作りたかった。現実をちょっとだけ忘れて、くっきーちゃんに会いに来てくれたら嬉しいな。",
    aboutP2: "くっきーちゃんはOpenClaw AIエージェント。Xで話しかけると自然にお返事するよ。クッキーをあげると食べるし、なでなですると喜ぶし、つんつんするとびっくりする。このウェブサイトでは、みんなが同じくっきーちゃんをリアルタイムで見てるよ。",
    features: [
      "OpenClaw AIエージェント",
      "Xでリアルタイム自動返信",
      "日本語 / 英語 バイリンガル",
      "なでなで・つんつん・おやすみ対応",
      "ウェブサイトでライブ同期",
      "みんなで同じくっきーちゃんを共有",
    ],
    footer: "くっきーちゃんポータル",
    copyright: "kukki",
  },
  en: {
    subtitle: "kukki chan portal",
    nav: [
      { label: "top", href: "#" },
      { label: "kukki", href: "#kukki" },
      { label: "about", href: "#about" },
    ],
    langLabel: "JP",
    heroLabel: "kukki chan",
    heroTitle: "kukki chan, always here for you",
    heroDesc: "kukki chan is a tiny bunny living on X. she understands your messages with AI and replies in both japanese and english. feed her cookies, give her pats, play with her.",
    heroTagline: "OpenClaw AI Agent",
    heroCta: "talk on X",
    animLabel: "kukki chan",
    animOnline: "online",
    animIdle: "chilling",
    profileTitle: "profile",
    species: "species",
    speciesVal: "bunny",
    likes: "likes",
    likesVal: "cookies",
    mood: "mood",
    moodVal: "always happy",
    home: "home",
    homeVal: "X",
    xAccount: "X account",
    xCta: "talk to kukki here",
    xBuilt: "built with love by",
    howTitle: "how to interact",
    howSteps: [
      "mention @kukkichan718 on X",
      '"give cookie" to feed her',
      '"pat" to pet her head',
      '"poke" to boop her',
      '"walk" to go on adventure',
      "or just chat about anything",
    ],
    statsTitle: "activity",
    statReplies: "replies",
    statToday: "today",
    statFriends: "friends",
    statDays: "days alive",
    aboutTitle: "about kukki",
    aboutHeading: "forget the stress, take a little break",
    aboutP1: "i was burned out from work when i realized how far AI has come. it reminded me of my tamagotchi as a kid. back then there was no stress. so i wanted to build something with AI that's just fun and cute. something that lets you forget the real world for a bit. if kukki chan can do that for you, that makes me happy.",
    aboutP2: "kukki chan is an OpenClaw AI agent. she replies naturally when you talk to her on X. give her a cookie and she eats it. pat her and she smiles. poke her and she jumps. everyone visiting this site sees the same kukki in real-time.",
    features: [
      "OpenClaw AI agent",
      "real-time auto-reply on X",
      "japanese / english bilingual",
      "pat, poke, sleep interactions",
      "live sync on website",
      "shared experience for all visitors",
    ],
    footer: "kukki chan portal",
    copyright: "kukki",
  },
};

type Lang = "ja" | "en";

interface Stats {
  totalReplies: number;
  repliesToday: number;
  uniqueUsers: number;
  daysAlive: number;
}

export default function Home() {
  const [time, setTime] = useState(new Date());
  const [lang, setLang] = useState<Lang>("ja");
  const [stats, setStats] = useState<Stats>({ totalReplies: 0, repliesToday: 0, uniqueUsers: 0, daysAlive: 1 });

  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const load = () => fetch("/api/kukki/stats").then(r => r.json()).then(setStats).catch(() => {});
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const s = t[lang];

  return (
    <div className="min-h-screen" style={{ background: "#f0f0f0" }}>
      {/* ━━ Top bar ━━ */}
      <div style={{ background: "#ff0033" }}>
        <div className="mx-auto flex items-center justify-between px-4 py-[6px]" style={{ maxWidth: 1020 }}>
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="kukki" className="h-[20px] w-[20px] rounded-full" style={{ objectFit: "cover" }} />
            <span className="text-white font-bold text-[15px] tracking-wide" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
              kukki
            </span>
            <span className="text-white/60 text-[11px] hidden sm:inline">
              {s.subtitle}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/50 text-[10px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {time.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}
              {" "}
              {time.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={() => setLang(lang === "ja" ? "en" : "ja")}
              className="text-[10px] text-white/70 hover:text-white border border-white/30 px-2 py-[1px] cursor-pointer bg-transparent font-inherit transition-colors"
            >
              {s.langLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ━━ Nav ━━ */}
      <div className="border-b" style={{ borderColor: "#ddd", background: "#fff" }}>
        <div className="mx-auto flex items-center" style={{ maxWidth: 1020 }}>
          <nav className="flex text-[12px] font-medium" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            {s.nav.map((item, i) => (
              <a
                key={item.label}
                href={item.href}
                className="no-underline hover:no-underline transition-colors"
                style={{
                  padding: "8px 18px",
                  color: "#333",
                  borderRight: "1px solid #eee",
                  borderLeft: i === 0 ? "1px solid #eee" : undefined,
                  background: "transparent",
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = "#f8f8f8"; (e.target as HTMLElement).style.color = "#ff0033"; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.color = "#333"; }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* ━━ Main ━━ */}
      <div className="mx-auto px-4 py-3" style={{ maxWidth: 1020 }}>
        <div className="flex gap-3">
          {/* ── Left column ── */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Hero */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }}>
              <div className="flex items-center justify-between px-3 py-[5px]" style={{ background: "#ff0033", borderBottom: "1px solid #cc0029" }}>
                <span className="text-[11px] font-bold text-white">{s.heroLabel}</span>
                <span className="text-[9px] text-white/50" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{s.heroTagline}</span>
              </div>
              <div className="px-4 py-5">
                <h1 className="text-[22px] font-bold leading-snug" style={{ color: "#222", fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}>
                  {s.heroTitle}
                </h1>
                <p className="mt-3 text-[12px] leading-[1.9]" style={{ color: "#666" }}>
                  {s.heroDesc}
                </p>
                <div className="mt-4">
                  <a
                    href="https://x.com/kukkichan718"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] font-bold no-underline hover:no-underline px-4 py-[6px] transition-opacity hover:opacity-80"
                    style={{ background: "#333", color: "#fff" }}
                  >
                    @kukkichan718 {s.heroCta} →
                  </a>
                </div>
              </div>
            </div>

            {/* Kukki animation */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }} id="kukki">
              <div className="flex items-center justify-between px-3 py-[5px]" style={{ borderBottom: "1px solid #eee", background: "#fafafa" }}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: "#4ade80" }}></span>
                  <span className="text-[11px] font-bold" style={{ color: "#333" }}>
                    {s.animLabel}
                  </span>
                  <span className="text-[9px] px-[5px] py-[1px]" style={{ background: "#e8f8e8", color: "#2d8a2d", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {s.animOnline}
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: "#bbb" }}>
                  {s.animIdle}
                </span>
              </div>
              <KukkiChan lang={lang} />
            </div>

            {/* About */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }} id="about">
              <div className="px-3 py-[5px]" style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}>
                <span className="text-[11px] font-bold" style={{ color: "#333" }}>{s.aboutTitle}</span>
              </div>
              <div className="p-4">
                <h2 className="text-[18px] font-bold leading-snug" style={{ color: "#222", fontFamily: "'Noto Serif JP', serif" }}>
                  {s.aboutHeading}
                </h2>
                <p className="mt-3 text-[12px] leading-[1.9]" style={{ color: "#555" }}>
                  {s.aboutP1}
                </p>
                <p className="mt-2 text-[12px] leading-[1.9]" style={{ color: "#555" }}>
                  {s.aboutP2}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1">
                  {s.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[11px] py-[3px]" style={{ color: "#666", borderBottom: "1px solid #f0f0f0" }}>
                      <span style={{ color: "#ff0033", fontSize: 8 }}>&#9632;</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-3" style={{ width: 280, flexShrink: 0 }}>
            {/* Profile */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }}>
              <div className="px-3 py-[5px]" style={{ background: "#333", borderBottom: "1px solid #222" }}>
                <span className="text-[11px] font-bold text-white">{s.profileTitle}</span>
              </div>
              <div className="p-3">
                <div className="flex items-center justify-center py-2">
                  <pre className="text-[13px] leading-[1.2] select-none" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#333" }}>
{` {\\__/}
 ( • . •)
 / >  🍪`}
                  </pre>
                </div>
                <div className="mt-2 text-[11px]" style={{ color: "#666" }}>
                  {[
                    [s.species, s.speciesVal],
                    [s.likes, s.likesVal],
                    [s.mood, s.moodVal],
                    [s.home, s.homeVal],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between py-[3px]" style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <span style={{ color: "#999" }}>{label}</span>
                      <span style={{ color: "#333", fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* X Account */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }}>
              <div className="px-3 py-[5px]" style={{ background: "#1d9bf0" }}>
                <span className="text-[11px] font-bold text-white">{s.xAccount}</span>
              </div>
              <div className="p-3 text-center">
                <a
                  href="https://x.com/kukkichan718"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-bold no-underline hover:underline"
                  style={{ color: "#1d9bf0" }}
                >
                  @kukkichan718
                </a>
                <div className="mt-1 text-[10px]" style={{ color: "#aaa" }}>
                  {s.xCta}
                </div>
                <div className="mt-3 pt-2 text-[9px] space-y-1" style={{ color: "#ccc", borderTop: "1px solid #f0f0f0" }}>
                  <div>
                    {s.xBuilt}{" "}
                    <a
                      href="https://x.com/ega718"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="no-underline hover:underline"
                      style={{ color: "#999" }}
                    >
                      @ega718
                    </a>
                  </div>
                  <div>
                    <a
                      href="https://github.com/ega718"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 no-underline hover:opacity-70 transition-opacity"
                      style={{ color: "#999" }}
                    >
                      <img src="/github.svg" alt="GitHub" className="w-[11px] h-[11px] opacity-40" />
                      <span>ega718</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Live stats */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }}>
              <div className="px-3 py-[5px]" style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}>
                <span className="text-[11px] font-bold" style={{ color: "#333" }}>{s.statsTitle}</span>
              </div>
              <div className="grid grid-cols-2">
                {[
                  { label: s.statReplies, value: stats.totalReplies.toString() },
                  { label: s.statToday, value: stats.repliesToday.toString() },
                  { label: s.statFriends, value: stats.uniqueUsers.toString() },
                  { label: s.statDays, value: stats.daysAlive.toString() },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    className="text-center py-3"
                    style={{
                      borderRight: i % 2 === 0 ? "1px solid #f0f0f0" : "none",
                      borderBottom: i < 2 ? "1px solid #f0f0f0" : "none",
                    }}
                  >
                    <div className="text-[20px] font-bold" style={{ color: "#ff0033", fontFamily: "'Noto Serif JP', serif" }}>
                      {item.value}
                    </div>
                    <div className="text-[9px] mt-[2px]" style={{ color: "#999" }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How to interact */}
            <div style={{ background: "#fff", border: "1px solid #ddd" }}>
              <div className="px-3 py-[5px]" style={{ background: "#ff6600" }}>
                <span className="text-[11px] font-bold text-white">{s.howTitle}</span>
              </div>
              <div className="p-3 text-[11px]" style={{ color: "#555" }}>
                {s.howSteps.map((step, i) => (
                  <div key={i} className="flex gap-2 py-[4px]" style={{ borderBottom: i < s.howSteps.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                    <span className="font-bold flex-shrink-0" style={{ color: "#ff6600", width: 14, textAlign: "right" }}>{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Decorative ASCII */}
            <div className="text-center py-3" style={{ background: "#fff", border: "1px solid #ddd" }}>
              <pre className="text-[9px] leading-[1.2] select-none inline-block" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#ccc" }}>
{` {\\__/}
 ( •.• )
 / > 🍪
 kukki!`}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* ━━ Footer ━━ */}
      <div className="mt-3" style={{ borderTop: "1px solid #ddd", background: "#fff" }}>
        <div className="mx-auto px-4 py-3 flex items-center justify-between" style={{ maxWidth: 1020 }}>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "#999" }}>
            <span className="font-bold" style={{ color: "#333" }}>kukki</span>
            <span>{s.footer}</span>
          </div>
          <a
            href="https://x.com/kukkichan718"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] no-underline hover:underline"
            style={{ color: "#ccc" }}
          >
            &copy; {new Date().getFullYear()} {s.copyright}
          </a>
        </div>
      </div>
    </div>
  );
}
