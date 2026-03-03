<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

El componente "Curator" (local Ollama) controla el proceso de toma de decisiones. Si Ollama no está disponible, se utiliza un mecanismo de respaldo determinista que genera una salida válida utilizando perfiles de inferencia y rotación.

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
| `drive [repo-path]` | Ejecuta el proceso de verificación de actualización de "Curator". |
| `infer [repo-path]` | Calcula el perfil de inferencia (no se necesita Ollama). |
| `ritual [repo-path]` | Ritual completo: verificación + esquema + revisión + catálogo. |
| `blueprint [repo-path]` | Genera un paquete de esquema a partir de la última decisión. |
| `buildpack [repo-path]` | Genera un paquete de solicitud para modelos de lenguaje (LLM) de tipo chat. |
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
| `memory forget <name>` | Olvidar la memoria de un repositorio. |
| `memory prune <days>` | Elimina las entradas con más de N días de antigüedad. |
| `memory stats` | Estadísticas de la memoria. |

### Curación a nivel de organización

| Comando | ¿Qué hace? |
|---------|-------------|
| `season list` | `set` | `status` | `end` | Administra las temporadas de curación. |
| `org status` | Cobertura, puntaje de diversidad, lagunas. |
| `org ledger [n]` | Últimas N decisiones. |
| `org bans` | Prohibiciones automáticas actuales con sus razones. |
| `config get [key]` | Lee los valores de configuración. |
| `config set <key> <value>` | Establece la configuración (por ejemplo, `agent_name`). |

### Procesamiento por lotes y publicación

| Comando | ¿Qué hace? |
|---------|-------------|
| `crawl --org <name>` | Realiza la curación por lotes de todos los repositorios en una organización de GitHub. |
| `crawl --from <file>` | Explora los repositorios listados en un archivo de texto. |
| `publish --pages-repo <o/r>` | Publica el catálogo en GitHub Pages. |
| `privacy` | Muestra las ubicaciones de almacenamiento y la política de datos. |
| `reset --org` | `--cache` | `--all` | Elimina los datos almacenados (con confirmación). |

### Seguimiento de artefactos construidos

| Comando | ¿Qué hace? |
|---------|-------------|
| `built add <repo> <path...>` | Asocia rutas de archivo de artefactos. |
| `built ls [repo-name]` | Lista el estado de construcción. |
| `built status <repo-name>` | Seguimiento detallado para un repositorio. |

## Opciones de ejecución

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
| Glyph | design gremlin | No hay vibraciones sin recibos. |
| Mina | curador de museo | Hazlo específico. Hazlo coleccionable. |
| Vera | oráculo de verificación | Verdad, pero que sea atractiva. |

```bash
artifact whoami
artifact config set agent_name vera
```

## Opciones remotas

Todos los comandos principales admiten `--remote` para analizar repositorios de GitHub sin una clonación local:

```
--remote <owner/repo>  Analyze a GitHub repo without cloning
--ref <branch|tag|sha> Git ref for remote repos (default: default branch)
--remote-refresh       Bypass remote cache, re-fetch all API data
```

Los resultados se almacenan en caché en `~/.artifact/repos/owner/repo/`. Requiere `GITHUB_TOKEN` para repositorios privados y límites de velocidad más altos.

## Modelo de amenazas

- **Ollama funciona solo localmente.** Ningún dato sale de su máquina. Se conecta únicamente a `localhost`.
- **Sin telemetría.** Sin análisis. Sin envío de datos.
- **Sin secretos.** No lee, almacena ni transmite credenciales.
- **El historial es local.** La carpeta `.artifact/` se encuentra en el repositorio y, por convención, se ignora en Git.
- **La opción de respaldo es determinista.** Si Ollama no está disponible, la salida se genera a partir de señales del repositorio, lo que la hace reproducible y no aleatoria.
- **Ámbito de los archivos:** Lee los archivos fuente del repositorio y solo escribe en las carpetas `.artifact/` y `~/.artifact/`.

## Variables de entorno

| Variable | Propósito |
|----------|---------|
| `GITHUB_TOKEN` | Clave de acceso personal de GitHub para operaciones remotas, búsqueda y publicación (5000 solicitudes/hora frente a 60). |
| `OLLAMA_HOST` | Permite sobrescribir el punto de acceso de Ollama (por defecto: detección automática). |
| `ARTIFACT_OLLAMA_MODEL` | Fuerza el uso de un modelo específico de Ollama. |

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
