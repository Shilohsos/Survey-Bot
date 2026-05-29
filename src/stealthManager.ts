import type { BrowserContext, Page, Browser } from 'playwright';

// ─── User Agent Pool ─────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
];

// ─── Viewport Pool ───────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
];

// ─── Geolocation Pool ────────────────────────────────────────────────

const GEOLOCATIONS = [
  { latitude: 48.8566, longitude: 2.3522 },  // Paris
  { latitude: 45.7640, longitude: 4.8357 },  // Lyon
  { latitude: 43.2965, longitude: 5.3698 },  // Marseille
  { latitude: 48.6921, longitude: 6.1844 },  // Nancy
];

// ─── Random Helpers ──────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Stealth Configuration Builder ───────────────────────────────────

export interface StealthConfig {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string;
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
  extraHttpHeaders?: Record<string, string>;
}

/**
 * Generate a randomised stealth configuration for a new browser context.
 * Each call returns a different combination to avoid fingerprinting.
 */
export function generateStealthConfig(): StealthConfig {
  const userAgent = pick(USER_AGENTS);
  const viewport = pick(VIEWPORTS);
  const geo = pick(GEOLOCATIONS);

  return {
    userAgent,
    viewport,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    geolocation: geo,
    permissions: ['geolocation'],
    extraHttpHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'Sec-CH-UA': '"Chromium";v="125", "Google Chrome";v="125"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': userAgent.includes('Windows') ? '"Windows"' : userAgent.includes('Mac') ? '"macOS"' : '"Linux"',
    },
  };
}

// ─── Context Builder ─────────────────────────────────────────────────

/**
 * Create a browser context with full stealth configuration applied.
 */
export async function createStealthContext(
  browser: Browser,
  existingConfig?: StealthConfig
): Promise<{ context: BrowserContext; config: StealthConfig }> {
  const config = existingConfig || generateStealthConfig();

  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: config.viewport,
    locale: config.locale,
    timezoneId: config.timezoneId,
    geolocation: config.geolocation,
    permissions: config.permissions,
    extraHTTPHeaders: config.extraHttpHeaders,
    // Block known detection vectors
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });

  return { context, config };
}

// ─── Anti-Detection Scripts ──────────────────────────────────────────

/**
 * Apply anti-detection measures to a page via addInitScript.
 * This runs before any page JavaScript, hiding automation indicators.
 */
export function applyAntiDetection(page: Page): void {
  // Override navigator.webdriver
  page.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });

    // Override plugins array to look like a real browser
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ] as any,
      configurable: true,
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['fr-FR', 'fr', 'en-US', 'en'],
      configurable: true,
    });

    // Mock chrome.runtime to appear as a legit extension
    (window as any).chrome = {
      runtime: {
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        connect: () => null,
        sendMessage: () => null,
        onMessage: { addListener: () => {} },
        onConnect: { addListener: () => {} },
      },
    };

    // Override toString on Function to hide headless
    const origToString = Function.prototype.toString;
    Function.prototype.toString = function (this: any) {
      if (this === navigator.webdriver) {
        return 'function webdriver() { [native code] }';
      }
      return origToString.call(this);
    } as any;

    // Override permissions query to avoid headless detection
    const origQuery = (window as any).navigator.permissions?.query;
    if (origQuery) {
      (window as any).navigator.permissions.query = (params: any) => {
        if (params.name === 'notifications') {
          return Promise.resolve({ state: 'prompt', onchange: null } as PermissionStatus);
        }
        return origQuery(params);
      };
    }

    // WebGL fingerprint randomisation (slight variation)
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      if (gl) {
        const renderer = (gl.getParameter(gl.RENDERER) || '') as string;
        const vendor = (gl.getParameter(gl.VENDOR) || '') as string;
        // Store original values but don't modify — just having WebGL available
        // is usually enough. We log to show it's there.
      }
    } catch {}
  });

  // Add random human-like delays to mouse movements
  page.addInitScript(() => {
    const originalMouseEvent = MouseEvent.prototype;
    // No modifications needed — Playwright's built-in click is good enough
  });
}

// ─── Human-like Typing ───────────────────────────────────────────────

/**
 * Type text into an element with human-like delays between characters.
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const element = page.locator(selector);
  await element.click();
  await page.waitForTimeout(randomBetween(100, 300));

  for (const char of text) {
    await element.press(char, { delay: randomBetween(30, 150) });
  }
}

// ─── Mouse Movement Simulation ───────────────────────────────────────

/**
 * Move mouse to a random position on the page before clicking.
 */
export async function simulateMouseMovement(page: Page): Promise<void> {
  const x = randomBetween(100, 800);
  const y = randomBetween(100, 600);
  await page.mouse.move(x, y, { steps: randomBetween(5, 15) });
  await page.waitForTimeout(randomBetween(50, 200));
}
