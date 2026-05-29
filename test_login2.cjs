const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ proxy: { server: 'socks5://127.0.0.1:10801' } });
  const page = await ctx.newPage();
  
  await page.goto('https://www.topsurveys.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('1. URL:', page.url());

  // Step 1: Enter email
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill('Ugbekilemelvin@gmail.com');
  console.log('2. Filled email');
  
  // Check for submit/next button
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent?.trim() || '',
      type: b.type || ''
    }));
  });
  console.log('3. BUTTONS:', JSON.stringify(buttons));

  // Try clicking the blue continue button
  const contBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), .p-button');
  await contBtn.first().click();
  console.log('4. Clicked continue');
  await page.waitForTimeout(3000);

  console.log('5. URL after click:', page.url());
  
  // Check if password input appeared
  const inputs2 = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(e => ({
      type: e.type || '',
      name: e.name || '',
      placeholder: e.placeholder || '',
      id: e.id || ''
    }));
  });
  console.log('6. INPUTS after:', JSON.stringify(inputs2));
  
  const html2 = await page.content();
  // Check for password-related text
  const hasPasswordField = html2.includes('password') || html2.includes('Password');
  console.log('7. Has password field?', hasPasswordField);

  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });