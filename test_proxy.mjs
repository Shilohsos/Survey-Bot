import { chromium } from 'playwright';

const PROXY_SERVER = 'socks5://159.100.17.112:9000';
const PROXY_USER = 'kelvin';
const PROXY_PASS = 'kelvin';
const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'Test2026!';

async function main() {
  console.log('🚀 Launching browser with proxy...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: PROXY_SERVER, username: PROXY_USER, password: PROXY_PASS },
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'fr-FR',
  });

  const page = await context.newPage();

  // Navigate to login
  console.log('📄 Navigating to login...');
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'load', timeout: 30000 });
  console.log('✅ Login page loaded');

  // Login via API
  console.log('🔐 Logging in...');
  const result = await page.evaluate(async ({ email, pw }) => {
    const ck = await fetch('https://api.topsurveys.app/auth/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const ckData = await ck.json();
    console.log('Check result:', JSON.stringify(ckData));
    if (!ckData.exists) throw new Error('Account not found');

    const lr = await fetch('https://api.topsurveys.app/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    return await lr.json();
  }, { email: EMAIL, pw: PASSWORD });

  const token = result.token;
  if (!token) throw new Error('Login failed: ' + JSON.stringify(result));
  console.log('✅ Logged in! Token:', token.substring(0, 20) + '...');

  // Set cookies
  await context.addCookies([
    { name: 'auth-token', value: token, domain: '.topsurveys.app', path: '/' },
    { name: 'localization', value: result.locale || 'fr-fr', domain: '.topsurveys.app', path: '/' },
  ]);

  // Navigate to dashboard
  console.log('📄 Loading dashboard...');
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('✅ Dashboard loaded');

  // Wait a bit and check for API responses
  await page.waitForTimeout(5000);

  // Check page content
  const title = await page.title();
  console.log('📌 Page title:', title);

  // Try to find survey-related elements
  const surveyElements = await page.evaluate(() => {
    const surveyTexts = [];
    const allText = document.body?.innerText || '';
    // Look for survey-related text
    const surveyMatch = allText.match(/survey|enquête|sondage/gi);
    if (surveyMatch) surveyTexts.push(...surveyMatch);
    
    // Look for the available surveys count
    const availableMatch = allText.match(/available|disponible|comple.t/gi);
    if (availableMatch) surveyTexts.push(...availableMatch);
    
    return {
      bodyText: allText.substring(0, 2000),
      surveyMentions: [...new Set(surveyTexts.map(s => s.toLowerCase()))],
    };
  });

  console.log('📊 Page content (first 2000 chars):');
  console.log(surveyElements.bodyText);
  console.log('🔍 Survey mentions:', surveyElements.surveyMentions);

  // Also intercept API responses to find available surveys
  console.log('\n🔄 Reloading to capture API...');
  const apiResults = {};
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/user')) {
      try {
        const data = await resp.json();
        apiResults.user = data;
        console.log('📡 /api/user captured');
      } catch {}
    }
    if (url.includes('/api/profile')) {
      try {
        const data = await resp.json();
        apiResults.profile = data;
        console.log('📡 /api/profile captured');
      } catch {}
    }
  });

  await page.goto('https://app.topsurveys.app/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log('\n📡 API Results:', JSON.stringify(apiResults, null, 2));

  await browser.close();
  console.log('🏁 Done');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});