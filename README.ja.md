<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a> | <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/artifact/readme.png" width="400" alt="Artifact">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/artifact/actions"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/artifact/ci.yml?label=CI" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/artifact"><img src="https://img.shields.io/npm/v/@mcptoolshop/artifact" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/artifact/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/artifact/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

リポジトリの署名アーティファクト決定システム。任意のレポジトリに対して鮮度チェックを実行し、構造化された決定情報を出力します。これには、ティア、形式、制約、フック、および `file:line` で参照される真実のデータが含まれます。

「キュレーター」（ローカルの Ollama）が決定を行います。Ollama が利用できない場合は、推論プロファイルとシード回転を使用して、決定論的なフォールバックで有効な出力を生成します。

## インストール

```bash
npm install -g @mcptoolshop/artifact
```

または、直接実行します。

```bash
npx @mcptoolshop/artifact doctor
```

## クイックスタート

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## コマンド

### コア機能

| コマンド | 機能 |
|---------|-------------|
| `drive [repo-path]` | キュレーターの鮮度チェックを実行します。 |
| `infer [repo-path]` | 推論プロファイルを計算します（Ollama は不要）。 |
| `ritual [repo-path]` | 完全なプロセス：鮮度チェック + 設計図作成 + レビュー + カタログ作成 |
| `blueprint [repo-path]` | 最新の決定情報から設計図パッケージを生成します。 |
| `buildpack [repo-path]` | チャット LLM 用のビルダープロンプトパッケージを生成します。 |
| `verify [repo-path] --artifact <path>` | アーティファクトを設計図と真実データバンドルに対して検証します。 |
| `review [repo-path]` | 4 つのブロックで構成されたレビューカードを出力します。 |
| `catalog` | シーズンカタログを生成します。 |

### セットアップと診断

| コマンド | 機能 |
|---------|-------------|
| `doctor` | 環境の健全性チェック（Node、Ollama、git、設定）。 |
| `init` | 初回実行時のオンボーディング：設定ファイルを作成します。 |
| `about` | バージョン、アクティブなペルソナ、およびコアルール。 |
| `whoami` | アクティブなペルソナの名前とモットーを表示します。 |
| `--version` | バージョンを表示して終了します。 |

### メモリと履歴

| コマンド | 機能 |
|---------|-------------|
| `memory show [--org]` | レポジトリまたは組織レベルのメモリを表示します。 |
| `memory forget <name>` | レポジトリのメモリをクリアします。 |
| `memory prune <days>` | N 日よりも古いエントリを削除します。 |
| `memory stats` | メモリの統計情報を表示します。 |

### 組織全体のキュレーション

| コマンド | 機能 |
|---------|-------------|
| `season list` | `set` | `status` | `end` | キュレーションシーズンを管理します。 |
| `org status` | カバレッジ、多様性スコア、ギャップ。 |
| `org ledger [n]` | 直近の N 件の決定情報。 |
| `org bans` | 現在の自動ブロック対象とその理由。 |
| `config get [key]` | 設定値を確認します。 |
| `config set <key> <value>` | 設定を変更します（例：`agent_name`）。 |

## 実行オプション

```
--no-curator         Skip Ollama, use deterministic fallback
--curator-speak      Print Curator callouts (veto/twist/pick/risk)
--explain            Print inference profile (why this tier)
--blueprint          Also generate Blueprint Pack
--review             Also print review card
--type <type>        Repo type (R1_tooling_cli, etc.)
--web                Enable web recommendations
--curate-org         Enable org-wide curation (season + bans + gaps)
```

## 出力

`.artifact/decision_packet.json` をターゲットレポジトリに書き込みます。

```json
{
  "repo_name": "my-tool",
  "tier": "Fun",
  "format_candidates": ["F2_card_deck", "F9_museum_placard"],
  "constraints": ["monospace-only", "uses-failure-mode"],
  "must_include": ["one real invariant", "one failure mode", "one CLI flag"],
  "freshness_payload": {
    "weird_detail": "uses \\\\?\\ prefix to bypass Win32 parsing",
    "recent_change": "v1.0.3 added TOCTOU identity checks",
    "sharp_edge": "HMAC dot-separator must be in outer base64 layer"
  }
}
```

## ペルソナ

3 つの組み込みキュレーターペルソナがあります。デフォルトは **Glyph** です。

| ペルソナ | 役割 | モットー |
|---------|------|-------|
| Glyph | 設計の悪魔 | 証拠なしの感情は不要。 |
| Mina | 博物館のキュレーター | 具体的に。収集可能に。 |
| Vera | 検証のオラクル | 真実を美しく。 |

```bash
artifact whoami
artifact config set agent_name vera
```

## 脅威モデル

- **Ollama はローカルでのみ動作します。** データはあなたのマシンから一切外部に出ません。`localhost` にのみ接続します。
- **テレメトリーはありません。** ローカルの Ollama へのネットワーク接続のみを行います。
- **機密情報は扱いません。** 認証情報を読み込んだり、保存したり、送信したりしません。
- **履歴はローカルに保存されます。** `.artifact/` はレポジトリ内に保存され、通常は git で無視されます。
- **フォールバックは決定論的です。** Ollama が利用できない場合、出力はレポジトリの情報を元にシードされ、再現可能です（ランダムではありません）。
- **ファイルスコープ：** レポジトリのソースファイルを読み込み、`.artifact/` と `~/.artifact/` のみに書き込みます。

## 環境変数

| 変数 | 目的 |
|----------|---------|
| `OLLAMA_HOST` | Ollama のエンドポイントを上書きします（デフォルト：自動検出）。 |
| `ARTIFACT_OLLAMA_MODEL` | 特定の Ollama モデルを強制的に使用します。 |

## ライセンス

MIT

---

作成者：<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
