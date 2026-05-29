import { chromium, type Browser, type Page } from 'playwright';
import { getAvailableSurveys, getSurveyLink, claimReward, login as tsLogin } from './topsurveys.js';
import { generateAnswer, type AnswerRequest } from './src/llmEngine.js';

const PROXY = process.env.PROXY || '';
const PROXY_USER = process.env.PROXY_USER || '';
const PROXY_PASS = process.env.PROXY_PASS || '';

type ProgressCb = (text: string) => Promise<void>;
type SurveyCb = (survey: any) => Promise<void>;
type EarnedCb = (amount: string) => Promise<void>;
type ErrorCb = (error: string) => Promise<void>;

let browser: Browser | null = null;
let running = false;

let onProgress: ProgressCb = async () => {};
let onSurveyFound: SurveyCb = async () => {};
let onEarned: EarnedCb = async () => {};
let onError: ErrorCb = async () => {};

// ─── LLM Answer Cache (for this session only) ────────────────────────

const answerCache = new Map<string, string>();

function getCachedAnswer(key: string): string | undefined {
  return answerCache.get(key);
}

function setCachedAnswer(key: string, answer: string): void {
  answerCache.set(key, answer);
  // Keep cache limited
  if (answerCache.size > 500) {
    const firstKey = answerCache.keys().next().value;
    if (firstKey) answerCache.delete(firstKey);
  }
}

function buildProxyConfig() {
  if (!PROXY) return undefined;

  // Parse socks5://user:pass@host:port or socks5://host:port
  let proxyUrl = PROXY;
  if (PROXY_USER && PROXY_PASS) {
    proxyUrl = PROXY.replace('://', `://${PROXY_USER}:${PROXY_PASS}@`);
  }

  return { server: proxyUrl };
}

async function loginToDashboard(context: any, email: string, password: string, authToken: string) {
  // Set the auth-token cookie directly so we're logged in immediately
  await context.addCookies([
    { name: 'auth-token', value: authToken, domain: '.topsurveys.app', path: '/' },
    { name: 'localization', value: 'fr-fr', domain: '.topsurveys.app', path: '/' },
  ]);

  // Navigate to dashboard to verify
  const page = await context.newPage();
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const url = page.url();
  await page.close();

  if (url.includes('app-login') || url.includes('signin')) {
    throw new Error('Login cookie failed — need to re-login via browser');
  }

  return true;
}

async function waitForSurveyPage(page: Page): Promise<boolean> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(5000);
    return true;
  } catch {
    return false;
  }
}

export const surveyor = {
  onProgress(cb: ProgressCb) { onProgress = cb; },
  onSurveyFound(cb: SurveyCb) { onSurveyFound = cb; },
  onEarned(cb: EarnedCb) { onEarned = cb; },
  onError(cb: ErrorCb) { onError = cb; },

  async start(authToken: string) {
    if (running) throw new Error('Already running');
    running = true;

    const email = process.env.TS_EMAIL || '';
    const password = process.env.TS_PASSWORD || '';

    try {
      await onProgress('🔍 Scanning for available surveys...');

      // Initial survey scan via API
      const initialSurveys = await getAvailableSurveys(authToken);
      if (initialSurveys.length === 0) {
        await onProgress('⏳ No surveys available. Waiting for new ones...');
      }

      await onProgress('🌐 Launching browser...');
      const proxyConfig = buildProxyConfig();
      const launchOptions: any = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      if (proxyConfig) launchOptions.proxy = proxyConfig;

      browser = await chromium.launch(launchOptions);

      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'fr-FR',
      });

      // Log into TopSurveys in the browser
      await onProgress('🔑 Logging into TopSurveys...');
      try {
        await loginToDashboard(context, email, password, authToken);
        await onProgress('✅ Logged into TopSurveys dashboard');
      } catch (loginErr: any) {
        throw new Error(`Browser login failed: ${loginErr.message}`);
      }

      // Main loop
      let consecutiveErrors = 0;

      while (running) {
        try {
          const available = await getAvailableSurveys(authToken);

          if (available.length === 0) {
            await onProgress(`⏳ No surveys. Next check in 30s...`);
            await sleep(30_000);
            consecutiveErrors = 0;
            continue;
          }

          // Process each survey
          for (const survey of available) {
            if (!running) break;

            await onSurveyFound(survey);
            await onProgress(`📋 Survey: ${survey.title || survey.name}\n💰 ${survey.reward}\n▶️ Opening...`);

            try {
              const surveyUrl = await getSurveyLink(authToken, survey.id || survey.survey_id);

              if (surveyUrl) {
                const page = await context.newPage();

                // Navigate to survey
                await page.goto(surveyUrl, { waitUntil: 'networkidle', timeout: 60_000 });
                await onProgress(`📋 Survey: ${survey.title || survey.name}\n⏳ Completing survey...`);

                // Attempt to complete the survey with LLM-powered answers
                const completed = await attemptSurveyWithLLM(page);

                if (completed) {
                  await page.close();
                  // Claim reward via API
                  try {
                    await claimReward(authToken, survey.id || survey.survey_id);
                    await onEarned(`${survey.reward}`);
                    await onProgress(`✅ Survey complete! +${survey.reward}`);
                    consecutiveErrors = 0;
                  } catch (claimErr: any) {
                    await onError(`Survey done but claim failed: ${claimErr.message}`);
                  }
                } else {
                  await page.close();
                  await onProgress(`❌ Survey ${survey.title || survey.name} — incomplete or screened out`);
                  consecutiveErrors++;
                }
              } else {
                await onProgress(`❌ Survey ${survey.title || survey.name} — no survey URL`);
                consecutiveErrors++;
              }
            } catch (surveyErr: any) {
              await onError(`Survey error: ${surveyErr.message}`);
              consecutiveErrors++;
            }

            // Brief pause between surveys
            await sleep(5_000);

            if (consecutiveErrors >= 5) {
              await onProgress('❌ Too many consecutive errors. Stopping.');
              break;
            }
          }

          consecutiveErrors = 0;
          await onProgress(`✅ Batch done. Next check in 30s...`);
          await sleep(30_000);

        } catch (scanErr: any) {
          consecutiveErrors++;
          await onError(`Scan error: ${scanErr.message}`);

          if (consecutiveErrors >= 5) {
            await onProgress('❌ Too many errors. Stopping.');
            break;
          }
          await sleep(30_000);
        }
      }
    } finally {
      running = false;
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }
    }
  },

  async stop() {
    running = false;
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  },
};

// ─── LLM-Powered Survey Completion ──────────────────────────────────

async function attemptSurveyWithLLM(page: Page): Promise<boolean> {
  try {
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    // Maximum time to spend on one survey
    const startTime = Date.now();
    const maxDuration = 5 * 60 * 1000; // 5 minutes

    let questionsAnswered = 0;
    let screensPassed = 0;

    while (Date.now() - startTime < maxDuration) {
      const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');

      // Completion check
      const completionIndicators = [
        'thank you', 'completed', 'finished', 'survey complete',
        'you have completed', 'congratulations', 'submitted',
        'your response', 'recorded', 'success',
      ];
      if (completionIndicators.some(ind => bodyText.includes(ind))) {
        await page.waitForTimeout(2_000);
        return questionsAnswered > 0;
      }

      // Screening check
      const terminationIndicators = [
        'not qualify', 'screened out', 'over quota', 'quota full',
        'not match', 'does not match', 'unfortunately', 'we are sorry',
        'terminated', 'disqualified',
      ];
      if (terminationIndicators.some(ind => bodyText.includes(ind))) {
        return false;
      }

      // LLM-powered interaction
      const interacted = await interactWithPageLLM(page);
      if (interacted) {
        questionsAnswered++;
        screensPassed = 0;
        await page.waitForTimeout(1_000 + Math.random() * 2_000);
      } else {
        screensPassed++;
        if (screensPassed > 5) {
          const clicked = await tryClickContinue(page);
          if (!clicked) {
            await page.waitForTimeout(3_000);
            screensPassed = 0;
          }
        } else {
          await page.waitForTimeout(2_000);
        }
      }
    }

    return questionsAnswered > 0;
  } catch {
    return false;
  }
}

// ─── LLM-Powered Page Interaction ───────────────────────────────────

/**
 * Uses DeepSeek LLM to intelligently answer survey questions instead of random selection.
 * Caches answers to avoid redundant API calls for identical questions.
 */
async function interactWithPageLLM(page: Page): Promise<boolean> {
  try {
    // Extract the visible question text and options from the page
    const pageData = await page.evaluate(() => {
      // Get the main question text (look for headings, labels, etc.)
      const questionEls = document.querySelectorAll('h1, h2, h3, h4, .question-text, [class*="question"], .title, [class*="title"], legend, .heading');
      let questionText = '';
      for (const el of questionEls) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text && text.length > 5 && text.length < 500) {
          questionText = text;
          break;
        }
      }

      // Fallback: use page title or first significant text block
      if (!questionText) {
        const body = document.body?.innerText || '';
        const firstLines = body.split('\n').filter(l => l.trim().length > 10);
        questionText = firstLines[0] || '';
      }

      // Get all visible interactive elements with their text
      const elements: { tag: string; type: string; text: string; value?: string }[] = [];

      // Radio buttons
      document.querySelectorAll('input[type="radio"]').forEach(el => {
        const parent = el.parentElement;
        const text = parent ? (parent.textContent || '').trim() : (el as HTMLInputElement).value || '';
        if (text) elements.push({ tag: 'input', type: 'radio', text });
      });

      // Checkboxes
      document.querySelectorAll('input[type="checkbox"]').forEach(el => {
        const parent = el.parentElement;
        const text = parent ? (parent.textContent || '').trim() : (el as HTMLInputElement).value || '';
        if (text) elements.push({ tag: 'input', type: 'checkbox', text });
      });

      // If no radio/checkbox found, look for styled choice elements
      if (elements.length === 0) {
        document.querySelectorAll('.choice-item, .option-item, [class*="option"], [class*="choice"], label, .item, [role="radio"], [role="checkbox"], [role="option"]').forEach(el => {
          const text = (el.textContent || '').trim();
          const style = window.getComputedStyle(el);
          if (text && text.length < 200 && style.display !== 'none' && style.visibility !== 'hidden') {
            elements.push({ tag: el.tagName.toLowerCase(), type: 'choice', text });
          }
        });
      }

      // Dropdown selects
      const selects = document.querySelectorAll('select');
      const selectOptions: { text: string; value: string }[] = [];
      selects.forEach(sel => {
        const opts = sel.querySelectorAll('option');
        opts.forEach(opt => {
          const text = (opt.textContent || '').trim();
          const value = opt.getAttribute('value') || '';
          if (text) selectOptions.push({ text, value });
        });
      });

      // Text inputs (if visible)
      const textInputs = document.querySelectorAll('input[type="text"], input:not([type]):not([type="hidden"]), textarea');
      const hasTextInput = textInputs.length > 0;

      // Rating/slider
      const ratingInputs = document.querySelectorAll('input[type="range"]');
      const hasRating = ratingInputs.length > 0;

      // Star ratings
      const stars = document.querySelectorAll('.star, [class*="star"], .rating-item');
      const hasStars = stars.length > 0;

      return {
        questionText: questionText.substring(0, 500),
        options: elements.map(e => e.text).filter(t => t.length > 0),
        selectOptions: selectOptions.map(o => o.text),
        hasTextInput,
        hasRating,
        hasStars,
        elements, // Full element data for interaction
        selectElements: selects.length,
      };
    });

    // ── Handle different question types ──────────────────────────────

    // Type 1: Radio/Choice options
    if (pageData.options.length > 0) {
      const cacheKey = `choice|${pageData.questionText.substring(0, 100)}|${pageData.options.join(',')}`;
      let chosenAnswer = getCachedAnswer(cacheKey);

      if (!chosenAnswer) {
        // Ask LLM to pick the best option
        const result = await generateAnswer({
          questionText: pageData.questionText,
          options: pageData.options,
          inputType: 'radio',
          maxTokens: 30,
        });
        chosenAnswer = result.answer;
        setCachedAnswer(cacheKey, chosenAnswer);
      }

      // Click the chosen option by matching text
      const clicked = await page.evaluate(({ answer, elements }) => {
        const ans = answer.toLowerCase();
        for (const el of elements) {
          if (el.text.toLowerCase() === ans || el.text.toLowerCase().includes(ans) || ans.includes(el.text.toLowerCase())) {
            // Try different click strategies
            const selector = el.type === 'radio' || el.type === 'checkbox'
              ? `input[type="${el.type}"][value="${el.text}"]`
              : null;

            if (selector) {
              const input = document.querySelector(selector) as HTMLElement;
              if (input) { input.click(); return true; }
            }

            // Fallback: find element by text
            const all = document.querySelectorAll('label, .choice-item, .option-item, [class*="option"], [class*="choice"], [role="radio"], [role="checkbox"], [role="option"]');
            for (const el2 of all) {
              if ((el2.textContent || '').trim() === el.text) {
                (el2 as HTMLElement).click();
                return true;
              }
            }
          }
        }
        return false;
      }, { answer: chosenAnswer, elements: pageData.elements });

      return clicked;
    }

    // Type 2: Dropdown/Select
    if (pageData.selectOptions.length > 0) {
      const cacheKey = `select|${pageData.questionText.substring(0, 100)}|${pageData.selectOptions.join(',')}`;
      let chosenAnswer = getCachedAnswer(cacheKey);

      if (!chosenAnswer) {
        const result = await generateAnswer({
          questionText: pageData.questionText,
          options: pageData.selectOptions,
          inputType: 'select',
          maxTokens: 20,
        });
        chosenAnswer = result.answer;
        setCachedAnswer(cacheKey, chosenAnswer);
      }

      // Select the option by matching text
      const selected = await page.evaluate((answer: string) => {
        const selects = document.querySelectorAll('select');
        if (selects.length === 0) return false;
        const select = selects[0];
        const options = select.querySelectorAll('option');
        const ans = answer.toLowerCase();
        for (let i = 0; i < options.length; i++) {
          const text = (options[i].textContent || '').trim().toLowerCase();
          if (text === ans || text.includes(ans) || ans.includes(text)) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        // Fallback: pick second option (skip placeholder)
        if (options.length > 1) {
          select.selectedIndex = 1;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, chosenAnswer);

      return selected;
    }

    // Type 3: Text input
    if (pageData.hasTextInput) {
      const cacheKey = `text|${pageData.questionText.substring(0, 100)}`;
      let answer = getCachedAnswer(cacheKey);

      if (!answer) {
        const result = await generateAnswer({
          questionText: pageData.questionText,
          inputType: 'text',
          maxTokens: 15,
        });
        answer = result.answer || 'Yes';
        setCachedAnswer(cacheKey, answer);
      }

      // Fill first visible text input
      await page.evaluate((text: string) => {
        const inputs = document.querySelectorAll('input[type="text"], input:not([type]):not([type="hidden"]), textarea');
        for (const input of inputs) {
          const style = window.getComputedStyle(input);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            (input as HTMLInputElement).value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }, answer);
      return true;
    }

    // Type 4: Rating/Slider
    if (pageData.hasRating) {
      const result = await generateAnswer({
        questionText: pageData.questionText,
        inputType: 'rating',
        maxTokens: 5,
      });
      const rating = parseInt(result.answer) || 5;
      await page.evaluate((val: number) => {
        const ranges = document.querySelectorAll('input[type="range"]');
        if (ranges.length > 0) {
          const range = ranges[0] as HTMLInputElement;
          const max = parseInt(range.max) || 10;
          const min = parseInt(range.min) || 0;
          range.value = String(Math.min(Math.max(val, min), max));
          range.dispatchEvent(new Event('input', { bubbles: true }));
          range.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, rating);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ─── Continue button clicker (unchanged) ─────────────────────────────

async function tryClickContinue(page: Page): Promise<boolean> {
  const buttonTexts = [
    'next', 'continue', 'submit', 'ok', 'done',
    'forward', '›', '»', '→', 'send',
    'save & continue', 'proceed', 'finish',
  ];

  for (const text of buttonTexts) {
    try {
      const buttons = await page.$$('button, input[type="submit"], a, [role="button"], [class*="btn"], [class*="button"]');
      for (const btn of buttons) {
        const btnText = (await btn.innerText()).toLowerCase().trim();
        if (btnText === text || btnText.includes(text)) {
          await btn.click();
          return true;
        }
      }
    } catch {}
  }

  // Try clicking any visible button as last resort
  try {
    const visibleBtns = await page.$$('button:not([disabled])');
    for (const btn of visibleBtns) {
      const text = (await btn.innerText()).toLowerCase().trim();
      if (text && text.length < 30) {
        await btn.click();
        return true;
      }
    }
  } catch {}

  return false;
}

// ─── Utility ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
