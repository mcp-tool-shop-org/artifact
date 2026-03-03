<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Système de prise de décision pour les artefacts de dépôt. Il exécute un processus de vérification de la fraîcheur sur n'importe quel dépôt et génère un paquet de décision structuré, comprenant le niveau, le format, les contraintes, les hooks, les affirmations de vérité avec des références `file:line`.

Le Curator (Ollama local) pilote la prise de décision. Si Ollama n'est pas disponible, un mécanisme de repli déterministe produit une sortie valide en utilisant des profils d'inférence et une rotation basée sur des données initiales.

## Installation

```bash
npm install -g @mcptoolshop/artifact
```

Ou exécution directe :

```bash
npx @mcptoolshop/artifact doctor
```

## Démarrage rapide

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## Commandes

### Fonctionnalités principales

| Commande | Fonctionnement |
|---------|-------------|
| `drive [repo-path]` | Exécuter le processus de vérification de la fraîcheur du Curator |
| `infer [repo-path]` | Calculer le profil d'inférence (Ollama non requis) |
| `ritual [repo-path]` | Rituel complet : vérification + plan + revue + catalogue |
| `blueprint [repo-path]` | Générer un paquet de plan à partir de la dernière décision |
| `buildpack [repo-path]` | Générer un paquet de requête pour les LLM conversationnels |
| `verify [repo-path] --artifact <path>` | Vérifier la conformité de l'artefact par rapport au plan et au regroupement de vérités |
| `review [repo-path]` | Afficher une carte de revue éditoriale en 4 blocs |
| `catalog` | Générer un catalogue de saison |

### Configuration et diagnostic

| Commande | Fonctionnement |
|---------|-------------|
| `doctor` | Vérification de l'état de l'environnement (Node, Ollama, git, configuration) |
| `init` | Configuration initiale — crée la configuration |
| `about` | Version, personnalité active et règles principales |
| `whoami` | Afficher le nom et la devise de la personnalité active |
| `--version` | Afficher la version et quitter |

### Mémoire et historique

| Commande | Fonctionnement |
|---------|-------------|
| `memory show [--org]` | Afficher la mémoire au niveau du dépôt ou de l'organisation |
| `memory forget <name>` | Oublier la mémoire d'un dépôt |
| `memory prune <days>` | Supprimer les entrées plus anciennes que N jours |
| `memory stats` | Statistiques de la mémoire |

### Gestion de la curation à l'échelle de l'organisation

| Commande | Fonctionnement |
|---------|-------------|
| `season list` | `set` | `status` | `end` | Gérer les saisons de curation |
| `org status` | Couverture, score de diversité, lacunes |
| `org ledger [n]` | Dernières N décisions |
| `org bans` | Interdictions automatiques actuelles avec les raisons |
| `config get [key]` | Lire les valeurs de configuration |
| `config set <key> <value>` | Définir la configuration (par exemple, `agent_name`) |

### Traitement par lots et publication

| Commande | Fonctionnement |
|---------|-------------|
| `crawl --org <name>` | Curateur par lots de tous les dépôts d'une organisation GitHub. |
| `crawl --from <file>` | Analyse des dépôts listés dans un fichier texte. |
| `publish --pages-repo <o/r>` | Publication du catalogue sur GitHub Pages. |
| `privacy` | Affichage des emplacements de stockage et de la politique de données. |
| `reset --org\ | --cache\ | --all` | Suppression des données stockées (avec confirmation). |

### Suivi des artefacts de construction

| Commande | Fonctionnement |
|---------|-------------|
| `built add <repo> <path...>` | Association des chemins de fichiers des artefacts. |
| `built ls [repo-name]` | Liste de l'état de construction. |
| `built status <repo-name>` | Suivi détaillé pour un seul dépôt. |

## Options de vérification

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

## Sortie

Écrit `.artifact/decision_packet.json` dans le dépôt cible :

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

## Personnalités

Trois personnalités de curator intégrées. Par défaut : **Glyph**.

| Personnalité | Rôle | Devise |
|---------|------|-------|
| Glyph | design gremlin | No vibes without receipts. |
| Mina | museum curator | Make it specific. Make it collectible. |
| Vera | verification oracle | Truth, but make it pretty. |

```bash
artifact whoami
artifact config set agent_name vera
```

## Options de connexion à distance

Toutes les commandes principales prennent en charge l'option `--remote` pour analyser les dépôts GitHub sans clonage local :

```
--remote <owner/repo>  Analyze a GitHub repo without cloning
--ref <branch|tag|sha> Git ref for remote repos (default: default branch)
--remote-refresh       Bypass remote cache, re-fetch all API data
```

Les résultats sont mis en cache dans `~/.artifact/repos/owner/repo/`. Nécessite `GITHUB_TOKEN` pour les dépôts privés et des limites de débit plus élevées.

## Modèle de menace

- **Ollama est uniquement local.** Aucune donnée ne quitte votre machine. Se connecte uniquement à `localhost`.
- **Pas de télémétrie.** Pas d'analyses. Pas de transmission de données.
- **Pas de secrets.** Ne lit, ne stocke ni ne transmet d'informations d'identification.
- **L'historique est local.** Le dossier `.artifact/` se trouve dans le dépôt et est généralement ignoré par Git.
- **La solution de repli est déterministe.** Si Ollama est indisponible, la sortie est générée à partir des informations du dépôt, ce qui est reproductible et non aléatoire.
- **Portée des fichiers :** lit les fichiers sources du dépôt, écrit uniquement dans les dossiers `.artifact/` et `~/.artifact/`.

## Variables d'environnement

| Variable | Fonction |
|----------|---------|
| `GITHUB_TOKEN` | Clé PAT GitHub pour les opérations à distance/l'analyse/la publication (5000 requêtes/heure contre 60). |
| `OLLAMA_HOST` | Remplacer le point de terminaison Ollama (par défaut : détection automatique) |
| `ARTIFACT_OLLAMA_MODEL` | Forcer un modèle Ollama spécifique |

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
