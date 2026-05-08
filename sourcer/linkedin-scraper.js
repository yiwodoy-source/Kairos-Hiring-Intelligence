/**
 * LinkedIn Candidate Scraper
 * Scrapes candidate profiles from LinkedIn search results or individual profile pages.
 * Uses saved session cookies to avoid repeated logins.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
[OUTPUT_DIR, RECORDINGS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const COOKIE_FILE = path.join(RECORDINGS_DIR, 'session_cookies.json');

// ─── LinkedIn DOM Selectors ───────────────────────────────────────────────────
const SELECTORS = {
  // Search results page
  searchResultCard:    '.reusable-search__result-container',
  candidateName:       '.entity-result__title-text a span[aria-hidden="true"]',
  candidateTitle:      '.entity-result__primary-subtitle',
  candidateLocation:   '.entity-result__secondary-subtitle',
  candidateSnippet:    '.entity-result__summary',
  candidateProfileUrl: '.entity-result__title-text a',
  candidateImage:      '.presence-entity__image',

  // Profile page
  profileName:         'h1.text-heading-xlarge',
  profileHeadline:     '.text-body-medium.break-words',
  profileLocation:     '.text-body-small.inline.t-black--light.break-words',
  profileAbout:        '#about ~ div .visually-hidden, .pv-shared-text-with-see-more .visually-hidden',
  profileConnections:  '.pv-top-card--list .t-bold',
  experienceSection:   '#experience ~ div .pvs-list__item--line-separated',
  educationSection:    '#education ~ div .pvs-list__item--line-separated',
  skillsSection:       '#skills ~ div .pvs-list__item--line-separated',
  contactInfo:         '.pv-contact-info__contact-type',

  // Search pagination
  nextPageBtn:         'button[aria-label="Next"]',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomDelay(min = 1200, max = 3000) {
  return sleep(Math.floor(Math.random() * (max - min) + min));
}

async function safeText(page, selector, fallback = '') {
  try {
    return (await page.$eval(selector, el => (el.innerText || el.textContent || '').trim())) || fallback;
  } catch { return fallback; }
}

async function safeAttr(page, selector, attr, fallback = '') {
  try {
    return (await page.$eval(selector, (el, a) => el.getAttribute(a), attr)) || fallback;
  } catch { return fallback; }
}

async function loadContext(browser, cookieFile) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });
  if (fs.existsSync(cookieFile)) {
    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
    await context.addCookies(cookies);
    console.log('[LinkedIn] Session cookies loaded.');
  } else {
    console.log('[LinkedIn] No saved session. You will need to log in manually.');
  }
  return context;
}

async function saveSession(context) {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log('[LinkedIn] Session saved to', COOKIE_FILE);
}

// ─── Manual Login Flow ────────────────────────────────────────────────────────

async function loginManually(page) {
  console.log('\n[LinkedIn] Navigating to LinkedIn login page...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  console.log('[LinkedIn] Please log in manually in the browser window.');
  console.log('[LinkedIn] Waiting for you to reach the LinkedIn feed...');

  // Wait until the user is on the feed or a profile page
  await page.waitForURL(url => url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork'), {
    timeout: 120000
  });
  console.log('[LinkedIn] Login detected. Continuing...');
  await sleep(2000);
}

// ─── Profile Scraper ──────────────────────────────────────────────────────────

async function scrapeProfile(page, profileUrl) {
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await randomDelay(2000, 4000);

  // Scroll to load lazy sections
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
  await sleep(1000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 2 / 3));
  await sleep(1000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);

  const candidate = {
    url: page.url(),
    scrapedAt: new Date().toISOString(),
    name:        await safeText(page, SELECTORS.profileName),
    headline:    await safeText(page, SELECTORS.profileHeadline),
    location:    await safeText(page, SELECTORS.profileLocation),
  };

  // About section
  try {
    candidate.about = await page.$eval('#about ~ div .pv-shared-text-with-see-more', el => el.innerText.trim());
  } catch {
    try { candidate.about = await page.$eval('.pv-about-section .pv-about__summary-text', el => el.innerText.trim()); }
    catch { candidate.about = ''; }
  }

  // Experience
  candidate.experience = await page.$$eval(
    '#experience ~ div .pvs-list__item--line-separated, #experience-section .pv-entity__summary-info',
    els => els.slice(0, 10).map(el => (el.innerText || '').trim().replace(/\n+/g, ' | ').slice(0, 300))
  ).catch(() => []);

  // Education
  candidate.education = await page.$$eval(
    '#education ~ div .pvs-list__item--line-separated',
    els => els.slice(0, 5).map(el => (el.innerText || '').trim().replace(/\n+/g, ' | ').slice(0, 200))
  ).catch(() => []);

  // Skills
  candidate.skills = await page.$$eval(
    '#skills ~ div .pvs-list__item--line-separated',
    els => els.slice(0, 20).map(el => (el.innerText || '').trim().split('\n')[0])
  ).catch(() => []);

  // Raw DOM snapshot of visible sections for completeness
  candidate.rawSections = await page.evaluate(() => {
    const sections = {};
    ['about', 'experience', 'education', 'skills', 'licenses_and_certifications', 'volunteering', 'languages'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const container = el.closest('section') || el.parentElement;
        sections[id] = (container?.innerText || '').trim().slice(0, 1000);
      }
    });
    return sections;
  });

  console.log(`  [Profile] Scraped: ${candidate.name} — ${candidate.headline}`);
  return candidate;
}

// ─── Search Results Scraper ───────────────────────────────────────────────────

async function scrapeSearchPage(page) {
  await randomDelay(1500, 3000);

  return page.$$eval(SELECTORS.searchResultCard, (cards, selectors) => {
    return cards.map(card => {
      const q = (sel) => {
        try { return (card.querySelector(sel)?.innerText || card.querySelector(sel)?.textContent || '').trim(); }
        catch { return ''; }
      };
      const attr = (sel, a) => { try { return card.querySelector(sel)?.getAttribute(a) || ''; } catch { return ''; } };

      const nameEl = card.querySelector(selectors.candidateName);
      const linkEl = card.querySelector(selectors.candidateProfileUrl);

      return {
        name:       q(selectors.candidateName),
        title:      q(selectors.candidateTitle),
        location:   q(selectors.candidateLocation),
        snippet:    q(selectors.candidateSnippet),
        profileUrl: attr(selectors.candidateProfileUrl, 'href')?.split('?')[0] || '',
        imageUrl:   attr(selectors.candidateImage, 'src') || '',
      };
    }).filter(c => c.name);
  }, SELECTORS);
}

// ─── Main Scout Function ──────────────────────────────────────────────────────

async function scout(options = {}) {
  const {
    searchUrl = null,          // LinkedIn people search URL
    profileUrls = [],          // Individual profile URLs to scrape
    keyword = null,            // Keyword to search (builds URL automatically)
    maxPages = 5,              // Max search result pages to scrape
    scrapeFullProfiles = true, // Visit each profile for detailed data
    headless = false,          // Set true for background mode
    outputFile = path.join(OUTPUT_DIR, `candidates_${Date.now()}.json`)
  } = options;

  const browser = await chromium.launch({ headless, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await loadContext(browser, COOKIE_FILE);
  const page = await context.newPage();

  // Mask automation signals
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Check if we need to log in
  await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const isLoggedIn = await page.evaluate(() =>
    document.cookie.includes('li_at') || !!document.querySelector('.global-nav__me-photo')
  );

  if (!isLoggedIn) {
    await loginManually(page);
    await saveSession(context);
  }

  const allCandidates = [];

  // ── Scrape individual profiles ──────────────────────────────────
  for (const url of profileUrls) {
    try {
      const candidate = await scrapeProfile(page, url);
      allCandidates.push(candidate);
      await randomDelay();
    } catch (err) {
      console.error(`[Scout] Failed to scrape ${url}:`, err.message);
    }
  }

  // ── Search results ──────────────────────────────────────────────
  let startUrl = searchUrl;
  if (!startUrl && keyword) {
    startUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
  }

  if (startUrl) {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(2000, 4000);

    let pageNum = 1;
    while (pageNum <= maxPages) {
      console.log(`\n[Scout] Scraping search page ${pageNum}...`);
      const cards = await scrapeSearchPage(page);
      console.log(`  Found ${cards.length} candidates on page ${pageNum}.`);

      if (scrapeFullProfiles) {
        for (const card of cards) {
          if (!card.profileUrl) continue;
          const url = card.profileUrl.startsWith('http') ? card.profileUrl : 'https://www.linkedin.com' + card.profileUrl;
          try {
            const full = await scrapeProfile(page, url);
            allCandidates.push({ ...card, ...full });
          } catch (err) {
            console.error(`  [Scout] Profile error: ${err.message}`);
            allCandidates.push(card);
          }
          await randomDelay(2000, 5000);
          // Go back to search results
          await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => page.goto(startUrl, { waitUntil: 'domcontentloaded' }));
          await randomDelay(1500, 3000);
        }
      } else {
        allCandidates.push(...cards);
      }

      // Go to next page
      const nextBtn = await page.$(SELECTORS.nextPageBtn);
      if (!nextBtn) {
        console.log('[Scout] No more pages.');
        break;
      }
      await nextBtn.click();
      await randomDelay(2000, 4000);
      pageNum++;
    }
  }

  // Save results
  const result = {
    scrapedAt: new Date().toISOString(),
    totalCandidates: allCandidates.length,
    candidates: allCandidates
  };
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`\n[Scout] Done! ${allCandidates.length} candidates saved to:\n  ${outputFile}`);

  await saveSession(context);
  await browser.close();
  return result;
}

module.exports = { scout, scrapeProfile, scrapeSearchPage, loginManually };
