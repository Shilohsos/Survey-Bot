import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Intercept network requests
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('topsurveys.app/api/') || req.url().includes('topsurveys.app/auth/')) {
      apiCalls.push({ url: req.url(), method: req.method(), body: req.postData() });
    }
  });

  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill email
  await page.locator('input[type="email"]').fill(EMAIL);
  
  // Click Continue button using the data-test-id
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1500) || '');
  console.log('Page text:', bodyText);

  // Check all inputs and buttons
  const details = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type, name: el.name, placeholder: el.placeholder,
      id: el.id, 'data-test': el.getAttribute('data-test'),
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map(el => ({
      text: el.innerText?.trim(), type: el.type,
      'data-test': el.getAttribute('data-test'), 'data-test-id': el.getAttribute('data-test-id'),
    }));
    return { inputs, buttons };
  });
  console.log('\nAfter email input:');
  console.log('Inputs:', JSON.stringify(details.inputs, null, 2));
  console.log('Buttons:', JSON.stringify(details.buttons, null, 2));

  console.log('\n📡 API calls during process:');
  apiCalls.forEach(c => console.log(`  ${c.method} ${c.url} body:${c.body || 'N/A'}`));

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});