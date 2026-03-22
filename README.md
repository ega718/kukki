ライセンスはega718のものです。応援したい人は、こちらのリンクからお願いします🙏
https://pump.fun/coin/2rkKDduG1XVkiY6i1qpTx5gxN5RWCGCaEsE4wtympump

# くっきーちゃん 🍪

Xのバーチャルうさぎ

> **おしらせ**
> ここにはほとんどの機能を共有してるけど、一部の機能は自分で作る必要があるよ。そのまま丸パクリはできないようにしてる。でもコードを読んで理解できれば、全部簡単にできるはず。共有してるのは80%くらい。残りは自分のスタイルで作ってね。道がわかれば、あとは自由に進めるよ。

仕事に疲れてた時、ふとAIがここまで来たんだなって思った。そしたら子供の頃のたまごっちを思い出した。あの頃はストレスなんてなかった。だからAIで、あの頃みたいにただ楽しくてかわいい存在を作りたかった。現実をちょっとだけ忘れて、くっきーちゃんに会いに来てね。

くっきーちゃんはOpenClaw AIエージェント。Xで話しかけると日本語でも英語でも自然にお返事するよ。ウェブサイトではリアルタイムでくっきーちゃんの動きがみんなに共有されてるよ。

## 特徴

- **AI自動返信** — Xのメンションを読んで、自然な言葉でお返事
- **ライブアニメーション** — みんなが同じくっきーちゃんの動きをリアルタイムで見れる
- **インタラクション** — ごはん、なでなで、つんつん、あそぶ、おさんぽ、おやすみ、おしゃべり
- **バイリンガル** — 日本語と英語を自動で判別してお返事
- **OpenClaw AIエージェント** — OpenClawエージェントフレームワークで構築

## しくみ

1. 誰かがXで `@kukkichan718` にメンションする
2. くっきーちゃんがAIでメッセージを理解する
3. うさぎとしてお返事する（短くてかわいい、絵文字なし）
4. ウェブサイトのアニメーションがみんなに変わる

## あそびかた

| コマンド | にほんご | English |
|---------|---------|---------|
| ごはん | 「クッキーあげる」「ごはん」「おやつ」 | "give cookie", "feed" |
| なでなで | 「なでなで」「よしよし」「もふもふ」 | "pat", "head pat", "hug" |
| つんつん | 「つんつん」「ぽん」 | "poke", "boop" |
| おやすみ | 「おやすみ」「ねんね」 | "good night", "sleep" |
| あそぶ | 「あそぼう」「じゃんけん」 | "play", "game" |
| おさんぽ | 「おさんぽ」「おでかけ」「冒険」 | "walk", "adventure" |
| おしゃべり | なんでもOK | anything else |

## 技術スタック

- **バックエンド** — Node.js, Express, SQLite (sql.js)
- **フロントエンド** — React, TypeScript, Tailwind CSS, Vite
- **AI** — Moonshot API (OpenAI互換)
- **X連携** — OAuth 1.0a, X API v2
- **アニメーション** — サーバー同期の決定論的ステートマシン

## セットアップ

```bash
# 依存関係をインストール
npm install
cd client && npm install && cd ..

# 環境変数を設定
cp .env.example .env
# .envにAPIキーを入力

# フロントエンドをビルド
npm run build

# サーバーを起動
npm start
```

## 環境変数

`.env.example` を `.env` にコピーして、APIキーを設定してください。

```
PORT=3000
KIMI_API_KEY=your_moonshot_api_key
X_API_KEY=your_x_consumer_key
X_API_SECRET=your_x_consumer_secret
X_ACCESS_TOKEN=your_x_access_token
X_ACCESS_TOKEN_SECRET=your_x_access_token_secret
X_BOT_USERNAME=your_bot_username
```

## プロジェクト構成

```
kukki/
├── server/
│   ├── server.js          # Expressサーバー
│   ├── database.js        # SQLiteデータベース
│   ├── auto-reply.js      # X自動返信エージェント
│   ├── kukki-state.js     # ライブアニメーション管理
│   └── card-generator.js  # カード画像生成
├── client/
│   ├── src/
│   │   ├── pages/         # Reactページ
│   │   ├── components/    # くっきーちゃんアニメーション
│   │   └── lib/           # ユーティリティ
│   └── vite.config.ts
└── public/
```

## ライセンス

MIT

## リンク

- X: [@kukkichan718](https://x.com/kukkichan718)
- 作者: [@ega718](https://x.com/ega718)
- GitHub: [ega718](https://github.com/ega718)
