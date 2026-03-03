<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Sistema di decisione per gli artefatti dei repository. Esegue un controllo di aggiornamento su qualsiasi repository e produce un pacchetto di decisioni strutturato, contenente informazioni su livello, formato, vincoli, hook e "atom" di verità con riferimenti "file:linea".

"The Curator" (Ollama locale) gestisce il processo decisionale. Se Ollama non è disponibile, viene utilizzata una soluzione alternativa deterministica che produce risultati validi utilizzando profili di inferenza e rotazione.

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
| `drive [repo-path]` | Esegui il controllo di aggiornamento di "The Curator" |
| `infer [repo-path]` | Calcola il profilo di inferenza (non è necessario Ollama) |
| `ritual [repo-path]` | Rituale completo: controllo + blueprint + revisione + catalogo |
| `blueprint [repo-path]` | Genera il pacchetto "Blueprint" dalla decisione più recente |
| `buildpack [repo-path]` | Genera un pacchetto di prompt per i modelli linguistici di conversazione (chat LLM) |
| `verify [repo-path] --artifact <path>` | Verifica l'artefatto rispetto al "blueprint" e al pacchetto di verità |
| `review [repo-path]` | Stampa una scheda di revisione editoriale a 4 sezioni |
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

### Gestione della curatela a livello di organizzazione

| Comando | Cosa fa |
|---------|-------------|
| `season list` | `set` | `status` | `end` | Gestisci le stagioni di curatela |
| `org status` | Copertura, punteggio di diversità, lacune |
| `org ledger [n]` | Ultime N decisioni |
| `org bans` | Attuali blocchi automatici con le relative motivazioni |
| `config get [key]` | Leggi i valori di configurazione |
| `config set <key> <value>` | Imposta la configurazione (ad esempio, `agent_name`) |

### Elaborazione batch e pubblicazione

| Comando | Cosa fa |
|---------|-------------|
| `crawl --org <name>` | Esegui la curatela batch di tutti i repository in un'organizzazione GitHub |
| `crawl --from <file>` | Analizza i repository elencati in un file di testo |
| `publish --pages-repo <o/r>` | Pubblica il catalogo su GitHub Pages |
| `privacy` | Mostra le posizioni di archiviazione e la politica dei dati |
| `reset --org` | `--cache` | `--all` | Elimina i dati archiviati (con conferma) |

### Tracciamento degli artefatti costruiti

| Comando | Cosa fa |
|---------|-------------|
| `built add <repo> <path...>` | Associa i percorsi dei file degli artefatti |
| `built ls [repo-name]` | Elenca lo stato di costruzione |
| `built status <repo-name>` | Tracciamento dettagliato per un singolo repository |

## Opzioni di esecuzione

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

## Opzioni remote

Tutti i comandi principali supportano l'opzione `--remote` per analizzare i repository GitHub senza una copia locale:

```
--remote <owner/repo>  Analyze a GitHub repo without cloning
--ref <branch|tag|sha> Git ref for remote repos (default: default branch)
--remote-refresh       Bypass remote cache, re-fetch all API data
```

I risultati vengono memorizzati nella cache in `~/.artifact/repos/owner/repo/`. Richiede `GITHUB_TOKEN` per i repository privati e limiti di velocità più elevati.

## Modello di minaccia

- **Ollama funziona solo localmente.** Nessun dato lascia il tuo computer. Si connette solo a `localhost`.
- **Nessuna telemetria.** Nessuna analisi. Nessuna trasmissione di dati.
- **Nessuna informazione sensibile.** Non legge, memorizza né trasmette credenziali.
- **La cronologia è locale.** La cartella `.artifact/` si trova nel repository ed è, per convenzione, ignorata da Git.
- **In caso di problemi, il comportamento è deterministico.** Se Ollama non è disponibile, l'output viene generato a partire dai dati del repository: riproducibile, non casuale.
- **Ambito dei file:** legge i file sorgente del repository e scrive solo nelle cartelle `.artifact/` e `~/.artifact/`.

## Variabili d'ambiente

| Variabile | Scopo |
|----------|---------|
| `GITHUB_TOKEN` | Token PAT di GitHub per operazioni remote/di scansione/pubblicazione (5000 richieste/ora rispetto a 60) |
| `OLLAMA_HOST` | Sovrascrive l'endpoint di Ollama (valore predefinito: rilevamento automatico) |
| `ARTIFACT_OLLAMA_MODEL` | Forza l'utilizzo di un modello Ollama specifico |

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
