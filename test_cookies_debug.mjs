import { chromium } from 'playwright';

const EMAIL = 'Ugbekilemelvin@gmail.com';
const PASSWORD = 'TopSurveyBot2026!';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  // Step 1: Login and save ALL cookies
  const loginPage = await browser.newPage({ locale: 'fr-FR' });
  await loginPage.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loginPage.waitForTimeout(2000);
  await loginPage.locator('[data-test-id="app-page-email-field-input"]').fill(EMAIL);
  await loginPage.locator('[data-test-id="app-page-continue-button"]').click();
  await loginPage.waitForTimeout(3000);
  await loginPage.locator('input[type="password"]').fill(PASSWORD);
  await loginPage.locator('[data-test="auth-signup-submit"], [data-test="auth-signin-submit"]').click();
  await loginPage.waitForTimeout(5000);

  const allCookies = await loginPage.context().cookies();
  console.log('=== Saved Cookies ===');
  allCookies.forEach(c => console.log(`  ${c.name} = ${c.value.substring(0,30)}... domain:${c.domain} path:${c.path}`));

  // Check localStorage too
  const ls = await loginPage.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key)?.substring(0, 80);
    }
    return items;
  });
  console.log('\n=== localStorage (keys with token/auth) ===');
  Object.entries(ls).forEach(([k, v]) => {
    if (k.includes('auth') || k.includes('token') || k.includes('user') || k.includes('session')) {
      console.log(`  ${k} = ${v}`);
    }
  });

  // Step 2: Close login page, open new context with cookies
  await loginPage.close();
  
  // Step 3: New context with ALL cookies
  const ctx2 = await browser.newContext();
  for (const c of allCookies) {
    await ctx2.addCookies([c]);
  }
  const p2 = await ctx2.newPage();
  
  console.log('\n=== New context with ALL cookies ===');
  await p2.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForTimeout(3000);
  
  console.log('URL:', p2.url());
  const bodyText = await p2.evaluate(() => document.body?.innerText?.substring(0, 500) || 'no body');
  console.log('Body:', bodyText);

  // Check if we're authenticated
  const authCheck = bodyText.includes('Gagne') || bodyText.includes('Solde') || bodyText.includes('Sondages');
  console.log('Authenticated:', authCheck);

  if (!authCheck) {
    // Try setting cookies one at a time with specific formats
    console.log('\n=== Trying different cookie approach ===');
    const ctx3 = await browser.newContext();
    
    // Copy just the essential cookies but ensure correct domain format
    for (const c of allCookies) {
      const cookieToSet = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
      };
      await ctx3.addCookies([cookieToSet]);
    }
    
    const p3 = await ctx3.newPage();
    await p3.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p3.waitForTimeout(3000);
    console.log('URL:', p3.url());
    const body3 = await p3.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
    console.log('Body:', body3);
    console.log('Auth:', body3.includes('Gagne') || body3.includes('Solde'));
  }

  // Step 4: Also try SAME context (reuse page from login)
  console.log('\n=== Same context (transfer to dashboard) ===');
  await loginPage.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loginPage.waitForTimeout(3000);
  const body4 = await loginPage.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
  console.log('Body:', body4);
  console.log('Auth:', body4.includes('Gagne') || body4.includes('Solde'));

  await browser.close();
  process.exit(0);
})();