import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'SurveyBot2026!';

async function main() {
  console.log('🚀 Launching...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // Intercept ALL API requests
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api.topsurveys.app')) {
      apiCalls.push({
        method: req.method(),
        url: url,
        headers: req.headers(),
        body: req.postData(),
      });
    }
  });

  // Full login flow
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);

  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  console.log(`URL: ${page.url()}`);

  // Show the login-related API calls
  console.log('\n📡 Login API calls:');
  for (const c of apiCalls) {
    if (c.url.includes('/auth/')) {
      console.log(`\n${c.method} ${c.url}`);
      console.log('  Headers:', JSON.stringify(c.headers, null, 4));
      console.log('  Body:', c.body);
    }
  }

  // Also check what cookies we have
  const cookies = await page.context().cookies();
  console.log('\n🍪 Cookies:');
  for (const ck of cookies) {
    if (ck.name.includes('token') || ck.name.includes('auth') || ck.name.includes('session')) {
      console.log(`  ${ck.name}: ${ck.value.substring(0, 30)}...`);
    }
  }

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});