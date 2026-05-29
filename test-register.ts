import { chromium } from 'playwright';

async function register() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('topsurveys.app') && response.status() >= 200) {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('json')) {
        try {
          const body = await response.text();
          console.log(`🌐 ${response.status()} ${response.request().method()} ${url.replace('https://api.topsurveys.app', '')}`);
          if (body.length < 500) console.log(`   => ${body.substring(0, 300)}`);
        } catch {}
      }
    }
  });

  try {
    console.log('🌐 Loading app...');
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);

    // Step 1: Enter email
    const emailInput = await page.$('input[type="email"]');
    if (!emailInput) throw new Error('Email input not found');
    await emailInput.fill('Ugbekilemelvin@gmail.com');
    await page.waitForTimeout(500);

    // Click Continue
    const continueBtn = await page.$('button:has-text("Continue")');
    if (!continueBtn) throw new Error('Continue button not found');
    await continueBtn.click();
    await page.waitForTimeout(4000);

    console.log('URL after email:', page.url());

    // Step 2: Fill signup form
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill('Test2026');
      console.log('🔑 Password filled');
    }

    // Check terms checkbox
    const checkbox = await page.$('input[type="checkbox"]');
    if (checkbox) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.evaluate((el: HTMLElement) => el.click());
        console.log('✅ Checkbox accepted via JS click');
      }
    }

    await page.waitForTimeout(500);

    // Click final Continue
    const finalBtn = await page.$('button:has-text("Continue")');
    if (finalBtn) {
      console.log('▶️ Submitting registration...');
      await finalBtn.click();
      await page.waitForTimeout(8000);
      console.log('After submit URL:', page.url());
    }

    // Check result
    const allText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
    console.log('Page text:', allText);

    await page.screenshot({ path: '/root/topsurveys-bot/registration-result.png', fullPage: true });
    console.log('📸 Screenshot saved');

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    try {
      await page.screenshot({ path: '/root/topsurveys-bot/error.png', fullPage: true });
    } catch {}
  } finally {
    await browser.close();
  }
}

register();