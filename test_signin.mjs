import { chromium } from 'playwright';

const EMAIL = 'sirfuel365@gmail.com';
const PASSWORD = 'TopSurveyBot2026!';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Try the sign-in URL directly
    await page.goto('https://app.topsurveys.app/signin', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    console.log('=== /signin page ===');
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'no body');
    console.log('Body:', bodyText);

    await page.screenshot({ path: '/tmp/ss_signin.png', fullPage: false });

    // Check for login form
    const loginForm = await page.locator('[data-test="auth-signin-form"]').count();
    const signupForm = await page.locator('[data-test="auth-signup-form"]').count();
    console.log('signin form:', loginForm, 'signup form:', signupForm);

    // Try to find signin elements
    const testIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-test], [data-test-id]')).map(el => ({
        tag: el.tagName,
        'data-test': el.getAttribute('data-test'),
        'data-test-id': el.getAttribute('data-test-id'),
        text: el.innerText?.substring(0, 80),
      }));
    });
    console.log('\n=== data-test elements ===');
    testIds.forEach(t => console.log('  ', JSON.stringify(t)));

    // Try to actually log in via /signin
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      await page.waitForTimeout(500);
      
      // Look for continue/signin button
      const continueBtn = page.locator('[data-test-id="app-page-continue-button"], [data-test="auth-signin-submit"], [data-test-id="auth-signin-submit"]');
      if (await continueBtn.count() > 0) {
        await continueBtn.click();
        await page.waitForTimeout(3000);
        
        console.log('\n=== After clicking continue on /signin ===');
        console.log('URL:', page.url());
        
        const passInput = page.locator('input[type="password"]');
        if (await passInput.count() > 0) {
          await passInput.fill(PASSWORD);
          await page.waitForTimeout(500);

          // Find submit button
          const submitBtn = page.locator('[data-test="auth-signin-submit"], [data-test-id="auth-signin-submit"], button[type="submit"]');
          const btnCount = await submitBtn.count();
          console.log('submit buttons found:', btnCount);
          
          if (btnCount > 0) {
            await submitBtn.first().click();
            await page.waitForTimeout(5000);
            
            console.log('\n=== After signin submit ===');
            console.log('URL:', page.url());
            
            const cookies = await page.context().cookies();
            const authCookie = cookies.find(c => c.name === 'auth-token');
            if (authCookie) {
              console.log('auth-token found:', decodeURIComponent(authCookie.value).substring(0, 40));
            } else {
              console.log('No auth-token cookie');
              console.log('Cookies:', cookies.map(c => c.name + '=' + c.value.substring(0, 30)).join(', '));
            }
            
            const body2 = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || 'no body');
            console.log('Body:', body2);
            
            const testIds2 = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('[data-test]')).map(el => ({
                test: el.getAttribute('data-test'),
                text: el.innerText?.substring(0, 50),
              }));
            });
            console.log('\ndata-test:', JSON.stringify(testIds2));
          }
        }
      }
    }

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    try {
      await page.screenshot({ path: '/tmp/ss_error.png', fullPage: false });
    } catch {}
    process.exit(1);
  }
})();