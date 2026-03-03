/**
 * Ollama embedding client for semantic memory search.
 * Uses all-minilm or nomic-embed-text — both already installed locally.
 * Falls back to keyword matching if embeddings unavailable.
 */

const EMBED_TIMEOUT_MS = 10_000;

// Preferred embedding models (tiny, fast, local)
const EMBED_MODEL_PREFS = ['all-minilm', 'nomic-embed-text'];

/** Compute cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Find the best available embedding model */
export async function findEmbedModel(host: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = data.models ?? [];

    for (const pref of EMBED_MODEL_PREFS) {
      const match = models.find(m => m.name.includes(pref));
      if (match) return match.name;
    }
    return null;
  } catch {
    return null;
  }
}

/** Get embedding vector for a text string */
export async function embed(host: string, model: string, text: string): Promise<number[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT_MS);
    const res = await fetch(`${host}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

/** Batch embed multiple texts (sequential to avoid overloading) */
export async function embedBatch(host: string, model: string, texts: string[]): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = [];
  for (const text of texts) {
    results.push(await embed(host, model, text));
  }
  return results;
}

/**
 * Simple keyword-based similarity fallback (BM25-ish).
 * Splits texts into word sets and computes Jaccard overlap.
 */
export function keywordSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / (wordsA.size + wordsB.size - intersection);
}
