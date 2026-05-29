const { chromium } = require('playwright');
require('dotenv').config({ path: '/root/topsurveys-bot/.env' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Go to login page directly
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('1. URL:', page.url());

  // Step 1: Enter email
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill('Ugbekilemelvin@gmail.com');
  console.log('✅ Filled email');

  // Click Continue
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(3000);
  console.log('2. URL after email:', page.url());

  // Wait for signin page to render (password field)
  await page.waitForTimeout(3000);
  
  // Check if password input exists
  const pwInput = page.locator('input[type="password"]');
  if (await pwInput.isVisible().catch(() => false)) {
    await pwInput.fill('Test2026!');
    console.log('✅ Filled password');

    // Click the submit button
    const submitBtn = page.locator('[data-test-id="app-page-continue-button"], button[type="submit"], button:has-text("Continue")');
    await submitBtn.click();
    await page.waitForTimeout(3000);
    console.log('3. URL after password:', page.url());
    
    // Wait for dashboard to load
    await page.waitForTimeout(5000);
    console.log('4. URL after wait:', page.url());
  }

  // Extract visible text
  const visibleText = await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body, NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => {
          if (['NOSCRIPT','SCRIPT','STYLE'].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let text = '';
    let node;
    while ((node = walker.nextNode()) && text.length < 3000) {
      const t = node.textContent.trim();
      if (t) text += t + '\n';
    }
    return text;
  });
  console.log('\n=== VISIBLE TEXT ===');
  console.log(visibleText);

  // Check auth state
  const appKey = await page.evaluate(() => localStorage.getItem('app-key'));
  console.log(`\napp-key: "${appKey}"`);

  // Check all cookies again
  const cookies = await context.cookies();
  console.log('\n=== COOKIES ===');
  for (const c of cookies) {
    console.log(`  ${c.name}=${c.value.substring(0, 60)} (${c.domain})`);
  }

  await page.screenshot({ path: '/tmp/logged_in.png', fullPage: true });
  console.log('\n✅ Screenshot');

  await browser.close();
})();