/**
 * Hugging Face Inference API — the two models Module 5 specifies.
 *
 *   Sentiment      distilbert-base-uncased-finetuned-sst-2-english
 *   Categorization facebook/bart-large-mnli  (zero-shot)
 *
 * Both are optional. Without HUGGINGFACE_API_KEY the caller falls back to the keyword
 * classifier, so the app runs the same offline — it is simply less accurate.
 *
 * Get a free token at https://huggingface.co/settings/tokens (read access is enough).
 */

/**
 * Hugging Face retired `api-inference.huggingface.co` — it no longer resolves at all,
 * so calls fail with ENOTFOUND rather than a helpful HTTP error. The replacement is the
 * router endpoint below. Overridable in case they move it again.
 */
const HF_BASE = process.env.HF_API_BASE || 'https://router.huggingface.co/hf-inference/models';

const SENTIMENT_MODEL =
  process.env.HF_SENTIMENT_MODEL || 'distilbert-base-uncased-finetuned-sst-2-english';
const ZEROSHOT_MODEL = process.env.HF_ZEROSHOT_MODEL || 'facebook/bart-large-mnli';

/**
 * SST-2 only ever answers POSITIVE or NEGATIVE — it has no neutral class. A mixed review
 * ("great food but slow service") therefore comes back as a low-confidence POSITIVE or
 * NEGATIVE. Anything under this score is treated as NEUTRAL, which is what the spec's own
 * example expects.
 */
const NEUTRAL_BELOW = Number(process.env.HF_NEUTRAL_THRESHOLD) || 0.75;

export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export function isHuggingFaceConfigured(): boolean {
  return Boolean(process.env.HUGGINGFACE_API_KEY);
}

async function callHuggingFace(model: string, body: unknown): Promise<any | null> {
  const token = process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${HF_BASE}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // wait_for_model keeps the request open while a cold model loads instead of
      // returning 503 — these models can take ~20s on the first call of the day.
      body: JSON.stringify({ ...(body as object), options: { wait_for_model: true } }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[HuggingFace] ${model} returned ${response.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    return await response.json();
  } catch (err: any) {
    const message = err?.name === 'AbortError' ? 'timed out after 30s' : err?.message ?? String(err);
    console.warn(`[HuggingFace] ${model} failed: ${message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns null when the model is unavailable, so the caller can fall back rather than
 * storing a wrong result.
 */
export async function analyzeSentimentWithModel(
  text: string
): Promise<{ sentiment: Sentiment; confidence: number } | null> {
  const data = await callHuggingFace(SENTIMENT_MODEL, { inputs: text });
  if (!data) return null;

  // Response shape: [[{label, score}, {label, score}]] — occasionally unnested.
  const scores = Array.isArray(data?.[0]) ? data[0] : data;
  if (!Array.isArray(scores) || scores.length === 0) return null;

  const top = scores.reduce((best: any, current: any) =>
    (current?.score ?? 0) > (best?.score ?? 0) ? current : best
  );

  const label = String(top?.label ?? '').toUpperCase();
  const score = Number(top?.score ?? 0);
  if (!label || !Number.isFinite(score)) return null;

  if (score < NEUTRAL_BELOW) {
    return { sentiment: 'NEUTRAL', confidence: Number(score.toFixed(4)) };
  }

  return {
    sentiment: label === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE',
    confidence: Number(score.toFixed(4)),
  };
}

/**
 * Zero-shot categorization. The candidate labels are passed in rather than hardcoded so
 * they stay in step with whatever categories the feedback module actually stores.
 *
 * multi_label is on because one review commonly covers several topics — the spec's own
 * example ("delicious but delivery was slow") is meant to produce Food *and* Delivery.
 */
export async function categorizeReviewWithModel(
  text: string,
  candidateLabels: string[],
  minimumScore = Number(process.env.HF_CATEGORY_THRESHOLD) || 0.5
): Promise<string[] | null> {
  if (candidateLabels.length === 0) return null;

  const data = await callHuggingFace(ZEROSHOT_MODEL, {
    inputs: text,
    parameters: { candidate_labels: candidateLabels, multi_label: true },
  });
  if (!data) return null;

  const labels: string[] = data?.labels ?? [];
  const scores: number[] = data?.scores ?? [];
  if (labels.length === 0 || labels.length !== scores.length) return null;

  const matched = labels.filter((_, index) => (scores[index] ?? 0) >= minimumScore);

  // Never return nothing: if no label clears the bar, keep the single best one.
  return matched.length > 0 ? matched : [labels[0] as string];
}
