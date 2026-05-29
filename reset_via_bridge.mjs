import { chromium } from 'playwright';

const RESET_URL = 'https://app.topsurveys.app/reset-password?token=59fda49d671f597487f29e1d7c027278531f09b3eb94636ab1ad171ddc17116b&email=Ugbekilemelvin%40gmail.com';
const NEW_PW = 'SurveyBot2026!';

async function main() {
  console.log('🚀 Launching browser with proxy bridge...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({ locale: 'fr-FR' });

  // Navigate to reset link
  await page.goto(RESET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
  console.log('Page:', bodyText);

  // Fill passwords
  await page.locator('[data-test-id="undefined-input"]').nth(0).fill(NEW_PW);
  await page.locator('[data-test-id="undefined-input"]').nth(1).fill(NEW_PW);
  console.log('✅ Filled passwords');

  // Click Continue
  await page.locator('[data-test="auth-reset-password-submit"]').click();
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
  console.log('Result:', result);
  console.log('URL:', page.url());

  // Check if we got redirected to dashboard
  if (result.includes('réinitialisé') || result.includes('reset')) {
    console.log('✅ Password reset confirmed!');
  } else {
    console.log('⚠️ Might need another approach');
  }

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});