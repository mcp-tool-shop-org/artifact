<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

代码仓库签名决策系统。它会针对任何代码仓库运行新鲜度检查，并输出一个结构化的决策包，包含层级、格式、约束、钩子、以及带有`file:line`引用的事实信息。

“ Curator”（本地 Ollama）驱动决策过程。如果 Ollama 不可用，则会使用一个确定性的备用方案，通过使用推理配置文件和种子轮换来生成有效的输出。

## 安装

```bash
npm install -g @mcptoolshop/artifact
```

或者直接运行：

```bash
npx @mcptoolshop/artifact doctor
```

## 快速入门

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## 命令

### 核心功能

| 命令 | 功能描述 |
|---------|-------------|
| `drive [repo-path]` | 运行 Curator 的新鲜度检查 |
| `infer [repo-path]` | 计算推理配置文件（不需要 Ollama） |
| `ritual [repo-path]` | 完整流程：检查 + 蓝图 + 审查 + 目录 |
| `blueprint [repo-path]` | 从最新的决策生成蓝图包 |
| `buildpack [repo-path]` | 为聊天大型语言模型生成构建提示包 |
| `verify [repo-path] --artifact <path>` | 对代码仓库进行蓝图和事实信息的检查 |
| `review [repo-path]` | 打印一个包含 4 个部分的编辑审查卡片 |
| `catalog` | 生成季度目录 |

### 配置和诊断

| 命令 | 功能描述 |
|---------|-------------|
| `doctor` | 环境健康检查（Node、Ollama、git、配置） |
| `init` | 首次运行配置向导，创建配置文件 |
| `about` | 版本、活动角色和核心规则 |
| `whoami` | 打印活动角色的名称和座右铭 |
| `--version` | 打印版本信息并退出 |

### 内存和历史记录

| 命令 | 功能描述 |
|---------|-------------|
| `memory show [--org]` | 显示代码仓库或组织级别的内存信息 |
| `memory forget <name>` | 清除代码仓库的内存 |
| `memory prune <days>` | 清除超过 N 天的条目 |
| `memory stats` | 内存统计信息 |

### 组织范围内的代码仓库管理

| 命令 | 功能描述 |
|---------|-------------|
| `season list` | `set` | `status` | `end` | 管理代码仓库管理季度 |
| `org status` | 覆盖率、多样性得分、缺失项 |
| `org ledger [n]` | 最近 N 个决策 |
| `org bans` | 当前自动阻止列表及其原因 |
| `config get [key]` | 读取配置文件值 |
| `config set <key> <value>` | 设置配置文件（例如，`agent_name`） |

### 批量操作和发布

| 命令 | 功能描述 |
|---------|-------------|
| `crawl --org <name>` | 批量管理 GitHub 组织中的所有代码仓库 |
| `crawl --from <file>` | 爬取文本文件中列出的代码仓库 |
| `publish --pages-repo <o/r>` | 将目录推送到 GitHub Pages |
| `privacy` | 显示存储位置和数据策略 |
| `reset --org` | `--cache` | `--all` | 删除存储的数据（需要确认） |

### 构建的制品跟踪

| 命令 | 功能描述 |
|---------|-------------|
| `built add <repo> <path...>` | 附加代码仓库文件路径 |
| `built ls [repo-name]` | 列出构建状态 |
| `built status <repo-name>` | 对单个代码仓库进行详细跟踪 |

## 驱动选项

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

## 输出

将 `.artifact/decision_packet.json` 文件写入目标代码仓库：

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

## 角色

内置了三个代码仓库管理角色。默认角色：**Glyph**。

| 角色 | 角色 | 座右铭 |
|---------|------|-------|
| Glyph | 设计精灵 | 没有凭证，就没有价值。 |
| Mina | 博物馆管理员 | 使其具体。使其具有收藏价值。 |
| Vera | 验证预言家 | 真实，但要美观。 |

```bash
artifact whoami
artifact config set agent_name vera
```

## 远程选项

所有核心命令都支持 `--remote` 选项，用于分析 GitHub 代码仓库，而无需进行本地克隆：

```
--remote <owner/repo>  Analyze a GitHub repo without cloning
--ref <branch|tag|sha> Git ref for remote repos (default: default branch)
--remote-refresh       Bypass remote cache, re-fetch all API data
```

结果会缓存在 `~/.artifact/repos/owner/repo/` 目录下。需要 `GITHUB_TOKEN` 才能访问私有代码仓库，并获得更高的速率限制。

## 威胁模型

- **Ollama 仅在本地运行。** 您的数据不会离开您的机器。 仅连接到 `localhost`。
- **无任何数据收集。** 不进行任何分析。 不会向服务器发送任何数据。
- **不涉及任何敏感信息。** 不会读取、存储或传输任何凭据。
- **历史记录存储在本地。** `.artifact/` 目录位于代码仓库中，默认情况下会被 Git 忽略。
- **降级模式是确定性的。** 如果 Ollama 无法使用，输出结果将基于代码仓库的信息进行初始化，结果可重复，而非随机。
- **文件范围：** 读取代码仓库中的源文件，仅写入 `.artifact/` 目录和 `~/.artifact/` 目录。

## 环境变量

| 变量 | 用途 |
|----------|---------|
| `GITHUB_TOKEN` | GitHub PAT，用于远程访问、爬取和发布（每小时 5000 次请求，与 60 次相比）。 |
| `OLLAMA_HOST` | 覆盖 Ollama 的连接地址（默认：自动检测）。 |
| `ARTIFACT_OLLAMA_MODEL` | 强制使用特定的 Ollama 模型。 |

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
