import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: 'socks5://127.0.0.1:10801' },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ locale: 'fr-FR' });

  // Login
  await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill('Ugbekilemelvin@gmail.com');
  await page.locator('[data-test-id="app-page-continue-button"]').click();
  await page.waitForTimeout(2000);
  await page.locator('input[type="password"]').fill('SurveyBot2026!');
  await page.locator('[data-test="auth-signin-submit"]').click();
  await page.waitForTimeout(5000);

  // Find navigation tabs
  const navTabs = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="button"]'));
    return allLinks.map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim() || el.textContent?.trim() || '',
      href: el.getAttribute('href') || '',
      'data-test': el.getAttribute('data-test') || '',
      'data-test-id': el.getAttribute('data-test-id') || '',
      class: el.className?.substring(0, 80) || '',
    })).filter(e => e.text && e.text.length < 30);
  });

  console.log('Navigation elements:');
  navTabs.forEach(e => console.log(`  ${e.tag}: "${e.text}" test="${e['data-test']}" id="${e['data-test-id']}"`));

  // Try to find and click the "Sondages" tab
  const sondagesBtn = page.locator('a, button, [role="tab"]').filter({ hasText: /sondages/i });
  console.log(`\nSondages buttons found: ${await sondagesBtn.count()}`);

  if (await sondagesBtn.count() > 0) {
    await sondagesBtn.first().click();
    await page.waitForTimeout(3000);
    console.log('Clicked Sondages tab');

    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
    console.log('\nSondages page content:');
    console.log(bodyText);

    // Check for survey-specific content
    const surveyData = await page.evaluate(() => {
      const lines = document.body?.innerText?.split('\n').map(l => l.trim()).filter(Boolean) || [];
      const surveyLines = lines.filter(l => l.includes('min') || l.includes('€') || l.includes('Sondage') || l.includes('enquête') || l.includes('survey'));
      return surveyLines;
    });
    console.log('\nSurvey-related lines:', surveyData);
  } else {
    console.log('No Sondages button found');
  }

  await browser.close();
}

main().catch(e => console.error('Error:', e.message));