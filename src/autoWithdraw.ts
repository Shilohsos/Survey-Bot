import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { createStealthContext, applyAntiDetection, generateStealthConfig } from './stealthManager.js';

// ─── Configuration ───────────────────────────────────────────────────

const API_BASE = 'https://api.topsurveys.app';
const WITHDRAWAL_THRESHOLD = parseFloat(process.env.WITHDRAWAL_THRESHOLD || '5.0');
const CRYPTO_WALLET = process.env.CRYPTO_WALLET || '';

// ─── Types ───────────────────────────────────────────────────────────

export interface WithdrawalResult {
  attempted: boolean;
  success: boolean;
  balance: number;
  message: string;
  txHash?: string;
}

export interface BalanceInfo {
  balance: number;
  available: number;
  threshold: number;
  canWithdraw: boolean;
}

// ─── Balance Check ───────────────────────────────────────────────────

/**
 * Check if current balance meets withdrawal threshold.
 */
export function checkBalanceEligibility(balance: number, available?: number): BalanceInfo {
  const avail = available ?? balance;
  return {
    balance,
    available: avail,
    threshold: WITHDRAWAL_THRESHOLD,
    canWithdraw: avail >= WITHDRAWAL_THRESHOLD && CRYPTO_WALLET.length > 0,
  };
}

// ─── Auto-Withdrawal via Browser ─────────────────────────────────────

/**
 * Automate the withdrawal process via browser automation.
 * Navigates to TopSurveys payout page, fills wallet address, submits.
 */
export async function attemptWithdrawal(
  authToken: string,
  savedCookies: any[],
  savedLocalStorage: Record<string, string>,
  savedSessionStorage: Record<string, string>,
  walletAddress?: string
): Promise<WithdrawalResult> {
  const wallet = walletAddress || CRYPTO_WALLET;

  if (!wallet) {
    return {
      attempted: false,
      success: false,
      balance: 0,
      message: 'No crypto wallet configured. Set CRYPTO_WALLET in .env',
    };
  }

  // Check balance first via API
  const balance = await fetchBalance(authToken);
  if (balance === null) {
    return {
      attempted: false,
      success: false,
      balance: 0,
      message: 'Failed to fetch balance',
    };
  }

  if (balance < WITHDRAWAL_THRESHOLD) {
    return {
      attempted: false,
      success: false,
      balance,
      message: `Balance €${balance.toFixed(2)} below threshold €${WITHDRAWAL_THRESHOLD.toFixed(2)}`,
    };
  }

  // Try API-based withdrawal first (if endpoint exists)
  const apiResult = await tryApiWithdrawal(authToken, wallet, balance);
  if (apiResult.attempted) {
    return apiResult;
  }

  // Fallback: browser-based withdrawal
  console.log('[withdraw] balance eligible, launching browser...');
  return await browserWithdrawal(authToken, savedCookies, savedLocalStorage, savedSessionStorage, wallet, balance);
}

// ─── API Balance Check ───────────────────────────────────────────────

async function fetchBalance(authToken: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/api/user`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return typeof data.balance === 'number' ? data.balance : null;
  } catch {
    return null;
  }
}

// ─── API-Based Withdrawal (try known endpoints) ──────────────────────

async function tryApiWithdrawal(
  authToken: string,
  wallet: string,
  balance: number
): Promise<WithdrawalResult> {
  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  // Try common withdrawal endpoints
  const endpoints = [
    { url: `${API_BASE}/api/withdraw`, method: 'POST' },
    { url: `${API_BASE}/api/payout`, method: 'POST' },
    { url: `${API_BASE}/api/payments/withdraw`, method: 'POST' },
    { url: `${API_BASE}/api/wallet/withdraw`, method: 'POST' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers,
        body: JSON.stringify({
          amount: balance,
          address: wallet,
          currency: 'BTC',
          method: 'crypto',
        }),
      });

      if (res.ok) {
        const data: any = await res.json().catch(() => ({}));
        return {
          attempted: true,
          success: true,
          balance,
          message: `Withdrawal initiated via API: ${data.message || 'Success'}`,
          txHash: data.tx_id || data.transaction_id || data.id,
        };
      }

      // 404 = endpoint doesn't exist, continue trying
      if (res.status === 404) continue;

      // 4xx = endpoint exists but request invalid — keep for browser fallback
      if (res.status >= 400 && res.status < 500) {
        console.log(`[withdraw] API endpoint ${ep.url} returned ${res.status}`);
        continue;
      }
    } catch {
      continue;
    }
  }

  return { attempted: false, success: false, balance, message: 'No API endpoint found' };
}

// ─── Browser-Based Withdrawal ────────────────────────────────────────

async function browserWithdrawal(
  authToken: string,
  savedCookies: any[],
  savedLocalStorage: Record<string, string>,
  savedSessionStorage: Record<string, string>,
  wallet: string,
  balance: number
): Promise<WithdrawalResult> {
  const stealthConfig = generateStealthConfig();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const { context } = await createStealthContext(browser, stealthConfig);
    const page = await context.newPage();
    applyAntiDetection(page);

    // Set auth cookies
    await context.addCookies(savedCookies);

    // Restore localStorage/sessionStorage
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.evaluate((ls) => {
      for (const [k, v] of Object.entries(ls)) {
        try { localStorage.setItem(k, v); } catch {}
      }
    }, savedLocalStorage);
    await page.evaluate((ss) => {
      for (const [k, v] of Object.entries(ss)) {
        try { sessionStorage.setItem(k, v); } catch {}
      }
    }, savedSessionStorage);

    // Navigate to payout/wallet section
    const payoutUrls = [
      'https://app.topsurveys.app/wallet',
      'https://app.topsurveys.app/payout',
      'https://app.topsurveys.app/withdraw',
      'https://app.topsurveys.app/settings/payments',
    ];

    for (const url of payoutUrls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Check if we're on a valid page (not redirected to login)
      const currentUrl = page.url();
      if (currentUrl.includes('app-login') || currentUrl.includes('signin')) continue;

      // Look for withdrawal form elements
      const hasForm = await page.evaluate(() => {
        const body = document.body?.innerText?.toLowerCase() || '';
        return body.includes('wallet') || body.includes('payout') || body.includes('withdraw') || body.includes('retrait');
      });

      if (hasForm) {
        console.log(`[withdraw] found payout page: ${currentUrl}`);
        // Try to find and fill wallet/withdrawal elements
        const result = await fillWithdrawalForm(page, wallet, balance);
        await browser.close();
        return result;
      }
    }

    await browser.close();
    return {
      attempted: true,
      success: false,
      balance,
      message: 'Could not locate withdrawal page on TopSurveys',
    };
  } catch (err: any) {
    await browser.close().catch(() => {});
    return {
      attempted: true,
      success: false,
      balance,
      message: `Withdrawal error: ${err.message}`,
    };
  }
}

// ─── Withdrawal Form Filler ──────────────────────────────────────────

async function fillWithdrawalForm(
  page: Page,
  wallet: string,
  balance: number
): Promise<WithdrawalResult> {
  try {
    // Look for input fields
    const inputs = await page.$$('input[type="text"], input[type="number"], textarea');

    let filled = false;
    for (const input of inputs) {
      const placeholder = await input.getAttribute('placeholder').catch(() => '') || '';
      const label = await input.evaluate(el => {
        const parent = el.parentElement;
        if (parent) return parent.textContent?.toLowerCase() || '';
        return '';
      }).catch(() => '');

      const allText = placeholder + ' ' + label;

      if (allText.includes('wallet') || allText.includes('address') || allText.includes('btc') ||
          allText.includes('bitcoin') || allText.includes('crypto') || allText.includes('adresse')) {
        await input.fill(wallet);
        filled = true;
        await page.waitForTimeout(500);
      } else if (allText.includes('amount') || allText.includes('montant') || allText.includes('withdraw')) {
        await input.fill(balance.toFixed(2));
        await page.waitForTimeout(500);
      }
    }

    // Click submit button
    const submitBtn = page.locator('button[type="submit"], button:has-text("Withdraw"), button:has-text("Retrait"), button:has-text("Payout"), button:has-text("Confirm")');
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
      await page.waitForTimeout(3000);

      // Check for success indicators
      const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      if (bodyText.includes('success') || bodyText.includes('completed') || bodyText.includes('confirmé')) {
        return {
          attempted: true,
          success: true,
          balance,
          message: 'Withdrawal submitted successfully via browser',
        };
      }
    }

    return {
      attempted: true,
      success: filled,
      balance,
      message: filled ? 'Form filled but could not confirm submission' : 'Could not find withdrawal form fields',
    };
  } catch (err: any) {
    return {
      attempted: true,
      success: false,
      balance,
      message: `Form error: ${err.message}`,
    };
  }
}
