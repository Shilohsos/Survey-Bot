import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { chromium } from 'playwright';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { spawn } from 'child_process';
import { launchStealthBrowser, applyStealthToPage, answerQuestion, pickBestOption, generateTextAnswer, checkAndWithdraw, getWithdrawalInfo } from './src/botIntegrations.js';
import { attemptWithdrawal } from './src/autoWithdraw.js';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const ADMIN_ID = Number(process.env.ADMIN_ID || '0');
const EMAIL = process.env.TS_EMAIL || '';
const PASSWORD = process.env.TS_PASSWORD || '';
const CRYPTO_WALLET = process.env.CRYPTO_WALLET || '';
const WITHDRAWAL_THRESHOLD = parseFloat(process.env.WITHDRAWAL_THRESHOLD || '5.0');

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing from .env');
if (!ADMIN_ID) throw new Error('ADMIN_ID missing');

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: Infinity });

// ─── Proxy Bridge ─────────────────────────────────────────────────────────
// Local unauthenticated SOCKS5 -> remote authenticated SOCKS5

const BRIDGE_PORT = 10801;
let bridgeProcess: any = null;

function startBridge() {
  if (bridgeProcess) return;
  const proxyHost = process.env.PROXY_HOST;
  if (!proxyHost) {
    console.log('[bridge] no PROXY_HOST set, running without proxy');
    return;
  }
  bridgeProcess = spawn('node', ['proxy_bridge.mjs'], {
    cwd: '/root/Survey-Bot',
    stdio: 'ignore',
    detached: true,
  });
  bridgeProcess.unref();
  console.log(`[bridge] started (PID ${bridgeProcess.pid})`);
}

function stopBridge() {
  if (bridgeProcess) {
    try { bridgeProcess.kill(); } catch {}
    bridgeProcess = null;
  }
}

// ─── Socks agent for API calls ──────────────────────────────────────────

const PROXY = process.env.PROXY || '';
const PROXY_USER = process.env.PROXY_USER || '';
const PROXY_PASS = process.env.PROXY_PASS || '';

let socksAgent: any = undefined;
if (PROXY) {
  let proxyUrl = PROXY;
  if (PROXY_USER && PROXY_PASS) {
    const withoutProto = proxyUrl.replace(/^socks5:\/\//, '');
    proxyUrl = `socks5://${encodeURIComponent(PROXY_USER)}:${encodeURIComponent(PROXY_PASS)}@${withoutProto}`;
  }
  socksAgent = new SocksProxyAgent(proxyUrl);
}

function socksFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (socksAgent) (options as any).agent = socksAgent;
  return fetch(url, options);
}

// ── Bot Persona (consistent profile for survey qualification) ─────────
// All qualification/onboarding answers must use this profile to avoid screening
const PERSONA = {
  gender: 'Homme',
  age: '35-44',
  education: ['diplômé', 'université', 'supérieur', 'degree', 'college', 'university', 'bachelor'],
  employment: ['employé', 'temps plein', 'full-time', 'employee', 'salarié'],
  maritalStatus: ['marié', 'married', 'conjoint'],
  hasChildren: ['2', 'oui', 'yes', 'two', 'children'],
  income: ['€50', '€75', '€100', '$50', '$75', '50k', '75k', 'good', 'average'],
  occupation: ['technologie', 'it', 'tech', 'computer', 'informatique', 'digital', 'analyst'],
  interests: ['technologie', 'voyage', 'sport', 'cinéma', 'lecture', 'news', 'actualité'],
  housing: ['propriétaire', 'own', 'maison', 'house'],
  languages: ['français', 'french', 'anglais', 'english'],
  // Generic short answers for random text fields
  textAnswers: ['Yes', 'No', 'Often', 'Weekly', 'Sometimes', 'Good', 'Average'],
};

// ─── State ──────────────────────────────────────────────────────────────

let authToken: string | null = null;
let savedCookies: any[] = [];
let savedLocalStorage: Record<string, string> = {};
let savedSessionStorage: Record<string, string> = {};
let userData: Record<string, any> = {};
let profileData: Record<string, any> = {};
let loggedIn = false;
let running = false;

// Session history
let sessionHistory = {
  totalCompleted: 0,
  totalScreened: 0,
  totalErrors: 0,
  totalEarned: 0,
  startTime: 0,
  currentSurveyLabel: '',
};

// ─── Login via Playwright (through proxy bridge) ────────────────────────

async function doLogin(): Promise<string> {
  startBridge();
  await new Promise(r => setTimeout(r, 1000)); // wait for bridge

  console.log('[login] launching browser (stealth)...');
  const BRIDGE_ADDR = process.env.PROXY_HOST ? `socks5://127.0.0.1:${BRIDGE_PORT}` : undefined;
  const { browser, context } = await launchStealthBrowser(
    true,
    BRIDGE_ADDR
  );

  try {
    const page = await context.newPage();
    applyStealthToPage(page);

    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Fill email
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);

    // Fill password
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    // Get ALL cookies from the session (not just auth-token)
    const cookies = await page.context().cookies();
    savedCookies = cookies;
    
    // Also save localStorage and sessionStorage for SPA auth
    savedLocalStorage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) items[key] = localStorage.getItem(key) || '';
      }
      return items;
    });
    savedSessionStorage = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) items[key] = sessionStorage.getItem(key) || '';
      }
      return items;
    });
    
    const authCookie = cookies.find(c => c.name === 'auth-token');

    if (!authCookie) {
      throw new Error('Login failed - no auth-token cookie');
    }

    authToken = decodeURIComponent(authCookie.value);
    loggedIn = true;
    console.log('[login] success, token:', authToken.substring(0, 20) + '...');

    // Fetch dashboard data
    await refreshDashboard();
    return authToken;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function refreshDashboard(): Promise<boolean> {
  if (!authToken) return false;
  const BASE = 'https://api.topsurveys.app';
  const headers = { Authorization: `Bearer ${authToken}` };

  try {
    const userRes = await socksFetch(`${BASE}/api/user`, { headers });
    if (userRes.ok) userData = await userRes.json();
    else if (userRes.status === 401) {
      // Token expired — will be handled by ensureLoggedIn() on next cycle
      authToken = null;
      loggedIn = false;
      return false;
    }
    
    const profileRes = await socksFetch(`${BASE}/api/profile`, { headers });
    if (profileRes.ok) profileData = await profileRes.json();
    else if (profileRes.status === 401) {
      authToken = null;
      loggedIn = false;
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// ─── Scrape dashboard page for available surveys ──────────────────────

let scrapedSurveys: any[] = [];

async function scrapeSurveys(): Promise<any[]> {
  if (!authToken) return [];
  
  // Helper: attempt scraping with a given browser/page
  async function attemptScrape(browser: any, page: any): Promise<any[]> {
    // tsx injects __name helper into compiled evaluate callbacks
    await page.evaluate(() => { (window as any).__name = () => {}; }).catch(() => {});
    
    // Set ALL saved cookies from the login session
    for (const c of savedCookies) {
      await page.context().addCookies([c]);
    }
    
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Restore localStorage and sessionStorage so SPA can authenticate
    await page.evaluate((ls) => {
      const keys = Object.keys(ls);
      for (let i = 0; i < keys.length; i++) {
        try { localStorage.setItem(keys[i], ls[keys[i]]); } catch {}
      }
    }, savedLocalStorage);
    await page.evaluate((ss) => {
      const keys = Object.keys(ss);
      for (let i = 0; i < keys.length; i++) {
        try { sessionStorage.setItem(keys[i], ss[keys[i]]); } catch {}
      }
    }, savedSessionStorage);
    
    // Reload so SPA picks up the full state
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Dismiss any overlays/popups on the dashboard
    await autoAnswerOnboarding(page);

    // Click the Sondages tab using JS
    const sondagesClicked = await page.evaluate(() => {
      const nav = document.querySelector('[data-test-id="surveys-nav"]');
      if (nav) { (nav as HTMLElement).click(); return true; }
      return false;
    });
    if (sondagesClicked) {
      await page.waitForTimeout(4000); // Wait for Vue to render survey cards
    }

    // Dismiss onboarding again if it reappeared on surveys page
    await autoAnswerOnboarding(page);
    await page.waitForTimeout(1000);

    // Wait for survey cards to appear (up to 15s)
    for (let i = 0; i < 15; i++) {
      const count = await page.evaluate(() => {
        return document.querySelectorAll('.list-item.new-survey-tile.survey-item').length;
      });
      if (count > 0) break;
      await page.waitForTimeout(1000);
    }

    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/ss_scrape_dash.png', fullPage: false }).catch(() => {});

    // Scrape survey content from the surveys tab — use class selector for robustness
    const surveys = await page.evaluate(() => {
      const results: any[] = [];
      
      // Primary selector: class-based (catches only card containers, not child elements)
      let cards = document.querySelectorAll('.list-item.new-survey-tile.survey-item');
      
      // Fallback to data-test-id if class selector found nothing
      if (cards.length === 0) {
        cards = document.querySelectorAll('[data-test-id^="ps-survey-"]');
        // Filter to only card containers (not child elements)
        cards = Array.from(cards).filter(c => {
          const id = c.getAttribute('data-test-id') || '';
          // UUID pattern: ps-survey-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
          return /^ps-survey-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        });
      }
      
      cards.forEach(card => {
        const text = (card as HTMLElement).innerText || '';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const testId = card.getAttribute('data-test-id') || card.className || '';
        
        const survey: any = { testId };
        for (const line of lines) {
          if (/^\d+\s*min/i.test(line)) survey.duration = line;
          else if (line.includes('€') && line.includes(',')) {
            if (!survey.reward) survey.reward = line;
            else survey.reward2 = line;
          }
          else if (/^[\d.]+/.test(line) && line.includes('(') && line.includes(')')) survey.rating = line;
          else if (line.includes('%') && !survey.bonus) survey.bonus = line;
          else if (line === 'Nouveau') survey.isNew = true;
          else if (/^\d+$/.test(line) && !survey.ratingStars) survey.ratingStars = line;
          else if (line.length > 2 && !survey.name && !line.includes('€') && !line.includes('%') && !line.includes('(')) survey.name = line;
        }
        results.push(survey);
      });

      // Also check for onboarding
      const onboardingCard = document.querySelector('[data-test-id="ps-onboarding-popup"], .onboarding-card');
      if (onboardingCard) {
        results.push({ type: 'onboarding', text: (onboardingCard as HTMLElement).innerText || '' });
      }
      
      return results;
    });

    scrapedSurveys = surveys;
    console.log('[scrape] found', surveys.length, 'survey cards');
    await page.screenshot({ path: '/tmp/ss_scrape_result.png', fullPage: true }).catch(() => {});
    return surveys;
  }
  
  try {
    startBridge();
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('[scrape] launching browser (stealth)...');
    const BRIDGE_ADDR = process.env.PROXY_HOST ? `socks5://127.0.0.1:${BRIDGE_PORT}` : undefined;
    const { browser, context } = await launchStealthBrowser(
      true,
      BRIDGE_ADDR
    );

    try {
      const page = await context.newPage();
      applyStealthToPage(page);
      const surveys = await attemptScrape(browser, page);
      
      // If we got 0 surveys and the onboarding popup wasn't the cause,
      // try a fresh login as fallback
      if (surveys.length === 0) {
        console.log('[scrape] 0 cards found — trying fresh login fallback...');
        await browser.close().catch(() => {});
        
        const browser2 = await chromium.launch({
          headless: true,
          proxy: { server: `socks5://127.0.0.1:${BRIDGE_PORT}` },
          args: ['--no-sandbox'],
        });
        try {
          const page2 = await browser2.newPage();
          
          // Fresh login
          await page2.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page2.waitForTimeout(1000);
          await page2.locator('input[type="email"]').fill(EMAIL);
          await page2.locator('[data-test-id="app-page-continue-button"]').click();
          await page2.waitForTimeout(2000);
          await page2.locator('input[type="password"]').fill(PASSWORD);
          await page2.locator('[data-test="auth-signin-submit"]').click();
          await page2.waitForTimeout(5000);
          
          // Refresh saved state from this fresh login
          const cookies = await page2.context().cookies();
          savedCookies = cookies;
          savedLocalStorage = await page2.evaluate(() => {
            const items: Record<string, string> = {};
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key) items[key] = localStorage.getItem(key) || '';
            }
            return items;
          });
          savedSessionStorage = await page2.evaluate(() => {
            const items: Record<string, string> = {};
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key) items[key] = sessionStorage.getItem(key) || '';
            }
            return items;
          });
          
          const freshSurveys = await attemptScrape(browser2, page2);
          await browser2.close().catch(() => {});
          return freshSurveys;
        } catch {
          await browser2.close().catch(() => {});
          return [];
        }
      }
      
      await browser.close().catch(() => {});
      return surveys;
    } catch (err: any) {
      console.log('[scrape] ERROR:', err?.message || err);
      await browser.close().catch(() => {});
      return [];
    }
  } catch {
    return [];
  }
}

// ─── Auto-answer onboarding/profile questions ──────────────────────────

async function autoAnswerOnboarding(page: any) {
  try {
    // First dismiss any device selection popup
    try {
      await page.evaluate(() => {
        const dp = document.querySelector('[data-test-id="ps-offers-platforms-popup"]');
        if (dp && dp.parentElement) dp.parentElement.removeChild(dp);
      });
    } catch {}

    // Check and handle initial "Poursuivre l'onboarding" button
    const pursueBtn = page.locator('button:has-text("Poursuivre")');
    if (await pursueBtn.count() > 0) {
      console.log('[onboarding] clicking "Poursuivre l\'onboarding"');
      await pursueBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Check for "Commence l'intégration" button
    const startBtn = page.locator('button:has-text("Commence")');
    if (await startBtn.count() > 0) {
      console.log('[onboarding] clicking "Commence"');
      await startBtn.first().click();
      await page.waitForTimeout(2000);
    }
    
    // Check if onboarding popup exists at all
    const popupCheck = page.locator('[data-test-id="ps-onboarding-popup"]');
    if (!(await popupCheck.isVisible().catch(() => false))) return;
    
    // Process each question in sequence (up to 25 steps)
    for (let step = 0; step < 25; step++) {
      const popup = page.locator('[data-test-id="ps-onboarding-popup"]');
      if (!(await popup.isVisible().catch(() => false))) {
        console.log(`[onboarding] popup gone after step ${step}`);
        break;
      }
      
      const content = await popup.locator('[data-test-id="ps-popup-content-wrapper"]').innerText().catch(() => '');
      
      // Birthday step: year input + month/day dropdowns
      const yearInput = popup.locator('[data-test-id="ps-date-picker-year-input"]');
      if (await yearInput.count() > 0) {
        console.log('[onboarding] birthday step');
        await yearInput.fill('1990');
        await page.waitForTimeout(500);
        
        const monthToggle = popup.locator('[data-test-id="ps-date-picker-month-toggle"]');
        const monthDisabled = await monthToggle.evaluate((el: any) => el.classList.contains('ps-dropdown__disabled')).catch(() => true);
        
        if (!monthDisabled) {
          await monthToggle.click();
          await page.waitForTimeout(500);
          
          // Try "Mai" first, then any month option
          const maiOption = page.locator('.ps-dropdown__item.month:has-text("Mai")');
          if (await maiOption.count() > 0) {
            await maiOption.first().click();
            await page.waitForTimeout(500);
          } else {
            const monthOpts = page.locator('.ps-dropdown__item.month');
            if (await monthOpts.count() > 0) {
              await monthOpts.first().click();
              await page.waitForTimeout(500);
            }
          }
          
          const dayToggle = popup.locator('[data-test-id="ps-date-picker-day-toggle"]');
          const dayDisabled = await dayToggle.evaluate((el: any) => el.classList.contains('ps-dropdown__disabled')).catch(() => true);
          
          if (!dayDisabled) {
            await dayToggle.click();
            await page.waitForTimeout(500);
            
            const day15 = page.locator('.ps-dropdown__item.day:has-text("15")');
            if (await day15.count() > 0) {
              await day15.first().click();
              await page.waitForTimeout(500);
            } else {
              const dayOpts = page.locator('.ps-dropdown__item.day');
              if (await dayOpts.count() > 0) {
                await dayOpts.first().click();
                await page.waitForTimeout(500);
              }
            }
          }
        }
      }
      
      // Text input fields (zip code, city, etc.)
      const textInputs = popup.locator('input[type="text"], input:not([type]):not([type="email"]):not([type="password"]):not([type="hidden"])');
      const textCount = await textInputs.count();
      if (textCount > 0) {
        console.log(`[onboarding] ${textCount} text input(s)`);
        for (let i = 0; i < textCount; i++) {
          const placeholder = await textInputs.nth(i).getAttribute('placeholder').catch(() => '') || '';
          if (placeholder.toLowerCase().includes('code') || placeholder.toLowerCase().includes('zip') || placeholder.toLowerCase().includes('postal')) {
            await textInputs.nth(i).fill('75001');
          } else if (placeholder.toLowerCase().includes('city') || placeholder.toLowerCase().includes('ville')) {
            await textInputs.nth(i).fill('Paris');
          } else {
            await textInputs.nth(i).fill('Test');
          }
          await page.waitForTimeout(300);
        }
      }
      
      // Multi-select options (languages, preferences, etc.)
      const options = popup.locator('.item-select-option, [class*="option-item"], [class*="select__option"]');
      const optionCount = await options.count();
      
      if (optionCount > 0) {
        console.log(`[onboarding] ${optionCount} selectable options`);
        const isLanguageStep = content.toLowerCase().includes('langue');
        
        for (let i = 0; i < optionCount; i++) {
          const text = (await options.nth(i).innerText()).trim();
          if (!text) continue;
          
          // Language step: prioritize Français/English
          if (isLanguageStep && (text.includes('Français') || text.includes('English'))) {
            console.log(`  -> language: "${text}"`);
            await options.nth(i).click();
            await page.waitForTimeout(300);
            continue;
          }
          
          // Match against persona preferences
          const personaPatterns = [
            'supérieur', 'université', 'diplômé', 'bac+', 'graduate',
            'employé', 'temps plein', 'full-time', 'employee', 'salarié',
            'marié', 'married', 'marie', 'en couple',
            'homme', 'masculin', 'male',
            '35-44', '35-44',
            'technologie', 'technology', 'informatique', 'it', 'computer',
            'sport', 'voyage', 'travel',
            'français', 'france',
            '50,000', '75,000', '€50', '€75', 
          ];
          for (const pat of personaPatterns) {
            if (text.toLowerCase().includes(pat)) {
              console.log(`  -> matched "${pat}": "${text}"`);
              const isChecked = await options.nth(i).isChecked().catch(() => false);
              const hasActiveClass = await options.nth(i).evaluate((el: any) => el.classList.contains('active') || el.getAttribute('aria-selected') === 'true').catch(() => false);
              if (!isChecked && !hasActiveClass) {
                await options.nth(i).click();
                await page.waitForTimeout(300);
              }
              break;
            }
          }
        }
      }
      
      // Dropdown select elements
      const selects = popup.locator('select');
      const selCount = await selects.count();
      if (selCount > 0) {
        console.log(`[onboarding] ${selCount} <select> dropdown(s)`);
        for (let i = 0; i < selCount; i++) {
          const opts = await selects.nth(i).locator('option').all();
          if (opts.length > 1) {
            const values: string[] = [];
            for (const opt of opts) {
              const v = await opt.getAttribute('value').catch(() => '');
              if (v) values.push(v);
            }
            // Pick second option (skip default/placeholder)
            const pickVal = values.length > 1 ? values[1] : (values[0] || '');
            if (pickVal) {
              await selects.nth(i).selectOption(pickVal);
              await page.waitForTimeout(300);
              console.log(`  -> selected "${pickVal}"`);
            }
          }
        }
      }
      
      // Click Suivant / Terminer / Valider / Continuer
      const btnTexts = 'button:has-text("Suivant"), button:has-text("Terminer"), button:has-text("Valider"), button:has-text("Continuer"), button:has-text("Next"), button:has-text("Finish")';
      const nextBtn = popup.locator(btnTexts);
      if (await nextBtn.count() > 0) {
        const disabled = await nextBtn.first().isDisabled().catch(() => false);
        if (!disabled) {
          const btnLabel = await nextBtn.first().innerText().catch(() => '?');
          console.log(`[onboarding] clicking "${btnLabel}"`);
          await nextBtn.first().click();
          await page.waitForTimeout(1500);
        } else {
          console.log('[onboarding] next button disabled — missing required input');
          // Take debug screenshot to see what's wrong
          await page.screenshot({ path: '/tmp/debug_onboard_stuck.png', fullPage: false }).catch(() => {});
          break;
        }
      } else {
        // No navigation button — maybe the onboarding is done or it's a simple close
        console.log('[onboarding] no next/finish button — checking if popup auto-closes');
        await page.waitForTimeout(2000);
        if (await popup.isVisible().catch(() => false)) {
          await page.screenshot({ path: '/tmp/debug_onboard_no_next.png', fullPage: false }).catch(() => {});
        }
        break;
      }
    }
    
    // After processing, if popup still visible, try to force close it
    const stillThere = page.locator('[data-test-id="ps-onboarding-popup"]');
    if (await stillThere.isVisible().catch(() => false)) {
      console.log('[onboarding] still visible after steps — force-closing');
      await forceCloseOnboarding(page);
    }
  } catch {
    try {
      await forceCloseOnboarding(page);
    } catch {}
  }
}

async function forceCloseOnboarding(page: any) {
  try {
    // Try clicking a close button
    const closeBtn = page.locator('[data-test-id="ps-onboarding-popup"] .popup-close button, [data-test-id="ps-onboarding-popup"] [class*="close"]');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(500);
    }
  } catch {}
  
  try {
    // Remove the popup from DOM via JavaScript as last resort
    await page.evaluate(() => {
      const popup = document.querySelector('[data-test-id="ps-onboarding-popup"]');
      if (popup && popup.parentElement) {
        popup.parentElement.removeChild(popup);
      }
    });
    await page.waitForTimeout(500);
  } catch {}
  
  try {
    // Also remove the device selection popup if present
    await page.evaluate(() => {
      const popup = document.querySelector('[data-test-id="ps-offers-platforms-popup"]');
      if (popup && popup.parentElement) {
        popup.parentElement.removeChild(popup);
      }
    });
  } catch {}
  
  // Remove any remaining overlay/backdrop elements
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[class*="overlay"], [class*="backdrop"]').forEach(el => {
        if (el.parentElement) el.parentElement.removeChild(el);
      });
    });
  } catch {}
}

function formatDash(): string {
  const bal = userData.balance !== undefined ? `${userData.balance} €` : 'N/A';
  const streak = userData.current_streak ? `${userData.current_streak.active_days || 0} days` : 'N/A';
  
  const profileCompleted = profileData.stats?.surveys?.completed || 0;
  const profileScreenouts = profileData.stats?.surveys?.screened || 0;
  
  // Session duration
  const sessionDuration = sessionHistory.startTime > 0
    ? Math.floor((Date.now() - sessionHistory.startTime) / 60000) + ' min'
    : '—';
  
  let msg = `📊 *Dashboard*\n\n`;
  msg += `👤 *Account Stats:*\n`;
  msg += `💰 Balance: ${bal}\n`;
  msg += `📈 Streak: ${streak}\n`;
  msg += `✅ Lifetime Completed: ${profileCompleted}\n`;
  msg += `❌ Lifetime Screened: ${profileScreenouts}\n\n`;
  msg += `📋 *Session Stats:*\n`;
  msg += `⏱ Run time: ${sessionDuration}\n`;
  msg += `✅ Completed: ${sessionHistory.totalCompleted}\n`;
  msg += `❌ Screened: ${sessionHistory.totalScreened}\n`;
  msg += `⚠️ Errors: ${sessionHistory.totalErrors}\n`;
  msg += `💰 Earned: €${sessionHistory.totalEarned.toFixed(2)}\n`;
  if (sessionHistory.currentSurveyLabel) {
    msg += `\n🔍 *Current:* ${sessionHistory.currentSurveyLabel}\n`;
  }
  
  if (scrapedSurveys.length > 0) {
    const realSurveys = scrapedSurveys.filter(s => s.type !== 'onboarding' && s.duration);
    msg += `\n📋 *Available:* ${realSurveys.length} surveys\n`;
    let shown = 0;
    for (const s of realSurveys) {
      if (shown >= 8) { msg += `   ...and ${realSurveys.length - shown} more\n`; break; }
      msg += `▪ ${s.duration || '?'} — ${s.reward || '?'}`;
      if (s.bonus) msg += ` ${s.bonus}`;
      msg += '\n';
      shown++;
    }
  } else {
    msg += '\n📋 No surveys found (press Dashboard to refresh)';
  }
  
  return msg;
}

// ─── Attempt a survey (generic form filler) with progress updates ──────

function parseDurationMinutes(duration: string): number {
  // "9 min", "5 min", "37 min" -> 9, 5, 37
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1]) : 5;
}

async function attemptSurvey(page: any, chatId: number, ctx: any, surveyLabel: string, surveyDuration: string): Promise<boolean> {
  try {
    await page.waitForTimeout(3000);
    const startTime = Date.now();
    
    // Calculate max duration based on survey's listed duration + 2min buffer
    const listedMin = parseDurationMinutes(surveyDuration);
    const maxDuration = Math.min((listedMin + 2) * 60 * 1000, 15 * 60 * 1000); // cap at 15min
    
    let questionsAnswered = 0;
    let screensPassed = 0;
    let lastInteractionTime = Date.now();
    let lastProgressPct = -1;

    // Estimate total questions needed for % progress
    const estimateTotalQ = Math.max(Math.ceil(listedMin * 1.5), 5); // ~1.5 questions per minute

    while (Date.now() - startTime < maxDuration) {
      const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');

      // Completion check
      if (['thank you', 'completed', 'finished', 'survey complete', 'congratulations',
        'your response', 'recorded', 'successfully submitted', 'complete survey',
        'you have finished', 'survey closed'].some(t => bodyText.includes(t))) {
        await page.waitForTimeout(2000);
        if (questionsAnswered > 0) {
          await ctx.telegram.sendMessage(chatId, `📊 ${surveyLabel} — 100% ✅ Done!`, { parse_mode: 'Markdown' }).catch(() => {});
        }
        return questionsAnswered > 0;
      }

      // Screening check
      if (['not qualify', 'screened out', 'quota full', 'does not match',
        'unfortunately', 'disqualified', 'terminated', 'not eligible',
        'no longer available', 'survey closed'].some(t => bodyText.includes(t))) {
        return false;
      }

      // Stuck detection — only after 60s inactivity AND 15 screens passed
      const inactiveFor = Date.now() - lastInteractionTime;
      if (inactiveFor > 60000 && screensPassed > 15) {
        await ctx.telegram.sendMessage(chatId, `🔄 ${surveyLabel} — refreshing page...`, { parse_mode: 'Markdown' }).catch(() => {});
        try {
          await page.reload({ waitUntil: 'load', timeout: 20000 });
          await page.waitForTimeout(3000);
          lastInteractionTime = Date.now();
          screensPassed = 0;
          continue;
        } catch {
          return false;
        }
      }

      // Interact with form elements
      const interacted = await interactWithPage(page);
      if (interacted) {
        questionsAnswered++;
        lastInteractionTime = Date.now();
        screensPassed = 0;

        // Progress percentage
        const pct = Math.min(Math.round((questionsAnswered / estimateTotalQ) * 100), 99);
        const pctBucket = Math.floor(pct / 10) * 10; // 0, 10, 20, 30... 
        if (pctBucket > lastProgressPct && pctBucket <= 90) {
          lastProgressPct = pctBucket;
          await ctx.telegram.sendMessage(chatId, `📊 ${surveyLabel} — ${pctBucket}%`, { parse_mode: 'Markdown' }).catch(() => {});
        }

        await page.waitForTimeout(1000 + Math.random() * 2000);
      } else {
        screensPassed++;
        if (screensPassed > 8) {
          const clicked = await tryClickContinue(page);
          if (!clicked) { await page.waitForTimeout(3000); screensPassed = 0; }
          else { lastInteractionTime = Date.now(); screensPassed = 0; }
        } else {
          await page.waitForTimeout(2000);
        }
      }
    }
    // Timeout — survey took longer than expected
    await ctx.telegram.sendMessage(chatId, `⏰ ${surveyLabel} — timed out (${listedMin + 2}min)`, { parse_mode: 'Markdown' }).catch(() => {});
    return questionsAnswered > 0;
  } catch { return false; }
}

async function interactWithPage(page: any): Promise<boolean> {
  try {
    // First try persona-matched options (scan by text content)
    const matched = await tryMatchPersonaOptions(page);
    if (matched) return true;

    // Fallback to generic selectors if persona matching found nothing
    const selectors = [
      'input[type="radio"]', 'input[type="checkbox"]',
      '.rating-cell, .rating-item, [class*="rating"]',
      'select', 'input[type="text"], input[type="email"], input[type="number"], textarea',
      'input[type="range"]', '.choice-item, .option-item, [class*="option"], [class*="choice"]',
      'table input[type="radio"]',
    ];
    for (const sel of selectors) {
      const elements = await page.$$(sel);
      if (elements.length > 0) {
        const el = elements[Math.floor(Math.random() * elements.length)];
        const tag = await el.evaluate((e: any) => e.tagName.toLowerCase());
        const type = await el.evaluate((e: any) => (e as HTMLInputElement).type || '');
        if (tag === 'select') {
          const opts = await el.$$('option');
          const valid = opts.length > 1 ? opts.slice(1) : opts;
          if (valid.length > 0) {
            const val = await valid[Math.floor(Math.random() * valid.length)].getAttribute('value');
            if (val) { await el.selectOption(val); return true; }
          }
        } else if (tag === 'textarea' || type === 'text' || type === 'email' || type === 'number') {
          await el.fill(PERSONA.textAnswers[Math.floor(Math.random() * PERSONA.textAnswers.length)]);
          return true;
        } else {
          await el.click();
          return true;
        }
      }
    }
    return false;
  } catch { return false; }
}

// Try to match survey options against PERSONA keywords before random fallback
async function tryMatchPersonaOptions(page: any): Promise<boolean> {
  // Get all visible radio/checkbox/choice elements with their text
  const options = await page.evaluate(() => {
    const items: { tag: string; text: string; index: number }[] = [];
    let idx = 0;
    
    // Radio inputs
    document.querySelectorAll('input[type="radio"]').forEach(el => {
      const parent = el.parentElement;
      const text = parent ? (parent.textContent || '').trim() : (el as any).value || '';
      if (text) items.push({ tag: 'radio', text, index: idx++ });
    });
    
    // Choice items (survey platforms often use custom styled radios)
    if (items.length === 0) {
      document.querySelectorAll('.choice-item, .option-item, [class*="option"], [class*="choice"], label').forEach(el => {
        const text = (el.textContent || '').trim();
        const style = window.getComputedStyle(el);
        if (text && text.length < 100 && style.display !== 'none' && style.visibility !== 'hidden') {
          items.push({ tag: 'choice', text, index: idx++ });
        }
      });
    }
    
    // Checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(el => {
      const parent = el.parentElement;
      const text = parent ? (parent.textContent || '').trim() : '';
      if (text) items.push({ tag: 'checkbox', text, index: idx++ });
    });
    
    return items;
  });

  if (options.length === 0) return false;

  // Build persona keywords list for matching
  const personaKeywords = [
    PERSONA.gender.toLowerCase(),
    PERSONA.age,
    ...PERSONA.education.map(k => k.toLowerCase()),
    ...PERSONA.employment.map(k => k.toLowerCase()),
    ...PERSONA.maritalStatus.map(k => k.toLowerCase()),
    ...PERSONA.income.map(k => k.toLowerCase()),
    ...PERSONA.occupation.map(k => k.toLowerCase()),
    ...PERSONA.interests.map(k => k.toLowerCase()),
    ...PERSONA.languages.map(k => k.toLowerCase()),
  ];

  // Find the best matching option
  for (const opt of options) {
    const lower = opt.text.toLowerCase();
    for (const kw of personaKeywords) {
      if (lower.includes(kw)) {
        // Click this option
        const clicked = await page.evaluate((text: string) => {
          // Try exact match first
          const all = document.querySelectorAll('input[type="radio"], input[type="checkbox"], .choice-item, .option-item, [class*="option"], [class*="choice"], label');
          for (const el of all) {
            if ((el.textContent || '').trim() === text) {
              (el as HTMLElement).click();
              return true;
            }
          }
          // Try partial match
          for (const el of all) {
            if ((el.textContent || '').trim().includes(text.substring(0, 20))) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        }, opt.text);
        if (clicked) return true;
      }
    }
  }

  return false;
}

async function tryClickContinue(page: any): Promise<boolean> {
  const texts = ['next', 'continue', 'submit', 'ok', 'done', 'send', 'finish', 'proceed', '›', '→'];
  for (const t of texts) {
    try {
      const btns = await page.$$('button, input[type="submit"], a, [role="button"], [class*="btn"], [class*="button"]');
      for (const btn of btns) {
        const txt = (await btn.innerText()).toLowerCase().trim();
        if (txt === t || txt.includes(t)) { await btn.click(); return true; }
      }
    } catch {}
  }
  return false;
}

// ─── Take a survey and report status ───────────────────────────────────

let lastStatusMsgId: number | null = null;
let statusChatId: number | null = null;

async function sendStatus(ctx: any, text: string) {
  if (!ctx) return;
  try {
    await ctx.telegram.sendMessage(ctx.chat!.id, text, { parse_mode: 'Markdown' });
  } catch {}
}

async function openAndTakeSurvey(ctx: any, preferredSurvey: any, chatId: number): Promise<{ completed: boolean; reward: string }> {
  const label = `${preferredSurvey.duration || '?'} min (${preferredSurvey.reward || '?'})`;
  sessionHistory.currentSurveyLabel = label;
  
  await sendStatus(ctx, `▶️ Opening: ${label}`);

  try {
    startBridge();
    await new Promise(r => setTimeout(r, 1000));

    console.log('[survey] launching browser (stealth)...');
    const BRIDGE_ADDR = process.env.PROXY_HOST ? `socks5://127.0.0.1:${BRIDGE_PORT}` : undefined;
    const { browser, context: surveyContext } = await launchStealthBrowser(
      true,
      BRIDGE_ADDR
    );

    try {
      const page = await surveyContext.newPage();
      applyStealthToPage(page);
      // tsx injects __name helper — define it in page context
      await page.evaluate(() => { (window as any).__name = () => {}; }).catch(() => {});
      await page.context().addCookies([
        { name: 'auth-token', value: authToken!, domain: '.topsurveys.app', path: '/' },
      ]);

      // Go to surveys page
      await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);

      // Dismiss any onboarding popup first
      await autoAnswerOnboarding(page);

      // Click the Sondages tab using JS
      await page.evaluate(() => {
        const nav = document.querySelector('[data-test-id="surveys-nav"]');
        if (nav) (nav as HTMLElement).click();
      });
      await page.waitForTimeout(3000);

      // Dismiss onboarding again if it reappeared
      await autoAnswerOnboarding(page);

      // Scrape currently available surveys right now (fresh data)
      const availableCards = await page.evaluate(() => {
        const cards: { testId: string; duration: string; reward: string }[] = [];
        const els = document.querySelectorAll('[data-test-id^="ps-survey-"]');
        els.forEach(card => {
          const tid = card.getAttribute('data-test-id') || '';
          // Skip child elements
          if (tid === 'ps-survey-item-time' || tid === 'ps-survey-rating-wrapper' || tid === 'ps-list-item-reward' ||
              tid === 'ps-reward-without-bonus' || tid === 'ps-reward-amount' || tid === 'ps-reward-currency') return;
          const text = (card as HTMLElement).innerText || '';
          const durMatch = text.match(/(\d+)\s*min/i);
          cards.push({
            testId: tid,
            duration: durMatch ? durMatch[1] + ' min' : '5 min',
            reward: text.includes('€') ? text.split('\n').find(l => l.includes('€')) || '' : ''
          });
        });
        return cards;
      });

      // Try preferred survey first (by testId), then fallback to any available
      let chosenCard = availableCards.find(c => c.testId === preferredSurvey.testId);
      if (!chosenCard && availableCards.length > 0) {
        // Fallback: pick the shortest available
        chosenCard = availableCards.sort((a, b) => parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration))[0];
        await sendStatus(ctx, `🔄 Preferred survey gone, switching to ${chosenCard.duration} (${chosenCard.reward})`);
      }

      if (!chosenCard) {
        await sendStatus(ctx, `⚠️ No surveys available right now: ${label}`);
        await browser.close().catch(() => {});
        sessionHistory.totalErrors++;
        return { completed: false, reward: '' };
      }

      // Click the chosen survey card
      const cardClicked = await page.evaluate((tid: string) => {
        const card = document.querySelector(`[data-test-id="${CSS.escape(tid)}"]`);
        if (card) { (card as HTMLElement).click(); return true; }
        return false;
      }, chosenCard.testId);
      
      if (!cardClicked) {
        await sendStatus(ctx, `⚠️ Could not click survey card: ${label}`);
        await browser.close().catch(() => {});
        sessionHistory.totalErrors++;
        return { completed: false, reward: '' };
      }
      
      await page.waitForTimeout(3000);

      // ── Handle integration popup and qualification ──────────────────────
      // Survey cards open an integration popup with:
      // 1. "Commence le sondage" button → then qualification questions
      // 2. Qualification popup (ps-integration-questions-popup) with radio/checkbox
      // 3. Then the actual survey loads (same page, iframe, or new page)
      
      // Define __name helper in page context (tsx injects this into compiled code)
      await page.evaluate(() => {
        (window as any).__name = (f: any, n: string) => { try { Object.defineProperty(f, 'name', { value: n, configurable: true }); } catch {} };
      }).catch(() => {});

      await sendStatus(ctx, `⏳ Opening survey: ${label}`);

      // Dismiss onboarding/device popups that might block
      await page.evaluate(() => {
        document.querySelectorAll('[data-test-id="ps-onboarding-popup"], [data-test-id="ps-offers-platforms-popup"]').forEach(el => {
          if (el.parentElement) el.parentElement.removeChild(el);
        });
      });
      await page.waitForTimeout(1000);

      // Click "Commence le sondage" / "Start survey" button in integration popup
      let integrationClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          const text = (btn.textContent || '').trim().toLowerCase();
          if (text.includes('commence') || text.includes('start survey') || text.includes('commencer')) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (integrationClicked) {
        await page.waitForTimeout(2000);

        // Dismiss onboarding again (often reappears)
        await page.evaluate(() => {
          document.querySelectorAll('[data-test-id="ps-onboarding-popup"]').forEach(el => {
            if (el.parentElement) el.parentElement.removeChild(el);
          });
        });
      }

      // ── Answer qualification questions ─────────────────────────────────
      // The integration popup may show qualification questions (gender, age, etc.)
      let qualAnswered = 0;
      for (let step = 0; step < 15; step++) {
        // Check for qualification popup
        const hasQual = await page.evaluate(() => {
          const wrapper = document.querySelector('[data-test-id="ps-question-answers-wrapper"], [data-test-id="ps-integration-questions-popup"]');
          return wrapper ? true : false;
        });

        if (!hasQual) break; // No more questions

        // Dismiss onboarding that might be covering it
        await page.evaluate(() => {
          document.querySelectorAll('[data-test-id="ps-onboarding-popup"]').forEach(el => {
            if (el.parentElement) el.parentElement.removeChild(el);
          });
        });

        // ── Scrape qualification options from the page ───────────────
        const qualOptions = await page.evaluate(() => {
          // Get all visible clickable options
          const items: { type: string; text: string; selector: string }[] = [];

          // Radio buttons
          const radios = document.querySelectorAll('[data-test-id^="ps-question-input-single_choice"]');
          radios.forEach(r => {
            const style = window.getComputedStyle(r);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              const text = (r.textContent || '').trim();
              if (text) items.push({ type: 'radio', text, selector: text.substring(0, 50) });
            }
          });

          // Checkboxes
          if (items.length === 0) {
            const boxes = document.querySelectorAll('[data-test-id^="ps-question-input-multi_choice"]');
            boxes.forEach(r => {
              const style = window.getComputedStyle(r);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                const text = (r.textContent || '').trim();
                if (text) items.push({ type: 'checkbox', text, selector: text.substring(0, 50) });
              }
            });
          }

          // Select dropdowns
          if (items.length === 0) {
            const selects = document.querySelectorAll('select');
            selects.forEach(sel => {
              const opts = sel.querySelectorAll('option');
              if (opts.length > 1) {
                for (let i = 1; i < opts.length; i++) {
                  const text = (opts[i].textContent || '').trim();
                  if (text) items.push({ type: 'select', text, selector: '' + i });
                }
              }
            });
          }

          return items;
        });

        // Match options using LLM for context-aware selection
        let chosenOption: { type: string; text: string; selector: string } | null = null;
        if (qualOptions.length > 0) {
          // Try LLM first for smarter selection
          try {
            const optionTexts = qualOptions.map(o => o.text);
            const llmAnswer = await pickBestOption(
              'Please select the most appropriate option for a market research survey qualification question.',
              optionTexts,
              'survey qualification'
            );
            // Find the option matching the LLM answer
            const matched = qualOptions.find(o => 
              o.text.toLowerCase() === llmAnswer.toLowerCase() ||
              o.text.toLowerCase().includes(llmAnswer.toLowerCase()) ||
              llmAnswer.toLowerCase().includes(o.text.toLowerCase())
            );
            if (matched) {
              chosenOption = matched;
              console.log(`[qual] LLM picked: "${llmAnswer}"`);
            }
          } catch {}
          
          // Fallback to persona pattern matching if LLM failed
          if (!chosenOption) {
            // Use the old PERSONA keyword matching as fallback
            const matchPrio = [
              { key: 'gender', keywords: [PERSONA.gender.toLowerCase()] },
              { key: 'age', keywords: [PERSONA.age] },
              { key: 'education', keywords: PERSONA.education.map(k => k.toLowerCase()) },
              { key: 'employment', keywords: PERSONA.employment.map(k => k.toLowerCase()) },
              { key: 'marital', keywords: PERSONA.maritalStatus.map(k => k.toLowerCase()) },
              { key: 'income', keywords: PERSONA.income.map(k => k.toLowerCase()) },
              { key: 'occupation', keywords: PERSONA.occupation.map(k => k.toLowerCase()) },
              { key: 'housing', keywords: PERSONA.housing.map(k => k.toLowerCase()) },
              { key: 'interests', keywords: PERSONA.interests.map(k => k.toLowerCase()) },
              { key: 'languages', keywords: PERSONA.languages.map(k => k.toLowerCase()) },
            ];
            for (const matcher of matchPrio) {
              chosenOption = qualOptions.find(o => matcher.keywords.some(k => o.text.toLowerCase().includes(k))) || null;
              if (chosenOption) break;
            }
            if (!chosenOption) {
              chosenOption = qualOptions[0];
            }
          }
        }

        if (chosenOption) {
          // Click the chosen option
          const clicked = await page.evaluate((opt: any) => {
            if (opt.type === 'select') {
              const selects = document.querySelectorAll('select');
              const idx = parseInt(opt.selector);
              if (selects.length > 0 && selects[0].options.length > idx) {
                selects[0].value = selects[0].options[idx].value;
                selects[0].dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              return false;
            }
            
            // For radio/checkbox: find by text content
            const els = document.querySelectorAll('[data-test-id^="ps-question-input-single_choice"], [data-test-id^="ps-question-input-multi_choice"]');
            for (const el of els) {
              const style = window.getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                const text = (el.textContent || '').trim();
                if (text === opt.text || text.startsWith(opt.text) || text.includes(opt.text)) {
                  const label = el.querySelector('label') || el;
                  (label as HTMLElement).click();
                  return true;
                }
              }
            }
            return false;
          }, chosenOption);

          if (clicked) {
            qualAnswered++;
            await sendStatus(ctx, `  📝 ${chosenOption.type}: ${chosenOption.text.substring(0, 40)}`);
            await page.waitForTimeout(1000 + Math.random() * 1000);
          }
        }

        // Try clicking "Suivant" / "Next" / "Valider" / "Continue" button
        const nextClicked = await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          for (const btn of Array.from(btns)) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (['suivant', 'next', 'valider', 'continue', 'terminer', 'finish', 'submit'].some(t => text.includes(t))) {
              if (!btn.hasAttribute('disabled') && !btn.classList.contains('p-btn--disabled')) {
                btn.click();
                return true;
              }
            }
          }
          // Fallback: try the main popup primary button
          const primaryBtns = document.querySelectorAll('.p-btn--primary:not([disabled])');
          for (const pb of Array.from(primaryBtns)) {
            const text = (pb.textContent || '').trim().toLowerCase();
            if (text && text.length < 30 && !text.includes('politique')) {
              (pb as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (nextClicked) {
          await page.waitForTimeout(2000);
        } else if (!chosenOption) {
          // No qualification question found and no next button — exit
          break;
        }
      }

      if (qualAnswered > 0) {
        await sendStatus(ctx, `📝 Qualification answers submitted (${qualAnswered} questions)`);
      }

      // ── Now wait for the actual survey to load ─────────────────────────
      await page.waitForTimeout(3000);

      // Wait for redirect or new page (survey opens in same page or new one)
      const pageContext = page.context();
      const allPages = pageContext.pages();
      const surveyPage = allPages.length > 1 ? allPages[allPages.length - 1] : page;
      
      // If same page, wait for navigation away from topsurveys.app
      if (surveyPage === page) {
        try {
          await page.waitForURL(/^(?!https:\/\/app\.topsurveys\.app\/).*/, { timeout: 15000 });
        } catch {
          // Stayed on same page — survey might be in an iframe or still loading
        }
      }
      
      await surveyPage.waitForLoadState('load').catch(() => {});
      await surveyPage.waitForTimeout(3000);

      // Check if survey loaded in an iframe
      const iframeSurvey = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        for (const f of Array.from(iframes)) {
          if (f.src && f.src !== 'about:blank') return f.src;
        }
        return null;
      });

      if (iframeSurvey) {
        await sendStatus(ctx, `📋 Survey loaded in iframe: ${iframeSurvey.substring(0, 80)}...`);
      }

      await sendStatus(ctx, `⏳ Completing: ${label}`);

      const completed = await attemptSurvey(surveyPage, chatId, ctx, label, chosenCard.duration || '5 min');

      if (completed) {
        sessionHistory.totalCompleted++;
        // Parse reward value (e.g. "1,14 €1,42 €" -> take first value)
        const rewardVal = parseSurveyReward(chosenCard.reward || '0');
        sessionHistory.totalEarned += rewardVal;
        await sendStatus(ctx, `✅ *Completed!* +${chosenCard.reward || '?'} 💰`);

        // Auto-withdrawal check
        if (CRYPTO_WALLET) {
          const newBalance = userData.balance !== undefined ? userData.balance : 0;
          if (newBalance >= WITHDRAWAL_THRESHOLD) {
            sendStatus(ctx, `💰 Balance €${newBalance} >= threshold — checking withdrawal...`);
            checkAndWithdraw(
              authToken!,
              savedCookies,
              savedLocalStorage,
              savedSessionStorage,
              newBalance,
              async (result) => {
                if (result.success) {
                  await sendStatus(ctx, `✅ *Withdrawal initiated!* TX: ${result.txHash || 'pending'}`);
                } else if (result.attempted) {
                  await sendStatus(ctx, `⚠️ Withdrawal: ${result.message}`);
                }
              }
            ).catch(() => {});
          }
        }

        return { completed: true, reward: chosenCard.reward || '' };
      } else {
        sessionHistory.totalScreened++;
        await sendStatus(ctx, `❌ Screened out: ${label}`);
        return { completed: false, reward: '' };
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (err: any) {
    sessionHistory.totalErrors++;
    await sendStatus(ctx, `⚠️ Error: ${label} — ${escMd(err.message)}`);
    return { completed: false, reward: '' };
  }
}

function parseSurveyReward(reward: string): number {
  // Parse "1,14 €1,42 €" or "1,14 €" to number
  const match = reward.match(/([\d.,]+)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(',', '.')) || 0;
}

function menu() {
  const btns: any[][] = [];
  if (!loggedIn) btns.push([{ text: '🔑 Login', callback_data: 'login' }]);
  else {
    btns.push([{ text: '📊 Dashboard', callback_data: 'dash' }]);
    btns.push([{ text: running ? '⏹ Stop' : '▶️ Start Auto', callback_data: 'toggle' }]);
    btns.push([{ text: '🔓 Logout', callback_data: 'logout' }]);
  }
  return { reply_markup: { inline_keyboard: btns } };
}

function escMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ─── Commands ─────────────────────────────────────────────────────────

bot.start(async ctx => {
  const name = ctx.from?.first_name || 'Trader';
  const status = loggedIn
    ? (running ? '🟢 Auto-survey running' : '⏸ Idle')
    : '❌ Not logged in';
  await ctx.reply(
    `🤖 *TopSurveys Auto-Bot*\n\nHi ${name}! I automate survey answering on TopSurveys.app.\n\n⏱ Auto-login on startup\n🔄 Auto re-login on session expiry\n📊 Shortest surveys first (quality > quantity)\n📊 Live progress: 10% → 20% → ... → 100%\n⏰ Listed duration + 2min buffer — no early cutoffs\n🚫 Stuck detection: 60s then silent refresh\n\nStatus: ${status}`,
    { parse_mode: 'Markdown', ...menu() }
  );
});

bot.action('login', async ctx => {
  await ctx.answerCbQuery();
  const msg = await ctx.reply('⏳ Logging in...');
  try {
    await doLogin();
    await ctx.telegram.editMessageText(
      ctx.chat!.id, msg.message_id, undefined,
      `✅ *Logged in successfully!*\n\nAccount: \`${EMAIL}\`\n\nUse Dashboard to check your stats.`,
      { parse_mode: 'Markdown', ...menu() }
    );
  } catch (err: any) {
    await ctx.telegram.editMessageText(
      ctx.chat!.id, msg.message_id, undefined,
      `❌ Login failed: ${escMd(err.message)}`,
      { parse_mode: 'Markdown', ...menu() }
    );
  }
});

bot.action('dash', async ctx => {
  await ctx.answerCbQuery();
  if (!loggedIn) return ctx.reply('❌ Not logged in.', menu());
  const msg = await ctx.reply('⏳ Fetching dashboard...');
  try {
    await refreshDashboard();
    await scrapeSurveys();
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined, formatDash(), {
      parse_mode: 'Markdown', ...menu()
    });
  } catch (err: any) {
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined, `❌ ${escMd(err.message)}`, menu());
  }
});

bot.action('toggle', async ctx => {
  await ctx.answerCbQuery();
  if (!loggedIn) return ctx.reply('❌ Not logged in.', menu());

  if (running) {
    running = false;
    return ctx.reply('⏹ Auto-survey stopped.', menu());
  }

  running = true;
  const chatId = ctx.chat!.id;
  // Reset session history
  sessionHistory = { totalCompleted: 0, totalScreened: 0, totalErrors: 0, totalEarned: 0, startTime: Date.now(), currentSurveyLabel: '' };
  await ctx.reply('🚀 *Auto-survey started!*\n\n📊 Shortest surveys first (quality > quantity)\n⏱ Listed duration + 2min buffer\n📊 Live progress: 10%, 20%, 30%...\n🔄 Stuck detection: 60s timeout, then refresh', { parse_mode: 'Markdown', ...menu() });

  (async () => {
    try {
      while (running) {
        // Ensure we're still logged in before doing anything
        const authOk = await ensureLoggedIn();
        if (!authOk) {
          await ctx.telegram.sendMessage(chatId, '❌ Login failed — auto-survey stopped.', { parse_mode: 'Markdown' });
          running = false;
          break;
        }

        // Refresh stats and scrape
        await refreshDashboard();
        await scrapeSurveys();

        if (scrapedSurveys.length === 0) {
          await ctx.telegram.sendMessage(chatId, '⏳ No surveys right now. Next check in 30s...', { parse_mode: 'Markdown' });
          for (let i = 0; i < 30 && running; i++) { await new Promise(r => setTimeout(r, 1000)); }
          continue;
        }

        // Filter out onboarding items and sort by duration (shortest first)
        const realSurveys = scrapedSurveys
          .filter(s => s.type !== 'onboarding' && s.duration)
          .sort((a: any, b: any) => parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration));
        
        if (realSurveys.length === 0) {
          await ctx.telegram.sendMessage(chatId, '⏳ No payable surveys. Next check in 30s...', { parse_mode: 'Markdown' });
          for (let i = 0; i < 30 && running; i++) { await new Promise(r => setTimeout(r, 1000)); }
          continue;
        }

        await ctx.telegram.sendMessage(chatId, `🔍 Found *${realSurveys.length}* survey(s)! Starting...`, { parse_mode: 'Markdown' });

        // Process each survey
        let completed = 0;
        let screened = 0;
        let errors = 0;
        let totalEarned = '';

        for (const survey of realSurveys) {
          if (!running) break;

          const result = await openAndTakeSurvey(ctx, survey, chatId);
          if (result.completed) {
            completed++;
            totalEarned = survey.reward || '';
          } else if (result.reward === '') {
            screened++;
          } else {
            errors++;
          }

          // Pause 15s between surveys to let proxy cool down
          for (let i = 0; i < 15 && running; i++) { await new Promise(r => setTimeout(r, 1000)); }
        }

        // Batch summary
        let summary = `📊 *Batch Complete*`;
        if (completed > 0) summary += `\n✅ Completed: ${completed}`;
        if (screened > 0) summary += `\n❌ Screened out: ${screened}`;
        if (errors > 0) summary += `\n⚠️ Errors: ${errors}`;
        if (totalEarned) summary += `\n💰 +${totalEarned}`;
        summary += `\n\n⏳ Next batch in 30s...`;

        await ctx.telegram.sendMessage(chatId, summary, { parse_mode: 'Markdown' });

        // Wait 30s before next batch
        for (let i = 0; i < 30 && running; i++) { await new Promise(r => setTimeout(r, 1000)); }
      }
      await ctx.telegram.sendMessage(chatId, '⏹ *Auto-survey stopped.*', { parse_mode: 'Markdown', ...menu() });
    } catch (err: any) {
      running = false;
      await ctx.reply(`❌ *Error:* ${escMd(err.message)}`, { parse_mode: 'Markdown', ...menu() }).catch(() => {});
    }
  })();
});

bot.action('logout', async ctx => {
  await ctx.answerCbQuery();
  loggedIn = false;
  running = false;
  authToken = null;
  userData = {};
  profileData = {};
  await ctx.reply('🔓 Logged out.', menu());
});

// ─── /withdraw command ─────────────────────────────────────────────────────

bot.command('withdraw', async ctx => {
  if (!loggedIn || !authToken) {
    return ctx.reply('❌ Not logged in. Use /start first.', menu());
  }

  if (!CRYPTO_WALLET) {
    return ctx.reply('⚠️ No wallet configured. Set CRYPTO_WALLET in .env', menu());
  }

  const msg = await ctx.reply('💰 Checking balance...');
  try {
    // Fetch fresh balance
    const res = await socksFetch('https://api.topsurveys.app/api/user', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error('API error');
    const data: any = await res.json();
    const balance = typeof data.balance === 'number' ? data.balance : 0;

    const info = getWithdrawalInfo(balance);

    if (!info.canWithdraw) {
      await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
        `💰 *Balance:* €${balance.toFixed(2)}\n⚠️ Need €${info.threshold.toFixed(2)} minimum to withdraw.\n📝 Set CRYPTO_WALLET in .env`,
        { parse_mode: 'Markdown', ...menu() }
      );
      return;
    }

    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
      `💰 Balance: €${balance.toFixed(2)}\n⏳ Attempting withdrawal to crypto wallet...`,
      { parse_mode: 'Markdown' }
    );

    const result = await attemptWithdrawal(
      authToken,
      savedCookies,
      savedLocalStorage,
      savedSessionStorage
    );

    const status = result.success ? '✅' : '❌';
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
      `${status} *Withdrawal:* ${result.message}`,
      { parse_mode: 'Markdown', ...menu() }
    );
  } catch (err: any) {
    await ctx.telegram.editMessageText(ctx.chat!.id, msg.message_id, undefined,
      `❌ Withdrawal failed: ${escMd(err.message)}`,
      { parse_mode: 'Markdown', ...menu() }
    );
  }
});

// ─── Document handler (PDF reading) ─────────────────────────────────────

bot.on('document', async ctx => {
  const doc = ctx.message.document;
  if (!doc) return;
  
  await ctx.reply(`📄 Received: ${doc.file_name} (${doc.file_size} bytes)\n⏳ Downloading...`);

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());
    
    const fs = await import('fs');
    const filePath = `/root/Survey-Bot/uploads/${doc.file_name}`;
    fs.mkdirSync('/root/Survey-Bot/uploads', { recursive: true });
    fs.writeFileSync(filePath, buffer);
    
    try {
      const { execSync } = await import('child_process');
      const text = execSync(`pdftotext "${filePath}" - 2>/dev/null || python3 -c "
import sys
try:
    import pdfplumber
    with pdfplumber.open('${filePath}') as pdf:
        for page in pdf.pages:
            print(page.extract_text() or '')
except:
    try:
        import PyPDF2
        with open('${filePath}', 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                print(page.extract_text() or '')
    except:
        print('Cannot extract text')
"`).toString().trim();
      
      if (text && text.length > 10) {
        const maxLen = 3500;
        const display = text.length > maxLen ? text.substring(0, maxLen) + `\n\n... (${text.length - maxLen} more chars)` : text;
        await ctx.reply(`📄 *${doc.file_name}* - Content:\n\n${display}`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`📄 File saved to \`${filePath}\` but couldn't extract text.\nSize: ${buffer.length} bytes`, { parse_mode: 'Markdown' });
      }
    } catch (extractErr: any) {
      await ctx.reply(`📄 File saved to \`${filePath}\`\nText extraction error: ${extractErr.message}`, { parse_mode: 'Markdown' });
    }
  } catch (err: any) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ─── Launch ───────────────────────────────────────────────────────────

(async () => {
  // Auto-login on startup
  console.log('[boot] attempting auto-login...');
  try {
    await doLogin();
    console.log('[boot] auto-login successful');
  } catch (err: any) {
    console.log('[boot] auto-login failed:', err.message);
    console.log('[boot] waiting for manual login via Telegram');
  }
  bot.launch();
  console.log('[topsurveys-bot] running');
})();

async function ensureLoggedIn(): Promise<boolean> {
  if (!authToken) {
    console.log('[auth] no token, re-logging in...');
    try {
      await doLogin();
      return true;
    } catch {
      return false;
    }
  }
  // Verify token is still valid by calling a lightweight endpoint
  try {
    const res = await socksFetch('https://api.topsurveys.app/api/user', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      console.log('[auth] token expired (HTTP ' + res.status + '), re-logging in...');
      try {
        await doLogin();
        return true;
      } catch {
        authToken = null;
        loggedIn = false;
        return false;
      }
    }
    return true;
  } catch {
    return loggedIn; // Network error — assume still logged in
  }
}

// Global error handler — prevent uncaught callback errors from crashing
bot.catch((err: any) => {
  console.error('[bot] unhandled error:', err?.response?.description || err?.message || err);
});

process.on('SIGINT', () => { stopBridge(); process.exit(0); });
process.on('SIGTERM', () => { stopBridge(); process.exit(0); });
process.on('exit', () => { stopBridge(); });