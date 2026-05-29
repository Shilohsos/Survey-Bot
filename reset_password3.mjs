import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Intercept network requests
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('topsurveys.app/api/')) {
      apiCalls.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
    }
  });

  // Go to login page
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill email and continue
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill(EMAIL);
  
  const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]');
  await continueBtn.click();
  
  await page.waitForTimeout(5000);
  
  console.log('URL after email:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
  console.log('Page text:', bodyText);

  // Check for password or reset options
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type,
      name: el.name,
      placeholder: el.placeholder,
      id: el.id,
    }));
  });
  console.log('Inputs:', JSON.stringify(inputs));

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(el => ({
      text: el.innerText?.trim(),
      type: el.type,
    }));
  });
  console.log('Buttons:', JSON.stringify(buttons));

  console.log('\n📡 API calls:');
  apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));

  await browser.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});