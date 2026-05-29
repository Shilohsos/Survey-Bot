import 'dotenv/config';
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const EMAIL = process.env.TS_EMAIL || '';
const PASSWORD = process.env.TS_PASSWORD || '';
const BRIDGE_PORT = 10801;

async function startBridge() {
  const proc = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'ExitOnForwardFailure=yes',
    '-D', `${BRIDGE_PORT}`,
    '-N', '-q',
    'root@ayomide-server.xyz',
  ], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 2000));
  return proc;
}

async function forceCloseOnboarding(page: any) {
  try {
    await page.evaluate(() => {
      const popup = document.querySelector('[data-test-id="ps-onboarding-popup"]');
      if (popup && popup.parentElement) popup.parentElement.removeChild(popup);
    });
  } catch {}
}

async function main() {
  const bridge = await startBridge();
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `socks5://127.0.0.1:${BRIDGE_PORT}` },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Login
    console.log('Logging in...');
    await page.goto('https://app.topsurveys.app/app-login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('[data-test-id="app-page-continue-button"]').click();
    await page.waitForTimeout(2000);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('[data-test="auth-signin-submit"]').click();
    await page.waitForTimeout(5000);

    // Go to main page
    await page.goto('https://app.topsurveys.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Click Surveys tab
    await page.evaluate(() => {
      const snav = document.querySelector('[data-test-id="surveys-nav"]');
      if (snav) (snav as HTMLElement).click();
    });
    await page.waitForTimeout(2000);

    // Take screenshot of onboarding state
    await page.screenshot({ path: '/tmp/debug_onboard_start.png', fullPage: false });

    // NOW: fully complete the onboarding
    // Step 1: Click "Poursuivre l'onboarding"
    const pursueBtn = page.locator('button:has-text("Poursuivre")');
    if (await pursueBtn.count() > 0) {
      console.log('Found "Poursuivre" button - starting onboarding...');
      await pursueBtn.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/debug_onboard_step1.png', fullPage: false });
    }

    // Now loop through all onboarding steps
    for (let step = 0; step < 25; step++) {
      const popup = page.locator('[data-test-id="ps-onboarding-popup"]');
      if (!(await popup.isVisible().catch(() => false))) {
        console.log(`Onboarding popup not visible at step ${step} - done!`);
        break;
      }

      const content = await popup.locator('[data-test-id="ps-popup-content-wrapper"]').innerText().catch(() => '');
      console.log(`\n=== Step ${step} content ===`);
      console.log(content?.substring(0, 500));

      // Check for birthday/year input
      const yearInput = popup.locator('[data-test-id="ps-date-picker-year-input"]');
      if (await yearInput.count() > 0) {
        console.log('-> Birthday step: filling year, month, day');
        await yearInput.fill('1990');
        await page.waitForTimeout(500);

        const monthToggle = popup.locator('[data-test-id="ps-date-picker-month-toggle"]');
        if (await monthToggle.count() > 0) {
          await monthToggle.click();
          await page.waitForTimeout(500);
          // Find "Mai" (May) or any month option
          const monthOpt = page.locator('[class*="dropdown__item"].month').first();
          if (await monthOpt.count() > 0) {
            await monthOpt.click();
            await page.waitForTimeout(500);
          }
        }

        const dayToggle = popup.locator('[data-test-id="ps-date-picker-day-toggle"]');
        if (await dayToggle.count() > 0) {
          await dayToggle.click();
          await page.waitForTimeout(500);
          const dayOpt = page.locator('[class*="dropdown__item"].day').first();
          if (await dayOpt.count() > 0) {
            await dayOpt.click();
            await page.waitForTimeout(500);
          }
        }
      }

      // Check for text input fields (e.g., zip code)
      const textInputs = popup.locator('input[type="text"], input:not([type="email"]):not([type="password"]):not([type="date"])');
      const textCount = await textInputs.count();
      if (textCount > 0) {
        console.log(`-> Found ${textCount} text input(s)`);
        for (let i = 0; i < textCount; i++) {
          const placeholder = await textInputs.nth(i).getAttribute('placeholder').catch(() => '');
          const inputType = await textInputs.nth(i).getAttribute('type').catch(() => '');
          console.log(`   Input ${i}: type=${inputType}, placeholder="${placeholder}"`);
          // Fill with appropriate values
          if (placeholder?.toLowerCase().includes('code') || placeholder?.toLowerCase().includes('zip') || placeholder?.toLowerCase().includes('postal')) {
            await textInputs.nth(i).fill('75001'); // Paris zip code
          } else if (placeholder?.toLowerCase().includes('city') || placeholder?.toLowerCase().includes('ville')) {
            await textInputs.nth(i).fill('Paris');
          } else {
            await textInputs.nth(i).fill('Test');
          }
          await page.waitForTimeout(300);
        }
      }

      // Check for multi-select options
      const options = popup.locator('[class*="item-select-option"], [class*="option-item"], .ps-select__option, [class*="radio"], [class*="checkbox"]');
      const optCount = await options.count();
      if (optCount > 0) {
        console.log(`-> Found ${optCount} selectable options`);
        const pageText = content?.toLowerCase() || '';

        for (let i = 0; i < optCount; i++) {
          const text = (await options.nth(i).innerText()).trim().toLowerCase();
          console.log(`   Option ${i}: "${text}"`);

          // Persona-matching patterns
          const goodPatterns = [
            'homme', 'masculin', 'male', '35-44', '25-34',
            'supérieur', 'université', 'university', 'graduate', 'diplômé', 'bac+',
            'employé', 'temps plein', 'full-time', 'employee',
            'marié', 'married', 'marie',
            'français', 'english',
            'technologie', 'technology', 'sport', 'voyage', 'travel',
            '50,000', '75,000', '50k', '75k', '€50', '€75', '$50', '$75',
            'oui', 'yes', 'd\'accord',
            'informatique', 'it', 'computer',
          ];

          let clicked = false;
          // First check for language step
          const isLanguageStep = pageText.includes('langue') || pageText.includes('language');
          if (isLanguageStep && (text.includes('français') || text.includes('english'))) {
            console.log(`   -> Clicking language: "${text}"`);
            await options.nth(i).click();
            await page.waitForTimeout(300);
            clicked = true;
          }

          if (!clicked) {
            for (const pat of goodPatterns) {
              if (text.includes(pat)) {
                console.log(`   -> Clicking (matched "${pat}"): "${text}"`);
                await options.nth(i).click();
                await page.waitForTimeout(300);
                break;
              }
            }
          }
        }
      }

      // Check for dropdown selects
      const dropdowns = popup.locator('select, [class*="dropdown-toggle"], [data-test-id$="toggle"]');
      const ddCount = await dropdowns.count();
      if (ddCount > 0) {
        console.log(`-> Found ${ddCount} dropdown toggle(s)`);
        for (let i = 0; i < ddCount; i++) {
          const tagName = await dropdowns.nth(i).evaluate((el: any) => el.tagName).catch(() => '');
          if (tagName === 'SELECT') {
            const options = await dropdowns.nth(i).locator('option').all();
            if (options.length > 1) {
              const val = await options[1].getAttribute('value');
              if (val) {
                await dropdowns.nth(i).selectOption(val);
                await page.waitForTimeout(300);
                console.log(`   Selected option value="${val}"`);
              }
            }
          } else if (tagName !== 'INPUT') {
            // Skip date-picker toggles (already handled above)
            const testId = await dropdowns.nth(i).getAttribute('data-test-id').catch(() => '');
            if (!testId?.includes('date-picker') && !testId?.includes('year') && !testId?.includes('month') && !testId?.includes('day')) {
              await dropdowns.nth(i).click();
              await page.waitForTimeout(500);
              const firstItem = page.locator('[class*="dropdown__item"], [class*="select__option"], [class*="option-item"]').first();
              if (await firstItem.count() > 0) {
                await firstItem.click();
                await page.waitForTimeout(300);
                console.log(`   Clicked dropdown and selected first item`);
              }
            }
          }
        }
      }

      // Click "Suivant" or "Terminer" or "Valider" or "Continuer"
      const nextBtn = popup.locator('button:has-text("Suivant"), button:has-text("Terminer"), button:has-text("Valider"), button:has-text("Continuer"), button:has-text("Next"), button:has-text("Finish")');
      const nextCount = await nextBtn.count();
      console.log(`-> Next buttons found: ${nextCount}`);
      
      if (nextCount > 0) {
        const disabled = await nextBtn.first().isDisabled().catch(() => false);
        if (!disabled) {
          const btnText = await nextBtn.first().innerText();
          console.log(`-> Clicking "${btnText}"`);
          await nextBtn.first().click();
          await page.waitForTimeout(1500);
        } else {
          console.log('-> Next button disabled - checking what we missed');
          // Take screenshot to debug
          await page.screenshot({ path: `/tmp/debug_onboard_stuck_step${step}.png`, fullPage: false });
          // Try to complete whatever's needed
          await page.waitForTimeout(1000);
        }
      } else {
        console.log('-> No "Suivant/Terminer" button found, breaking loop');
        break;
      }
    }

    // After finishing onboarding, wait and screenshot
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/debug_onboard_final.png', fullPage: false });

    // Check if surveys tab shows survey cards now
    await page.evaluate(() => {
      const snav = document.querySelector('[data-test-id="surveys-nav"]');
      if (snav) (snav as HTMLElement).click();
    });
    await page.waitForTimeout(3000);

    // Remove any leftover popups
    const stillThere = page.locator('[data-test-id="ps-onboarding-popup"]');
    if (await stillThere.isVisible().catch(() => false)) {
      console.log('Onboarding still visible, force-closing...');
      await forceCloseOnboarding(page);
      await page.waitForTimeout(2000);
    }

    // Check for survey cards
    const surveyCards = await page.evaluate(() => {
      return document.querySelectorAll('[data-test-id^="ps-survey-"]').length;
    });
    console.log(`\n=== Survey cards found: ${surveyCards} ===`);

    // Also dump what we see
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
    console.log('\n=== Page text ===');
    console.log(bodyText);

    await page.screenshot({ path: '/tmp/debug_onboard_result.png', fullPage: true });

  } catch (err: any) {
    console.error('ERROR:', err?.message || err);
  }

  await browser.close().catch(() => {});
  bridge.kill();
  process.exit(0);
}

main();