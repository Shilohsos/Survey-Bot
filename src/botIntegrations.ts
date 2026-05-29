/**
 * Integration hooks for LLM-powered answers, stealth browsing, and auto-withdrawal.
 * Plug into existing bot.ts without rewriting core logic.
 */
import 'dotenv/config';
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { generateAnswer, type AnswerRequest, clearCache as clearLlmCache } from './llmEngine.js';
import { createStealthContext, applyAntiDetection, generateStealthConfig, type StealthConfig } from './stealthManager.js';
import { attemptWithdrawal, checkBalanceEligibility, type WithdrawalResult, type BalanceInfo } from './autoWithdraw.js';

// ─── Stealth Browser Launcher ────────────────────────────────────────

export interface StealthSession {
  browser: Browser;
  context: BrowserContext;
  config: StealthConfig;
}

/**
 * Launch a browser with full stealth configuration.
 * Use this instead of raw chromium.launch() for all survey operations.
 */
export async function launchStealthBrowser(
  headless: boolean = true,
  proxyServer?: string
): Promise<StealthSession> {
  const config = generateStealthConfig();

  const launchOpts: any = {
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  };

  if (proxyServer) {
    launchOpts.proxy = { server: proxyServer };
  }

  const browser = await chromium.launch(launchOpts);
  const { context } = await createStealthContext(browser, config);

  return { browser, context, config };
}

/**
 * Apply stealth and anti-detection to an existing page.
 */
export function applyStealthToPage(page: Page): void {
  applyAntiDetection(page);
}

// ─── LLM-Powered Answer Generation (Plugs into existing flows) ───────

/**
 * Generate an answer for a qualification/onboarding question.
 * Supports radio, checkbox, text, and select inputs.
 * Returns the answer text that should be selected/typed.
 */
export async function answerQuestion(request: AnswerRequest): Promise<string> {
  const result = await generateAnswer(request);
  return result.answer;
}

/**
 * Pick the best matching option from a list using LLM.
 * Used for radio/checkbox/dropdown questions during surveys.
 */
export async function pickBestOption(
  questionText: string,
  options: string[],
  context?: string
): Promise<string> {
  const result = await generateAnswer({
    questionText,
    options,
    inputType: 'radio',
    context,
    maxTokens: 30,
  });
  return result.answer;
}

/**
 * Generate a short text answer for text input fields.
 */
export async function generateTextAnswer(questionText?: string, context?: string): Promise<string> {
  const result = await generateAnswer({
    questionText,
    inputType: 'text',
    context,
    maxTokens: 20,
  });
  return result.answer;
}

// ─── Auto-Withdrawal Hook ────────────────────────────────────────────

/**
 * Check balance and trigger withdrawal if eligible.
 * Call this after each successful survey completion.
 */
export async function checkAndWithdraw(
  authToken: string,
  savedCookies: any[],
  savedLocalStorage: Record<string, string>,
  savedSessionStorage: Record<string, string>,
  balance: number,
  onResult?: (result: WithdrawalResult) => Promise<void>
): Promise<WithdrawalResult | null> {
  const eligibility = checkBalanceEligibility(balance);
  
  if (!eligibility.canWithdraw) {
    return null;
  }

  console.log(`[withdraw] balance €${balance} >= threshold. Attempting withdrawal...`);
  
  const result = await attemptWithdrawal(
    authToken,
    savedCookies,
    savedLocalStorage,
    savedSessionStorage
  );

  if (onResult) {
    await onResult(result);
  }

  return result;
}

/**
 * Get withdrawal eligibility info.
 */
export function getWithdrawalInfo(balance: number, available?: number): BalanceInfo {
  return checkBalanceEligibility(balance, available);
}

// ─── Utility ─────────────────────────────────────────────────────────

/**
 * Clear all LLM answer caches.
 */
export function clearAnswerCache(): void {
  clearLlmCache();
}
