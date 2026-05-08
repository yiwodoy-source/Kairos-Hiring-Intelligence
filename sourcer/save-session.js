/**
 * save-session.js
 * Opens LinkedIn in a real browser window, waits for you to log in,
 * then saves the FULL session (cookies + localStorage) to recordings/linkedin_session.json
 * This session will be reused by excel-scout.js automatically.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.join(__dirname, 'recordings', 'linkedin_session.json');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

(async () => {
  console.log('\n========================================');
  console.log('  LinkedIn Session Saver');
  console.log('========================================');
  console.log('1. Browser will open LinkedIn login page');
  console.log('2. Log in with your credentials manually');
  console.log('3. Once you reach your LinkedIn feed, session is saved automatically');
  console.log('4. Browser will close on its own\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

  console.log('Waiting for you to log in...');

  // Wait until user reaches the feed/home page
  await page.waitForURL(/\/(feed|mynetwork|jobs|in\/)/, { timeout: 180000 });

  console.log('\n[+] Login detected! Saving session...');
  await page.waitForTimeout(3000); // let localStorage settle

  await context.storageState({ path: SESSION_FILE });

  console.log(`[+] Session saved to: ${SESSION_FILE}`);
  console.log('[+] You will NOT need to log in again when running excel-scout.');
  console.log('\nBrowser closing in 3 seconds...');
  await page.waitForTimeout(3000);
  await browser.close();
  console.log('Done.');
})();
