import { chromium } from 'playwright';
import { SocksProxyAgent } from 'socks-proxy-agent';

const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'SurveyBot2026!';
const PROXY = 'socks5://kelvin:kelvin@159.100.17.112:9000';

async function main() {
  console.log('🚀 Logging in via browser...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  // Get the auth-token cookie
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name === 'auth-token');
  
  if (authCookie) {
    const token = decodeURIComponent(authCookie.value);
    console.log('✅ Got token from cookie:', token.substring(0, 40) + '...');

    // Now use this token with Node.js fetch + socks-proxy-agent
    const agent = new SocksProxyAgent(PROXY);
    const headers = {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
    };

    // Test API calls
    const pRes = await fetch('https://api.topsurveys.app/api/profile', { headers, agent });
    const profile = await pRes.json();
    console.log('\n📊 Profile:', JSON.stringify(profile, null, 2));

    const uRes = await fetch('https://api.topsurveys.app/api/user', { headers, agent });
    const user = await uRes.json();
    console.log('\n👤 User balance:', user.balance);

    // Also try to find available surveys
    console.log('\n🔍 Checking available surveys...');
    const eps = ['/api/surveys', '/api/available-surveys', '/api/offers', '/api/survey/available', '/api/offers/available'];
    for (const ep of eps) {
      try {
        const r = await fetch('https://api.topsurveys.app' + ep, { headers, agent });
        const text = await r.text();
        console.log(`  ${ep} [${r.status}]: ${text.substring(0, 200)}`);
      } catch(e) {
        console.log(`  ${ep}: ERROR ${e.message}`);
      }
    }
  } else {
    console.log('❌ No auth-token cookie found');
  }

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});