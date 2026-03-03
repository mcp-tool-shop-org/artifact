<p align="center">
  <a href="README.it.md">Italiano</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.pt-BR.md">Português (BR)</a> | <a href="README.zh.md">中文</a>
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

Sistema di decisione per gli artefatti del repository. Esegue un controllo di aggiornamento su qualsiasi repository e produce un pacchetto di decisione strutturato, contenente informazioni su livello, formato, vincoli, hook e "atom" di verità con riferimenti `file:line`.

"The Curator" (Ollama locale) gestisce il processo decisionale. Se Ollama non è disponibile, un meccanismo di fallback deterministico produce un output valido utilizzando profili di inferenza e rotazione controllata.

## Installazione

```bash
npm install -g @mcptoolshop/artifact
```

Oppure eseguilo direttamente:

```bash
npx @mcptoolshop/artifact doctor
```

## Guida rapida

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## Comandi

### Funzionalità principali

| Comando | Cosa fa |
|---------|-------------|
| `drive [repo-path]` | Esegue il controllo di aggiornamento di "The Curator" |
| `infer [repo-path]` | Calcola il profilo di inferenza (non è necessario Ollama) |
| `ritual [repo-path]` | Rituale completo: controllo + blueprint + revisione + catalogo |
| `blueprint [repo-path]` | Genera il pacchetto "Blueprint" dalla decisione più recente |
| `buildpack [repo-path]` | Genera un pacchetto di prompt per i modelli linguistici di grandi dimensioni (LLM) per la chat |
| `verify [repo-path] --artifact <path>` | Verifica l'artefatto rispetto al "blueprint" e al pacchetto di verità |
| `review [repo-path]` | Stampa una scheda di revisione editoriale con 4 sezioni |
| `catalog` | Genera il catalogo della stagione |

### Configurazione e diagnostica

| Comando | Cosa fa |
|---------|-------------|
| `doctor` | Controllo dello stato dell'ambiente (Node, Ollama, git, configurazione) |
| `init` | Configurazione iniziale: crea la configurazione |
| `about` | Versione, personalità attiva e regole principali |
| `whoami` | Stampa il nome e il motto della personalità attiva |
| `--version` | Stampa la versione e termina l'esecuzione |

### Memoria e cronologia

| Comando | Cosa fa |
|---------|-------------|
| `memory show [--org]` | Mostra la memoria a livello di repository o organizzazione |
| `memory forget <name>` | Cancella la memoria di un repository |
| `memory prune <days>` | Elimina le voci più vecchie di N giorni |
| `memory stats` | Statistiche sulla memoria |

### Gestione centralizzata della curatela

| Comando | Cosa fa |
|---------|-------------|
| `season list` | `set` | `status` | `end` | Gestisci le stagioni di curatela |
| `org status` | Copertura, punteggio di diversità, lacune |
| `org ledger [n]` | Ultime N decisioni |
| `org bans` | Attuali blocchi automatici con le relative motivazioni |
| `config get [key]` | Leggi i valori di configurazione |
| `config set <key> <value>` | Imposta la configurazione (ad esempio, `agent_name`) |

## Opzioni del controllo

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

## Output

Scrive `.artifact/decision_packet.json` nel repository di destinazione:

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

## Personalità

Tre personalità di curatore predefinite. Predefinita: **Glyph**.

| Personalità | Ruolo | Motto |
|---------|------|-------|
| Glyph | design gremlin | No vibes without receipts. |
| Mina | museum curator | Make it specific. Make it collectible. |
| Vera | verification oracle | Truth, but make it pretty. |

```bash
artifact whoami
artifact config set agent_name vera
```

## Modello di minaccia

- **Ollama è locale.** Nessun dato lascia la tua macchina. Si connette solo a `localhost`.
- **Nessuna telemetria.** Nessuna chiamata di rete tranne quelle verso Ollama locale.
- **Nessun segreto.** Non legge, memorizza o trasmette credenziali.
- **La cronologia è locale.** `.artifact/` si trova nel repository ed è ignorata da git per convenzione.
- **Il fallback è deterministico.** Se Ollama non è disponibile, l'output è generato a partire dai segnali del repository: riproducibile, non casuale.
- **Ambito dei file:** legge i file sorgente del repository, scrive solo in `.artifact/` e `~/.artifact/`.

## Variabili d'ambiente

| Variabile | Scopo |
|----------|---------|
| `OLLAMA_HOST` | Sovrascrive l'endpoint di Ollama (predefinito: rilevamento automatico) |
| `ARTIFACT_OLLAMA_MODEL` | Forza l'utilizzo di un modello Ollama specifico |

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
