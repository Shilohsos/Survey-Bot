import { chromium } from 'playwright';

async function main() {
  console.log('🚀 Launching...');
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // Capture ALL network responses
  const responses = {};
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('api.topsurveys.app')) {
      try {
        const json = await resp.json();
        responses[url.split('?')[0]] = json;
      } catch {}
    }
  });

  // Full login flow
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill('SurveyBot2026!');
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  // Navigate to dashboard and wait for all API calls
  console.log('📄 Loading dashboard...');
  await page.goto('https://app.topsurveys.app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Print all captured API responses
  console.log('\n📡 All API responses:');
  for (const [url, data] of Object.entries(responses)) {
    console.log(`\n🔸 ${url}`);
    console.log(JSON.stringify(data).substring(0, 500));
  }

  // Also check page DOM for survey-related data
  const domData = await page.evaluate(() => {
    // Look for survey-related elements
    const surveyElements = document.querySelectorAll('[class*="survey"], [class*="Survey"], [data-test*="survey"]');
    const texts = Array.from(surveyElements).map(el => el.textContent?.trim()).filter(Boolean);
    
    // Look for available count
    const matches = document.body?.innerText?.match(/(\d+)\s*survey|(\d+)\s*enquête|(\d+)\s*available/gi) || [];
    
    return {
      surveyElements: texts.slice(0, 10),
      surveyMatches: matches,
      bodySnippet: document.body?.innerText?.substring(0, 2000) || '', // Fixed: was innerText then substring
    };
  });

  console.log('\n📋 DOM survey data:', JSON.stringify(domData, null, 2));

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});