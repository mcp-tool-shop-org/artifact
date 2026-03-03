<p align="center">
  <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.ja.md">日本語</a> | <a href="README.pt-BR.md">Português (BR)</a> | <a href="README.zh.md">中文</a>
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

Sistema de toma de decisiones para artefactos de repositorio. Ejecuta un proceso de verificación de actualización en cualquier repositorio y genera un paquete de decisiones estructurado: nivel, formato, restricciones, ganchos, afirmaciones de verdad con referencias `archivo:línea`.

El "Curador" (Ollama local) controla el proceso de toma de decisiones. Si Ollama no está disponible, un mecanismo de respaldo determinista genera una salida válida utilizando perfiles de inferencia y rotación predefinida.

## Instalación

```bash
npm install -g @mcptoolshop/artifact
```

O ejecute directamente:

```bash
npx @mcptoolshop/artifact doctor
```

## Guía de inicio rápido

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

| Comando | ¿Qué hace? |
|---------|-------------|
| `drive [repo-path]` | Ejecuta el proceso de verificación de actualización del "Curador". |
| `infer [repo-path]` | Calcula el perfil de inferencia (no se necesita Ollama). |
| `ritual [repo-path]` | Ritual completo: verificación + esquema + revisión + catálogo. |
| `blueprint [repo-path]` | Genera un paquete de esquema a partir de la última decisión. |
| `buildpack [repo-path]` | Genera un paquete de solicitud para modelos de lenguaje grandes (LLM) para chat. |
| `verify [repo-path] --artifact <path>` | Verifica un artefacto según el esquema y el conjunto de afirmaciones de verdad. |
| `review [repo-path]` | Imprime una tarjeta de revisión editorial de 4 secciones. |
| `catalog` | Genera un catálogo de la temporada. |

### Configuración y diagnóstico

| Comando | ¿Qué hace? |
|---------|-------------|
| `doctor` | Verificación del estado del entorno (Node, Ollama, git, configuración). |
| `init` | Configuración inicial: crea la configuración. |
| `about` | Versión, personalidad activa y reglas principales. |
| `whoami` | Imprime el nombre y el lema de la personalidad activa. |
| `--version` | Imprime la versión y sale. |

### Memoria e historial

| Comando | ¿Qué hace? |
|---------|-------------|
| `memory show [--org]` | Muestra la memoria a nivel de repositorio u organización. |
| `memory forget <name>` | Borra la memoria de un repositorio. |
| `memory prune <days>` | Elimina las entradas con más de N días de antigüedad. |
| `memory stats` | Estadísticas de la memoria. |

### Curación a nivel de organización

| Comando | ¿Qué hace? |
|---------|-------------|
| `season list` | `set` | `status` | `end` | Administra las temporadas de curación. |
| `org status` | Cobertura, puntaje de diversidad, lagunas. |
| `org ledger [n]` | Últimas N decisiones. |
| `org bans` | Prohibiciones automáticas actuales con sus razones. |
| `config get [key]` | Lee los valores de la configuración. |
| `config set <key> <value>` | Establece la configuración (por ejemplo, `agent_name`). |

## Opciones de verificación

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

## Salida

Escribe `.artifact/decision_packet.json` en el repositorio de destino:

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

## Personalidades

Tres personalidades de curador predefinidas. La predeterminada es: **Glyph**.

| Personalidad | Rol | Lema |
|---------|------|-------|
| Glyph | Diseñador travieso | Sin pruebas, no hay resultados. |
| Mina | Curador de museo | Hazlo específico. Hazlo coleccionable. |
| Vera | Oráculo de verificación | Verdad, pero que sea atractiva. |

```bash
artifact whoami
artifact config set agent_name vera
```

## Modelo de amenazas

- **Ollama es solo local.** Ningún dato sale de tu máquina. Se conecta solo a `localhost`.
- **Sin telemetría.** No hay llamadas de red excepto a Ollama local.
- **Sin secretos.** No lee, almacena ni transmite credenciales.
- **El historial es local.** `.artifact/` reside en el repositorio y está ignorado por Git por convención.
- **El mecanismo de respaldo es determinista.** Si Ollama no está disponible, la salida se genera a partir de señales del repositorio: reproducible, no aleatoria.
- **Ámbito de archivo:** lee los archivos de origen del repositorio y solo escribe en `.artifact/` y `~/.artifact/`.

## Variables de entorno

| Variable | Propósito |
|----------|---------|
| `OLLAMA_HOST` | Anula el punto de conexión de Ollama (por defecto: detección automática). |
| `ARTIFACT_OLLAMA_MODEL` | Fuerza el uso de un modelo específico de Ollama. |

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
