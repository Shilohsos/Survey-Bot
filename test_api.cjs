const { chromium } = require('playwright');
require('dotenv').config({ path: '/root/topsurveys-bot/.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Capture login API response
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/auth/') || url.includes('/api/user') || url.includes('/user-meta')) {
      console.log(`\n🌐 ${resp.status()} ${url.replace(/token=[^&]+/, 'token=***')}`);
      const headers = resp.headers();
      if (headers['set-cookie']) console.log(`Set-Cookie: ${headers['set-cookie']}`);
      if (resp.status() < 300) {
        try {
          const json = await resp.json();
          console.log(`Body keys: ${Object.keys(json).join(', ')}`);
          console.log(`Body: ${JSON.stringify(json).substring(0, 300)}`);
        } catch {
          const text = await resp.text();
          console.log(`Body: ${text.substring(0, 200)}`);
        }
      }
    }
  });

  // LOGIN FLOW
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Step 1: Email
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(3000);

  // Step 2: Password - the signin page
  await page.locator('input[type="password"]').fill('Test2026!');
  await page.waitForTimeout(1000);

  // Click submit on signin page - try clicking "Se connecter" button
  // Use text match in French
  const submitBtn = page.locator('button:has-text("Se connecter")');
  if (await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click();
    console.log('✅ Clicked "Se connecter"');
  } else {
    // Fallback - click any submit button
    await page.locator('button[type="submit"], [data-test-id="app-page-continue-button"]').click();
    console.log('✅ Clicked fallback submit');
  }
  
  await page.waitForTimeout(5000);
  console.log('\nURL after login:', page.url());

  // Try API call from page context (credentials: 'include' sends cookies)
  const userData = await page.evaluate(async () => {
    try {
      const resp = await fetch('https://api.topsurveys.app/api/user', {
        credentials: 'include',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (resp.ok) {
        const data = await resp.json();
        return JSON.stringify(data).substring(0, 500);
      }
      return `HTTP ${resp.status}: ${await resp.text().catch(() => '')}`;
    } catch(e) { return `Error: ${e.message}`; }
  });
  console.log('\nUser API result:', userData);

  // Show all cookies
  const cookies = await context.cookies();
  console.log('\nALL COOKIES:');
  for (const c of cookies) {
    console.log(`  ${c.name}=${c.value.substring(0, 60)} (${c.domain}) ${c.httpOnly ? 'HttpOnly' : ''}`);
  }

  await browser.close();
})();