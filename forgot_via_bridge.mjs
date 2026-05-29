import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';

async function main() {
  console.log('🚀 Launching browser with proxy bridge...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();

  // Go to login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());

  // Click forgot password
  await page.locator('[data-test="auth-signin-forgot-password"]').click();
  await page.waitForTimeout(3000);
  
  console.log('URL after forgot:', page.url());
  const text = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
  console.log('Page:', text);

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});