import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'SurveyBot2026!';

async function main() {
  console.log('🚀 Launching browser via proxy bridge...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage({ locale: 'fr-FR' });

  // Go to login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill email and continue
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(3000);

  // Now at signin page - fill password
  console.log('URL:', page.url());
  const pwInput = page.locator('input[type="password"]');
  await pwInput.fill(PASSWORD);

  // Click "Se connecter" 
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => document.body?.innerText?.substring(0, 1500) || '');
  console.log('Result:', result);
  console.log('URL:', page.url());

  // Check if we got to dashboard (success = contains Gagne/Sondages/Compte)
  if (result.includes('Solde') || result.includes('Gagne')) {
    console.log('✅ LOGIN SUCCESSFUL!');
  } else if (result.includes('incorrect')) {
    console.log('❌ Password still incorrect');
  }

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});