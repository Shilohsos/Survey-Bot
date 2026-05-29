import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Go to reset password
  console.log('📄 Going to reset password page...');
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "Forgot password?" link
  const forgotLink = page.locator('a', { hasText: /mot de passe|password|forgot/i });
  if (await forgotLink.count() > 0) {
    await forgotLink.first().click();
    console.log('✅ Clicked forgot password link');
    await page.waitForTimeout(3000);
  }

  // Check current URL/page content
  console.log('URL:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
  console.log('Page text:', bodyText);

  // Try to find email input and submit
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    console.log('✅ Filled email');

    const submitBtn = page.locator('button[type="submit"], button:has-text("envoyer"), button:has-text("reset"), button:has-text("send")');
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
      console.log('✅ Clicked submit');
      await page.waitForTimeout(5000);
      const result = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      console.log('Result:', result);
    }
  }

  await browser.close();
  console.log('🏁 Done');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});