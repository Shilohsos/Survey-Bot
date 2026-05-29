import { chromium } from 'playwright';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { spawn } from 'child_process';

async function main() {
  console.log('🚀 Starting bridge...');
  const bridge = spawn('node', ['proxy_bridge.mjs'], {
    cwd: '/root/topsurveys-bot',
    stdio: 'pipe',
  });
  await new Promise(r => setTimeout(r, 2000));

  try {
    // Login via Playwright through bridge
    console.log('🌐 Logging in via browser...');
    const browser = await chromium.launch({
      headless: true,
      proxy: { server: 'socks5://127.0.0.1:10801' },
      args: ['--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);

    await page.locator('input[type="password"]').fill('SurveyBot2026!');
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    const cookies = await page.context().cookies();
    const authCookie = cookies.find(c => c.name === 'auth-token');
    if (!authCookie) {
      console.log('❌ Login failed');
      return;
    }

    const token = decodeURIComponent(authCookie.value);
    console.log('✅ Logged in! Token:', token.substring(0, 30) + '...');
    console.log('🍪 Cookie domain:', authCookie.domain);

    // Now use token for API calls via socks-proxy-agent
    const agent = new SocksProxyAgent('socks5://kelvin:kelvin@159.100.17.112:9000');
    const headers = { Authorization: 'Bearer ' + token };

    const pRes = await fetch('https://api.topsurveys.app/api/profile', { headers, agent });
    const profile = await pRes.json();
    console.log('\n📊 Profile:', JSON.stringify(profile, null, 2));

    const uRes = await fetch('https://api.topsurveys.app/api/user', { headers, agent });
    const user = await uRes.json();
    console.log('\n💰 Balance:', user.balance, '€');
    console.log('📋 Completed surveys:', user.stats?.surveys?.completed || profile.stats?.surveys?.completed || 0);

    await browser.close();
    console.log('\n✅ Full flow works!');
  } finally {
    bridge.kill();
  }
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});