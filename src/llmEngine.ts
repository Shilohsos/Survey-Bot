import OpenAI from 'openai';
import 'dotenv/config';

// ─── DeepSeek Client ─────────────────────────────────────────────────

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
});

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// ─── Answer Cache ────────────────────────────────────────────────────
// Cache identical questions to save tokens and reduce latency
const answerCache = new Map<string, { answer: string; expiresAt: number }>();
const CACHE_TTL_MS = 3600_000; // 1 hour

// ─── System Prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a survey respondent answering market research questions.
Your persona: male, 35-44, university-educated (bac+5), employed full-time in IT/technology,
married with 2 children, homeowner, middle-income (€50k-€75k), living in France,
fluent in French and English.

Rules:
- Answer concisely. One word or short phrase when possible.
- For Likert/rating scales (1-5, 1-10): choose mid-to-high values (3-5 or 7-10).
- For multiple choice: pick the option most consistent with the persona above.
- For text fields: 1-3 words, factual, neutral.
- For checkbox/select-all: select 1-3 options that fit.
- NEVER explain your reasoning — just return the answer text.
- Match the language of the question (French or English).
- If the question is about interests/hobbies, pick from: technology, travel, football, cinema, reading, cooking.
- If about brands, prefer well-known global brands.
- If about frequency, choose: weekly, monthly, or occasionally.
- If about satisfaction, choose: satisfied or very satisfied.`;

// ─── Answer Generation ───────────────────────────────────────────────

export interface AnswerRequest {
  questionText?: string;       // The question being asked
  options?: string[];          // Available choices (for radio/checkbox/dropdown)
  inputType: 'radio' | 'checkbox' | 'select' | 'text' | 'rating' | 'unknown';
  context?: string;            // Extra context (page title, survey topic)
  maxTokens?: number;
}

export interface AnswerResult {
  answer: string;
  source: 'llm' | 'cache' | 'fallback';
  tokensUsed?: number;
  latencyMs?: number;
}

/**
 * Generate a context-aware survey answer using DeepSeek.
 * Returns cached result if identical question was asked recently.
 */
export async function generateAnswer(req: AnswerRequest): Promise<AnswerResult> {
  const cacheKey = `${req.inputType}|${req.questionText || ''}|${(req.options || []).join('|')}`;

  // Check cache
  const cached = answerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { answer: cached.answer, source: 'cache' };
  }

  // Build prompt based on input type
  let userPrompt = '';

  if (req.questionText) {
    userPrompt += `Question: "${req.questionText}"\n`;
    if (req.context) userPrompt += `Context: ${req.context}\n`;
  }

  if (req.options && req.options.length > 0) {
    userPrompt += `Options:\n${req.options.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}\n`;
    userPrompt += 'Respond with the exact text of your chosen option, nothing else.';
  } else if (req.inputType === 'text') {
    userPrompt += 'Provide a short text answer (1-5 words).';
  } else if (req.inputType === 'rating') {
    userPrompt += 'Provide a number rating.';
  } else {
    userPrompt += 'Provide your answer.';
  }

  const startTime = Date.now();

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: req.maxTokens || 50,
    });

    const latencyMs = Date.now() - startTime;
    const answer = (completion.choices?.[0]?.message?.content || '').trim();
    const tokensUsed = completion.usage?.total_tokens || 0;

    // Cache result
    if (answer && answer.length > 0 && answer.length < 200) {
      answerCache.set(cacheKey, { answer, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return { answer, source: 'llm', tokensUsed, latencyMs };
  } catch (err: any) {
    console.error(`[llmEngine] API error: ${err.message}`);
    // Fallback: return a generic safe answer
    const fallback = getFallbackAnswer(req);
    return { answer: fallback, source: 'fallback' };
  }
}

/**
 * Fallback answers when LLM is unavailable
 */
function getFallbackAnswer(req: AnswerRequest): string {
  if (req.options && req.options.length > 0) {
    return req.options[Math.floor(Math.random() * req.options.length)];
  }
  if (req.inputType === 'text') {
    const texts = ['Yes', 'No', 'Weekly', 'Often', 'Good', 'Average'];
    return texts[Math.floor(Math.random() * texts.length)];
  }
  if (req.inputType === 'rating') {
    return String(Math.floor(Math.random() * 3) + 3); // 3-5
  }
  return 'Yes';
}

/**
 * Generate answers for multiple questions in batch (qualification page)
 */
export async function generateBatchAnswers(
  questions: AnswerRequest[]
): Promise<AnswerResult[]> {
  return Promise.all(questions.map(q => generateAnswer(q)));
}

// ─── Stats ───────────────────────────────────────────────────────────

export function getCacheSize(): number {
  return answerCache.size;
}

export function clearCache(): void {
  answerCache.clear();
}
