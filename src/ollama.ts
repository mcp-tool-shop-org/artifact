/**
 * Ollama auto-connect — silent detection, health check, model selection.
 * No config required. Degrades gracefully.
 */

const PROBE_ENDPOINTS = [
  'http://127.0.0.1:11434',
  'http://localhost:11434',
  'http://host.docker.internal:11434',
];

const PROBE_TIMEOUT_MS = 3000;
const GENERATE_TIMEOUT_MS = 60_000;

export interface OllamaConnection {
  host: string;
  model: string;
}

/** Try to reach Ollama at a given host. Returns true if alive. */
async function probe(host: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${host}/api/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Discover a live Ollama host. Returns null if none found. */
async function detectHost(): Promise<string | null> {
  const envHost = process.env['OLLAMA_HOST'];
  if (envHost) {
    const normalized = envHost.startsWith('http') ? envHost : `http://${envHost}`;
    if (await probe(normalized)) return normalized;
  }
  for (const endpoint of PROBE_ENDPOINTS) {
    if (await probe(endpoint)) return endpoint;
  }
  return null;
}

interface OllamaModel {
  name: string;
  size: number;
}

// Models that are code-completion-only or embedding-only — skip these
const SKIP_PATTERNS = [
  'codellama', 'deepseek-coder', 'coder', 'code',
  'embed', 'minilm', 'nomic', 'moondream',
  'translategemma',
];

// Known good general-purpose instruct models, in preference order
const PREFER_PATTERNS = [
  'qwen2.5:14b', 'phi4', 'qwen2.5:7b', 'gemma2',
  'llama3.1', 'mistral', 'deepseek-r1',
  'llama3.2', 'qwen2.5:1.5b',
];

function isSkipped(name: string): boolean {
  return SKIP_PATTERNS.some(p => name.toLowerCase().includes(p));
}

/** Pick the best available model for structured JSON output. */
async function selectModel(host: string): Promise<string | null> {
  const envModel = process.env['ARTIFACT_OLLAMA_MODEL'];
  if (envModel) return envModel;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as { models?: OllamaModel[] };
    const models = data.models ?? [];
    if (models.length === 0) return null;

    // Filter out code/embed models
    const candidates = models.filter(m => !isSkipped(m.name));
    if (candidates.length === 0) return models[0]?.name ?? null;

    // Prefer instruct-tagged models
    const instruct = candidates.find(m => m.name.includes('instruct'));
    if (instruct) return instruct.name;

    // Try known-good patterns in preference order
    for (const pattern of PREFER_PATTERNS) {
      const match = candidates.find(m => m.name.includes(pattern));
      if (match) return match.name;
    }

    // Last resort: largest candidate under 16GB (leave room for KV cache)
    const MAX_SIZE = 16e9;
    const sorted = [...candidates]
      .filter(m => (m.size ?? 0) < MAX_SIZE)
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    return sorted[0]?.name ?? candidates[0]?.name ?? null;
  } catch {
    return null;
  }
}

/** Auto-connect to Ollama. Returns connection info or null. Silent. */
export async function connect(): Promise<OllamaConnection | null> {
  const host = await detectHost();
  if (!host) return null;

  const model = await selectModel(host);
  if (!model) return null;

  return { host, model };
}

/** Send a prompt to Ollama and get the raw text response. */
export async function generate(conn: OllamaConnection, prompt: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GENERATE_TIMEOUT_MS);
    const res = await fetch(`${conn.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: conn.model,
        prompt,
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json() as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}
