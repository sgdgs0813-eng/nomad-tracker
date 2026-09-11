# nomad-tracker プロジェクト概要

「PC1台で月40万稼いでノマド生活する」ための目標達成トラッカー。
スマホにインストールして使う PWA。

## 技術スタック

- **フレームワーク**: なし（素の HTML / CSS / JavaScript）
- **ビルド**: なし。`index.html` を直接編集して push するだけ
- **PWA**: `manifest.json` + `sw.js`（Service Worker）
- **データ保存**: localStorage（正）＋ Supabase REST（デバイス間同期用のミラー）

## ファイル構成

```
index.html      # 全部入り（約1,640行）。CSS も JS も SECTIONS 定義も全てここ
manifest.json   # PWA マニフェスト。アイコンは SVG の data URI 直書き
sw.js           # Service Worker。キャッシュではなく「通知スケジューリング」が主目的
```

**3ファイルだけ**。`index.html` の中身は上から順に `<style>`（11〜481行）→ HTML 本体
（486〜770行）→ `<script>`（772行〜末尾）という並び。

## 画面構成（4タブ）

`switchTab(name)` で切り替わる。下部ナビゲーションに対応。

| タブ | id | 内容 |
|------|-----|------|
| デイリー | `tab-daily` | その日のタスク一覧・チェック・タスクごとのメモ。日付を前後に移動できる |
| ウィークリー | `tab-weekly` | サブタブ3つ（振り返り / 収入記録 / 次の一歩） |
| 進捗 | `tab-progress` | Phase 1〜3 + ノマド達成 のフェーズカード |
| 設定 | `tab-settings` | 通知の許可・リマインダー時刻の設定 |

## データモデル

### SECTIONS（index.html 872行〜）

タスク定義のマスタ。**ここを編集するとアプリの中身が変わる。**

```javascript
const SECTIONS = [
  {
    theme: '整体（本業）', color: '#4cc9f0',
    days: [1,2,3,4,5,6],          // このセクションを表示する曜日（0=日 … 6=土）
    tasks: [
      { text: '患者対応を丁寧にやりきる', freq: '毎日（仕事日）' },
      { text: '後輩に1つ技術を伝える', freq: '週3回', days: [2,4,6] },  // タスク個別の曜日指定
    ]
  },
  ...
];
```

- タスクに `days` があればそちらが優先、無ければセクションの `days` を使う（`isVisible()`）
- 曜日の判定は「表示中の日付」基準。今日固定ではない

### localStorage キー

| キー | 内容 |
|------|------|
| `nomad_daily_v1_<YYYY-MM-DD>` | その日のチェック状態 |
| `nomad_task_memos_v1_<YYYY-MM-DD>` | タスクごとのメモ |
| `nomad_weekly_v1_<週の月曜日>` | 週次の振り返り・収入記録 |
| `nomad_progress_v1` | フェーズ進捗（`{ phase: 1, ... }`） |
| `nomad_sleep_v1` | 睡眠記録 |
| `nomad_depend_v1` | 依存記録 |
| `nomad_trouble_v1` | 困りごと |
| `nomad_reminders_v1` | 通知リマインダー設定 |

すべて `_v1` サフィックス付き。**スキーマを壊す変更をするときはキーを `_v2` にする**
（既存データを読んで壊れるより、新キーで作り直すほうが安全）。

### Supabase

```javascript
const SB_URL = 'https://aljfevndzqigddrevpjf.supabase.co';
// テーブル: tracker_data { id: text (PK), data: jsonb, updated_at: timestamptz }
```

- `sbGet(id)` / `sbSet(id, data)` の2関数だけ。REST を `fetch` で直叩き（SDK 不使用）
- `Prefer: resolution=merge-duplicates` で upsert
- id の付け方は localStorage キーとほぼ同じ（`daily_<日付>` / `memos_<日付>` /
  `progress` / `weekly_<月曜日>`）
- `syncFromSupabase()` が起動時に読み込んで localStorage を上書きする

## よくあるハマりポイント

1. **localStorage が正、Supabase は同期用のミラー**
   `sbGet` / `sbSet` は `try/catch` で例外を握りつぶす設計（失敗しても `null` / 無視）。
   オフラインでも動くための意図的な作りなので、**エラーを投げるように「修正」しないこと。**
   逆に「保存されない」不具合を追うときは Supabase 側ではなく localStorage を先に見る。

2. **関数の定義順に注意**
   `index.html` は素の `<script>` で、モジュールでもバンドラでもない。
   `const` / `let` で定義した関数や定数は巻き上げされないため、**初期化処理より前に
   定義されている必要がある**。過去に通知関数の定義順で実際に壊れている
   （コミット「通知関数の定義順を修正、initより前に移動」）。

3. **通知は Service Worker の `setTimeout` ベース**
   `sw.js` はメインスレッドから `SCHEDULE_NOTIFICATIONS` を受け取り、`setTimeout` で
   タイマーを積む。**ブラウザが Service Worker を停止するとタイマーは消える。**
   Push API を使っていないので、長期間アプリを開かないと通知は止まる。
   これは既知の制約であってバグではない。確実な通知が要るなら Web Push への
   作り直しが必要。

4. **Supabase の anon key がリポジトリに直書きされている**
   このリポジトリは **public**。anon key はクライアントに露出する前提のキーなので
   それ自体は設計どおりだが、**`tracker_data` テーブルの RLS（Row Level Security）が
   有効でないと、誰でも読み書きできる状態**になる。認証は一切入っていないので、
   個人情報や見られて困る内容をこのアプリに入れる前に Supabase 側の RLS を確認すること。

5. **ビルド手順が無い**
   `index.html` を編集して push すれば終わり。ビルド・バンドル・トランスパイルは一切無い。
   「ビルドコマンドは？」と探す必要はない。

6. **PWA のキャッシュ更新**
   `sw.js` は `skipWaiting()` + `clients.claim()` で即座に新バージョンへ入れ替わる。
   ファイルのキャッシュはしていない（`CACHE_NAME` は宣言だけで未使用）ので、
   オフライン表示はできない。更新が反映されないときはブラウザのキャッシュを疑う。

## 動作確認

ローカルで開くだけ。Service Worker は `https` か `localhost` でしか動かないので、
`file://` で開くと通知機能だけ無効になる。

```bash
python3 -m http.server 8000
# → http://localhost:8000
```
