import { chromium } from 'playwright';

const RESET_URL = 'https://app.topsurveys.app/reset-password?token=0e50e71090f796de7be95b79460ea6219f9090e032c17c694561ee7a136ec10f&email=Ugbekilemelvin%40gmail.com';
const NEW_PW = 'SurveyBot2026!';

async function main() {
  console.log('🚀 Launching browser via proxy bridge...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({ locale: 'fr-FR' });

  await page.goto(RESET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());

  // Check for password fields
  const pwInputs = page.locator('input[type="password"]');
  const count = await pwInputs.count();
  console.log(`Password inputs: ${count}`);

  if (count >= 2) {
    await pwInputs.nth(0).fill(NEW_PW);
    await pwInputs.nth(1).fill(NEW_PW);
    console.log('✅ Filled both password fields');
  }

  // Click submit
  const submitBtn = page.locator('[data-test="auth-reset-password-submit"], button[type="submit"]');
  if (await submitBtn.count() > 0) {
    await submitBtn.first().click();
    await page.waitForTimeout(5000);
  }

  const result = await page.evaluate(() => document.body?.innerText?.substring(0, 800) || '');
  console.log('Result:', result);
  console.log('URL:', page.url());

  if (result.includes('réinitialisé') || result.includes('reset') || result.includes('Gagne') || result.includes('Sondages')) {
    console.log('✅ Password reset appears successful!');
  }

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});