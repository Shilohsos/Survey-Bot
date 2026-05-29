import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

const EMAIL = process.env.TS_EMAIL || '';
const PASSWORD = process.env.TS_PASSWORD || '';
const PROXY = process.env.PROXY || '';
const PROXY_USER = process.env.PROXY_USER || '';
const PROXY_PASS = process.env.PROXY_PASS || '';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let dashboardPage: Page | null = null;
let authToken: string = '';

// ─── Browser Lifecycle ─────────────────────────────────────────────────

function buildProxyConfig() {
  if (!PROXY) return undefined;
  let proxyUrl = PROXY;
  if (PROXY_USER && PROXY_PASS) {
    proxyUrl = PROXY.replace('://', `://${PROXY_USER}:${PROXY_PASS}@`);
  }
  return { server: proxyUrl };
}

async function loginPlaywright(): Promise<string> {
  const proxyConfig = buildProxyConfig();
  const launchOptions: any = { headless: true, args: ['--no-sandbox'] };
  if (proxyConfig) launchOptions.proxy = proxyConfig;

  browser = await chromium.launch(launchOptions);
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-FR',
  });

  const page = await context.newPage();

  // Login via page context (fetch works here)
  const loginResult = await page.evaluate(async ({ email, password }) => {
    const checkResp = await fetch('https://api.topsurveys.app/auth/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const checkData = await checkResp.json();
    if (!checkData.exists) throw new Error('Account not found');

    const loginResp = await fetch('https://api.topsurveys.app/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return await loginResp.json();
  }, { email: EMAIL, password: PASSWORD });

  const token: string = loginResult.token;
  if (!token) throw new Error('Login failed');

  // Set cookies for the Vue app
  await context.addCookies([
    { name: 'auth-token', value: token, domain: '.topsurveys.app', path: '/' },
    { name: 'localization', value: loginResult.locale || 'fr-fr', domain: '.topsurveys.app', path: '/' },
  ]);

  // Load dashboard to establish session
  dashboardPage = await context.newPage();
  await dashboardPage.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 30000 });
  await dashboardPage.waitForTimeout(5000);

  authToken = token;
  await page.close();
  return token;
}

// ─── API calls via browser ─────────────────────────────────────────────

function ensureLoggedIn() {
  if (!context || !dashboardPage) throw new Error('Not logged in. Call init() first.');
}

async function fetchFromApp(endpoint: string): Promise<any> {
  ensureLoggedIn();
  
  // Open a new page, navigate to the app, and intercept the API response
  const page = await context!.newPage();
  
  return new Promise<any>(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      page.close().catch(() => {});
      reject(new Error(`API timeout: ${endpoint}`));
    }, 30000);

    page.on('response', async (resp) => {
      if (resp.url().includes(endpoint)) {
        clearTimeout(timeout);
        try {
          const data = await resp.json();
          await page.close();
          resolve(data);
        } catch {
          await page.close();
          reject(new Error(`Failed to parse API response from ${endpoint}`));
        }
      }
    });

    try {
      await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 25000 });
    } catch {
      // Page might still load, wait for the API response
    }
  });
}

// ─── Public API ────────────────────────────────────────────────────────

let _initialized = false;

export async function init() {
  if (_initialized) return;
  await loginPlaywright();
  _initialized = true;
}

export async function login(email: string, password: string) {
  // Browser-based login - just delegate to init
  await init();
  return {
    token: authToken,
    email: EMAIL,
    balance: 'N/A',
    user: { name: email },
    available: 'N/A',
  };
}

export async function getDashboardData(): Promise<{
  balance: string;
  available: string;
  completed_today: number;
  total_earned: string;
  streak: string;
}> {
  ensureLoggedIn();
  
  // Use intercept approach - reload the dashboard page and capture API responses
  const results: Record<string, any> = {};
  let responseCount = 0;
  
  const page = await context!.newPage();
  
  return new Promise<any>(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      page.close().catch(() => {});
      if (results.user || results.profile) {
        resolve(formatDashboard(results));
      } else {
        reject(new Error('Dashboard API timeout'));
      }
    }, 25000);

    page.on('response', async (resp) => {
      const url = resp.url();
      if (url.includes('/api/user')) {
        try { results.user = await resp.json(); responseCount++; } catch {}
      }
      if (url.includes('/api/profile')) {
        try { results.profile = await resp.json(); responseCount++; } catch {}
      }
      // Once we have both responses, resolve
      if (results.user && results.profile) {
        clearTimeout(timeout);
        await page.close();
        resolve(formatDashboard(results));
      }
    });

    try {
      await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 20000 });
    } catch {}
  });
}

function formatDashboard(results: Record<string, any>): {
  balance: string;
  available: string;
  completed_today: number;
  total_earned: string;
  streak: string;
} {
  const user = results.user || {};
  const profile = results.profile || {};
  const balance = user.balance !== undefined ? `${user.balance} EUR` : 'N/A';
  const available = profile.available_surveys ?? 'N/A';
  const completed_today = profile.completed_today ?? 0;
  const total_earned = user.balance ? `${user.balance} EUR` : '0.00 EUR';
  const streak = user.current_streak ?? 'N/A';
  return { balance, available, completed_today, total_earned, streak };
}

export async function getAvailableSurveys(): Promise<any[]> {
  const data = await getDashboardData();
  // The available_surveys count is in the profile
  // For actual survey list, we need a different endpoint
  return [];
}

// ─── Cleanup ──────────────────────────────────────────────────────────

export async function close() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
    dashboardPage = null;
    _initialized = false;
  }
}