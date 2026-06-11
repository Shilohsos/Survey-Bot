/**
 * Integration hooks for LLM-powered answers, stealth browsing, and auto-withdrawal.
 * Plug into existing bot.ts without rewriting core logic.
 */
import 'dotenv/config';
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { generateAnswer, type AnswerRequest, clearCache as clearLlmCache } from './llmEngine.js';
import { createStealthContext, applyAntiDetection, generateStealthConfig, type StealthConfig } from './stealthManager.js';
import { attemptWithdrawal, checkBalanceEligibility, type WithdrawalResult, type BalanceInfo } from './autoWithdraw.js';
import * as fs from 'fs';

// ─── Proxy Rotation ─────────────────────────────────────────────────

let proxyIndex = -1;
const PROXIES_FILE = '/root/Survey-Bot/proxies.txt';

function getNextProxy(): { server: string; username: string; password: string } | undefined {
  // Use local SOCKS5 bridge → Bright Data residential (avoids SSL issues with direct HTTP proxy)
  const bridgePort = process.env.BRIDGE_LOCAL_PORT || '10801';
  // Bridge is unauthenticated SOCKS5 on localhost
  return { server: `socks5://127.0.0.1:${bridgePort}`, username: '', password: '' };
  
  /* Direct Bright Data HTTP proxy — replaced by SOCKS5 bridge due to SSL/page-render issues
  const bdHost = process.env.PROXY_HOST;
  const bdPort = process.env.PROXY_PORT;
  const bdUser = process.env.PROXY_USER;
  const bdPass = process.env.PROXY_PASS;
  if (bdHost && bdPort && bdUser && bdPass) {
    return { 
      server: `http://${bdHost}:${bdPort}`, 
      username: bdUser, 
      password: bdPass 
    };
  }*/
  // Fallback: rotate through Webshare proxies
  try {
    if (!fs.existsSync(PROXIES_FILE)) return undefined;
    const lines = fs.readFileSync(PROXIES_FILE, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return undefined;
    proxyIndex = (proxyIndex + 1) % lines.length;
    const [host, port, user, pass] = lines[proxyIndex].split(':');
    return { server: `http://${host}:${port}`, username: user, password: pass };
  } catch {
    return undefined;
  }
}

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

  // Use explicit proxy or rotate through Webshare list
  // - undefined: no proxy
  // - empty string '': auto-rotate through available proxies (Bright Data > Webshare)
  // - string with url: use that specific proxy
  const proxy = proxyServer === '' ? getNextProxy() : proxyServer;

  const launchOpts: any = {
    headless,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  };

  if (proxy) {
    if (typeof proxy === 'string') {
      launchOpts.args.push(`--proxy-server=${proxy}`);
      console.log(`[proxy] using provided`);
    } else {
      // Use Playwright's native proxy config (handles auth internally)
      const { username, password, server } = proxy as { server: string; username: string; password: string };
      launchOpts.proxy = { server, username, password };
      console.log(`[proxy] rotating to #${proxyIndex}: ${server}`);
    }
  }

  const browser = await chromium.launch(launchOpts);
  const { context } = await createStealthContext(browser, config);

  // CDP anti-detection (from stealth-scraper-playwright and similar repos)
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: config.userAgent,
      acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
      platform: config.userAgent.includes('Windows') ? 'Win32' : 'MacIntel',
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: config.viewport.width,
      height: config.viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.close();
  } catch (e) {
    console.log('[stealth] CDP override failed, continuing with basic stealth');
  }

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
