import { chromium, type Browser, type Page } from 'playwright';
import { getAvailableSurveys, getSurveyLink, claimReward, login as tsLogin } from './topsurveys.js';

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
  // Wait for either a survey page or the TopSurveys dashboard to load
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

                // Attempt to complete the survey
                const completed = await attemptSurvey(page);

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

// ─── Survey completion logic ──────────────────────────────────────────

async function attemptSurvey(page: Page): Promise<boolean> {
  try {
    // Wait for the page to load
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    // Identify the survey type and attempt
    const url = page.url().toLowerCase();

    // Handle different survey platforms
    const platforms = [
      { pattern: 'cint', handler: handleCintSurvey },
      { pattern: 'dynata', handler: handleDynataSurvey },
      { pattern: 'sample', handler: handleGenericSurvey },
      { pattern: 'survey', handler: handleGenericSurvey },
      { pattern: 'opinion', handler: handleGenericSurvey },
      { pattern: 'question', handler: handleGenericSurvey },
    ];

    for (const platform of platforms) {
      if (url.includes(platform.pattern)) {
        return await platform.handler(page);
      }
    }

    // Generic fallback for unknown survey types
    return await handleGenericSurvey(page);
  } catch (err) {
    return false;
  }
}

async function handleCintSurvey(page: Page): Promise<boolean> {
  return await genericFormFiller(page);
}

async function handleDynataSurvey(page: Page): Promise<boolean> {
  return await genericFormFiller(page);
}

async function handleGenericSurvey(page: Page): Promise<boolean> {
  return await genericFormFiller(page);
}

// ─── Generic form filler ──────────────────────────────────────────────

async function genericFormFiller(page: Page): Promise<boolean> {
  try {
    // Wait for content to stabilize
    await page.waitForTimeout(3_000);

    // Maximum time to spend on one survey
    const startTime = Date.now();
    const maxDuration = 5 * 60 * 1000; // 5 minutes

    let questionsAnswered = 0;
    let screensPassed = 0;

    while (Date.now() - startTime < maxDuration) {
      // Check if we've reached a completion page
      const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      const completionIndicators = [
        'thank you', 'completed', 'finished', 'survey complete',
        'you have completed', 'congratulations', 'submitted',
        'your response', 'recorded', 'success',
      ];

      if (completionIndicators.some(ind => bodyText.includes(ind))) {
        // Wait a moment to ensure the completion is registered
        await page.waitForTimeout(2_000);
        return questionsAnswered > 0;
      }

      // Check for screening/termination
      const terminationIndicators = [
        'not qualify', 'screened out', 'over quota', 'quota full',
        'not match', 'does not match', 'unfortunately', 'we are sorry',
        'terminated', 'disqualified',
      ];

      if (terminationIndicators.some(ind => bodyText.includes(ind))) {
        return false;
      }

      // Find and interact with questions
      const interacted = await interactWithPage(page);
      if (interacted) {
        questionsAnswered++;
        screensPassed = 0;
        await page.waitForTimeout(1_000 + Math.random() * 2_000);
      } else {
        screensPassed++;
        if (screensPassed > 5) {
          // No progress — try clicking Continue/Next/Submit
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

async function interactWithPage(page: Page): Promise<boolean> {
  try {
    // Detect question types and interact
    const selectors = [
      // Radio buttons
      'input[type="radio"]',
      // Checkboxes
      'input[type="checkbox"]',
      // Rating scales
      '.rating-cell, .rating-item, [class*="rating"]',
      // Star ratings
      '.star, [class*="star"]',
      // Likert scales
      '.likert, [class*="likert"]',
      // Dropdowns
      'select',
      // Text/textarea
      'input[type="text"], input[type="email"], input[type="number"], textarea',
      // Sliders
      'input[type="range"]',
      // Single select buttons
      '.choice-item, .option-item, [class*="option"], [class*="choice"]',
      // Matrix tables
      'table input[type="radio"]',
    ];

    for (const selector of selectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        // Pick a random element and interact
        const element = elements[Math.floor(Math.random() * elements.length)];
        const tag = await element.evaluate(el => el.tagName.toLowerCase());
        const type = await element.evaluate(el => (el as HTMLInputElement).type || '');

        if (tag === 'select') {
          const options = await element.$$('option');
          // Skip the first option if it's a placeholder
          const firstSelected = await element.evaluate(el => (el as HTMLSelectElement).selectedIndex);
          const validOptions = firstSelected === 0 ? options.slice(1) : options;
          if (validOptions.length > 0) {
            const randomOption = validOptions[Math.floor(Math.random() * validOptions.length)];
            const value = await randomOption.getAttribute('value');
            if (value) {
              await element.selectOption(value);
              return true;
            }
          }
        } else if (tag === 'textarea' || type === 'text' || type === 'email' || type === 'number') {
          const answers = ['Yes', 'No', 'Maybe', 'Sometimes', 'Often', 'Rarely', 'Weekly', 'Monthly', 'Good', 'Average'];
          await element.fill(answers[Math.floor(Math.random() * answers.length)]);
          return true;
        } else if (type === 'radio' || type === 'checkbox') {
          await element.click();
          return true;
        } else {
          await element.click();
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

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

// ─── Utility ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}