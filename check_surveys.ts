import { chromium } from 'playwright';
import 'dotenv/config';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // Login to TopSurveys
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  const loginResult = await page.evaluate(async ({ email, password }) => {
    const ck = await fetch('https://api.topsurveys.app/auth/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    const ckData = await ck.json();
    const lr = await fetch('https://api.topsurveys.app/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    return await lr.json();
  }, { email: process.env.TS_EMAIL!, password: process.env.TS_PASSWORD! });

  await context.addCookies([
    { name: 'auth-token', value: loginResult.token, domain: '.topsurveys.app', path: '/' },
    { name: 'localization', value: loginResult.locale || 'fr-fr', domain: '.topsurveys.app', path: '/' },
  ]);

  // Intercept ALL API calls
  const apiCalls: any[] = [];
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('api.topsurveys.app')) {
      try {
        const body = await resp.text();
        const json = JSON.parse(body);
        apiCalls.push({ url, status: resp.status(), method: resp.request().method(), data: json });
      } catch {
        apiCalls.push({ url, status: resp.status(), method: resp.request().method(), text: body?.substring(0, 100) });
      }
    }
  });

  // Navigate to surveys section
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click "Sondages" tab
  const sondagesBtn = page.locator('button:has-text("Sondages")').first();
  if (await sondagesBtn.isVisible().catch(() => false)) {
    await sondagesBtn.click();
    await page.waitForTimeout(5000);
  }

  console.log('=== API Calls (sorted) ===');
  // Filter to only show calls that happened after clicking sondages
  const afterClick = apiCalls.slice(apiCalls.length - 20);
  for (const c of afterClick) {
    console.log(`\n${c.method} ${c.status} ${c.url}`);
    if (c.data) {
      const keys = Object.keys(c.data);
      if (keys.length > 0) {
        console.log(`  Keys: ${keys.join(', ')}`);
        // Show first 200 chars of data
        console.log(`  Data: ${JSON.stringify(c.data).substring(0, 300)}`);
      }
    }
  }

  await browser.close();
}

main().catch(console.error);