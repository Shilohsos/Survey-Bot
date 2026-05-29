import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Intercept API calls to find the password reset endpoint
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('topsurveys.app/api/')) {
      apiCalls.push({ url: req.url(), method: req.method(), body: req.postData() });
    }
  });

  // Go to login page
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('URL:', page.url());
  
  // Get all links and buttons on the page
  const elements = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a, button')).map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim() || '',
      href: el.href || '',
      id: el.id || '',
      className: el.className || '',
    }));
    return allLinks;
  });
  console.log('Page elements:');
  elements.forEach(e => console.log(`  ${e.tag}: "${e.text}" href="${e.href}" class="${e.className}"`));

  // Get the full HTML of the login form
  const html = await page.evaluate(() => document.querySelector('main, .login, form, [class*="login"], [class*="auth"]')?.innerHTML || document.body.innerHTML.substring(0, 3000));
  console.log('\nLogin area HTML:', html.substring(0, 2000));

  // Try to find "Forgot password" link
  const forgot = page.locator('text=/mot de passe|forgot|password/i');
  const forgotCount = await forgot.count();
  console.log(`\nForgot password links found: ${forgotCount}`);
  if (forgotCount > 0) {
    for (let i = 0; i < forgotCount; i++) {
      const text = await forgot.nth(i).innerText();
      const href = await forgot.nth(i).getAttribute('href');
      console.log(`  [${i}] text="${text}" href="${href}"`);
    }
  }

  await browser.close();
  console.log('\n📡 API calls intercepted:');
  apiCalls.forEach(c => console.log(`  ${c.method} ${c.url}`));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});