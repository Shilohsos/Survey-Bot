import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Intercept requests
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('topsurveys.app')) {
      apiCalls.push({ url: req.url(), method: req.method(), body: req.postData() });
    }
  });

  // Go to login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill email & continue
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(3000);

  console.log('Page:', page.url());

  // Click "Forgot password" button
  const forgotBtn = page.locator('[data-test="auth-signin-forgot-password"]');
  const forgotCount = await forgotBtn.count();
  console.log(`Forgot password buttons: ${forgotCount}`);
  
  if (forgotCount > 0) {
    await forgotBtn.click();
    await page.waitForTimeout(5000);
    
    console.log('After forgot click URL:', page.url());
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1500) || '');
    console.log('Page text:', bodyText);
    
    // Check what's on the page now
    const details = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
        type: el.type, name: el.name, 'data-test': el.getAttribute('data-test'),
      }));
      const buttons = Array.from(document.querySelectorAll('button')).map(el => ({
        text: el.innerText?.trim(), type: el.type, 'data-test': el.getAttribute('data-test'),
        'data-test-id': el.getAttribute('data-test-id'),
      }));
      return { inputs, buttons, text: document.body?.innerText?.substring(0, 1000) };
    });
    console.log('\nAfter forgot click:');
    console.log('Inputs:', JSON.stringify(details.inputs, null, 2));
    console.log('Buttons:', JSON.stringify(details.buttons, null, 2));
    console.log('Text:', details.text);
  }

  console.log('\n📡 All API calls:');
  apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});