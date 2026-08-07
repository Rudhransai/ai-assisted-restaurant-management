/**
 * Local model inference via Transformers.js.
 *
 * Hugging Face's hosted Inference API no longer serves the two models Module 5 specifies —
 * requests come back "Model not supported by provider hf-inference". Rather than swap in
 * different models, this runs the real ones on this machine.
 *
 *   Sentiment      Xenova/distilbert-base-uncased-finetuned-sst-2-english
 *   Categorization Xenova/bart-large-mnli  (zero-shot)
 *
 * The Xenova/* repos are the same models converted to ONNX so they run in Node.
 *
 * First call downloads the weights (~65 MB for DistilBERT, ~400 MB for BART quantized) and
 * caches them under node_modules/.cache. That first call is slow — a minute or two — and
 * needs internet. Everything after is local and offline.
 *
 * Enable with AI_MODE=local. Anything else falls back to the keyword classifier.
 */

export function isLocalModelsEnabled(): boolean {
  return process.env.AI_MODE === 'local';
}

/** Transformers.js pipelines are callable objects; `any` keeps this free of its types. */
let sentimentPipeline: any = null;
let zeroShotPipeline: any = null;
let loadFailed = false;

const SENTIMENT_MODEL =
  process.env.LOCAL_SENTIMENT_MODEL || 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
const ZEROSHOT_MODEL = process.env.LOCAL_ZEROSHOT_MODEL || 'Xenova/bart-large-mnli';

const NEUTRAL_BELOW = Number(process.env.HF_NEUTRAL_THRESHOLD) || 0.75;

/**
 * Loaded on first use, not at startup — otherwise every server restart would block on
 * hundreds of megabytes of model weights even when nobody analyses a review.
 */
async function getSentimentPipeline(): Promise<any> {
  if (sentimentPipeline) return sentimentPipeline;
  if (loadFailed) return null;

  try {
    console.log('[LocalModels] Loading DistilBERT (first run downloads the weights)...');
    const { pipeline } = await import('@huggingface/transformers');
    sentimentPipeline = await pipeline('text-classification', SENTIMENT_MODEL);
    console.log('[LocalModels] DistilBERT ready.');
    return sentimentPipeline;
  } catch (err: any) {
    console.error('[LocalModels] Could not load the sentiment model:', err?.message ?? err);
    loadFailed = true;
    return null;
  }
}

async function getZeroShotPipeline(): Promise<any> {
  if (zeroShotPipeline) return zeroShotPipeline;

  try {
    console.log('[LocalModels] Loading bart-large-mnli (this one is large, please wait)...');
    const { pipeline } = await import('@huggingface/transformers');
    zeroShotPipeline = await pipeline('zero-shot-classification', ZEROSHOT_MODEL);
    console.log('[LocalModels] bart-large-mnli ready.');
    return zeroShotPipeline;
  } catch (err: any) {
    console.error('[LocalModels] Could not load the categorization model:', err?.message ?? err);
    return null;
  }
}

export async function analyzeSentimentLocally(
  text: string
): Promise<{ sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; confidence: number } | null> {
  const classify = await getSentimentPipeline();
  if (!classify) return null;

  try {
    const output = await classify(text);
    const top = Array.isArray(output) ? output[0] : output;
    if (!top?.label) return null;

    const score = Number(top.score ?? 0);
    const label = String(top.label).toUpperCase();

    // SST-2 has no neutral class, so a low-confidence answer means "mixed", not "positive".
    if (score < NEUTRAL_BELOW) {
      return { sentiment: 'NEUTRAL', confidence: Number(score.toFixed(4)) };
    }

    return {
      sentiment: label === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE',
      confidence: Number(score.toFixed(4)),
    };
  } catch (err: any) {
    console.error('[LocalModels] Sentiment failed:', err?.message ?? err);
    return null;
  }
}

export async function categorizeReviewLocally(
  text: string,
  candidateLabels: string[],
  minimumScore = Number(process.env.HF_CATEGORY_THRESHOLD) || 0.5
): Promise<string[] | null> {
  if (candidateLabels.length === 0) return null;

  const classify = await getZeroShotPipeline();
  if (!classify) return null;

  try {
    // multi_label because one review usually covers several topics — the spec's own example
    // ("delicious but delivery was slow") should produce both Food and Delivery.
    const output = await classify(text, candidateLabels, { multi_label: true });

    const labels: string[] = output?.labels ?? [];
    const scores: number[] = output?.scores ?? [];
    if (labels.length === 0 || labels.length !== scores.length) return null;

    const matched = labels.filter((_, index) => (scores[index] ?? 0) >= minimumScore);
    return matched.length > 0 ? matched : [labels[0] as string];
  } catch (err: any) {
    console.error('[LocalModels] Categorization failed:', err?.message ?? err);
    return null;
  }
}
