import { chromium } from 'playwright';

const RESET_URL = 'https://app.topsurveys.app/reset-password?token=59fda49d671f597487f29e1d7c027278531f09b3eb94636ab1ad171ddc17116b&email=Ugbekilemelvin%40gmail.com';
const NEW_PASSWORD = 'SurveyBot2026!';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Navigate to reset link
  console.log('📄 Navigating to reset password page...');
  await page.goto(RESET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1500) || '');
  console.log('Page text:', bodyText);

  // Check inputs
  const details = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type, name: el.name, placeholder: el.placeholder,
      'data-test': el.getAttribute('data-test'),
      'data-test-id': el.getAttribute('data-test-id'),
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map(el => ({
      text: el.innerText?.trim(), type: el.type,
      'data-test': el.getAttribute('data-test'),
      'data-test-id': el.getAttribute('data-test-id'),
    }));
    return { inputs, buttons };
  });
  console.log('\nInputs:', JSON.stringify(details.inputs, null, 2));
  console.log('Buttons:', JSON.stringify(details.buttons, null, 2));

  // Fill in new password
  const passwordInputs = page.locator('input[type="password"]');
  const count = await passwordInputs.count();
  console.log(`\nPassword inputs found: ${count}`);

  if (count >= 1) {
    await passwordInputs.nth(0).fill(NEW_PASSWORD);
    console.log('✅ Filled password field 1');
  }
  if (count >= 2) {
    await passwordInputs.nth(1).fill(NEW_PASSWORD);
    console.log('✅ Filled password field 2');
  }

  // Click submit button
  const submitBtn = page.locator('button[type="submit"], [data-test="reset-password-submit"], button:has-text("reset"), button:has-text("Réinitialiser")');
  const btnCount = await submitBtn.count();
  console.log(`Submit buttons: ${btnCount}`);
  
  if (btnCount > 0) {
    await submitBtn.first().click();
    console.log('✅ Clicked submit');
    await page.waitForTimeout(5000);
    
    const result = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
    console.log('Result:', result);
    console.log('URL after:', page.url());
  }

  await browser.close();
  console.log('\n🏁 Done');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});