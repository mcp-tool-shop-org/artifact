<p align="center">
  <a href="README.pt-BR.md">Português (BR)</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.zh.md">中文</a>
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

Sistema de tomada de decisão para artefatos de repositório. Executa um processo de verificação de atualização em qualquer repositório e gera um pacote de decisão estruturado, contendo informações sobre o nível, formato, restrições, ganchos e "átomos de verdade" com referências `arquivo:linha`.

O "Curador" (local Ollama) é responsável pela tomada de decisão. Se o Ollama não estiver disponível, um processo alternativo e determinístico gera uma saída válida, utilizando perfis de inferência e rotação.

## Instalação

```bash
npm install -g @mcptoolshop/artifact
```

Ou execute diretamente:

```bash
npx @mcptoolshop/artifact doctor
```

## Início Rápido

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## Comandos

### Núcleo

| Comando | O que ele faz |
|---------|-------------|
| `drive [repo-path]` | Executa o processo de verificação de atualização do Curador |
| `infer [repo-path]` | Calcula o perfil de inferência (não é necessário o Ollama) |
| `ritual [repo-path]` | Processo completo: verificação + blueprint + revisão + catálogo |
| `blueprint [repo-path]` | Gera um pacote de blueprint a partir da última decisão |
| `buildpack [repo-path]` | Gera um pacote de prompt para modelos de linguagem (LLMs) para conversação |
| `verify [repo-path] --artifact <path>` | Verifica o artefato em relação ao blueprint e ao conjunto de informações de verdade |
| `review [repo-path]` | Imprime um cartão de revisão editorial com 4 seções |
| `catalog` | Gera um catálogo da temporada |

### Configuração e Diagnóstico

| Comando | O que ele faz |
|---------|-------------|
| `doctor` | Verificação da saúde do ambiente (Node, Ollama, git, configuração) |
| `init` | Configuração inicial — cria a configuração |
| `about` | Versão, persona ativa e regras principais |
| `whoami` | Imprime o nome e o lema da persona ativa |
| `--version` | Imprime a versão e sai |

### Memória e Histórico

| Comando | O que ele faz |
|---------|-------------|
| `memory show [--org]` | Exibe a memória do repositório ou do nível da organização |
| `memory forget <name>` | Esquece a memória de um repositório |
| `memory prune <days>` | Remove entradas com mais de N dias |
| `memory stats` | Estatísticas da memória |

### Curadoria em toda a organização

| Comando | O que ele faz |
|---------|-------------|
| `season list` | `set` | `status` | `end` | Gerencia as temporadas de curadoria |
| `org status` | Cobertura, pontuação de diversidade, lacunas |
| `org ledger [n]` | Últimas N decisões |
| `org bans` | Proibições automáticas atuais com os motivos |
| `config get [key]` | Lê os valores de configuração |
| `config set <key> <value>` | Define a configuração (por exemplo, `agent_name`) |

## Opções de Verificação

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

## Saída

Escreve `.artifact/decision_packet.json` no repositório de destino:

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

## Personas

Três personas de curador pré-definidas. Padrão: **Glyph**.

| Persona | Função | Lema |
|---------|------|-------|
| Glyph | design gremlin | Sem evidências, sem credibilidade. |
| Mina | curador de museu | Seja específico. Seja colecionável. |
| Vera | oráculo de verificação | Verdade, mas com estilo. |

```bash
artifact whoami
artifact config set agent_name vera
```

## Modelo de Ameaças

- **O Ollama é apenas local.** Nenhum dado sai da sua máquina. Conecta-se apenas a `localhost`.
- **Sem telemetria.** Não há chamadas de rede, exceto para o Ollama local.
- **Sem segredos.** Não lê, armazena ou transmite credenciais.
- **O histórico é local.** O diretório `.artifact/` fica no repositório e é ignorado pelo git por convenção.
- **O processo alternativo é determinístico.** Se o Ollama estiver indisponível, a saída é gerada a partir de informações do repositório — reproduzível, não aleatória.
- **Escopo de arquivos:** lê arquivos de origem do repositório, escreve apenas em `.artifact/` e `~/.artifact/`.

## Variáveis de Ambiente

| Variável | Propósito |
|----------|---------|
| `OLLAMA_HOST` | Substitui o endpoint do Ollama (padrão: detecção automática) |
| `ARTIFACT_OLLAMA_MODEL` | Força um modelo específico do Ollama |

## Licença

MIT

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
