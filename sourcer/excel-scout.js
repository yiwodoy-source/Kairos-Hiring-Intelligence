const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'recordings', 'linkedin_session.json');
const INPUT_FILE   = process.argv[2] || path.join(__dirname, 'jobs_input.xlsx');
const OUTPUT_DIR   = path.join(__dirname, 'output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(SESSION_FILE))) fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (lo, hi) => sleep(lo + Math.floor(Math.random() * (hi - lo)));

// ─── Read jobs from Excel ─────────────────────────────────────────────────────
async function readJobs() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('ERROR: jobs_input.xlsx not found at', INPUT_FILE);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(INPUT_FILE);
  const ws = wb.worksheets[0];
  const jobs = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const role  = String(row.getCell(1).value || '').trim();
    const limit = parseInt(row.getCell(2).value || 3, 10) || 3;
    if (role) jobs.push({ role, limit });
  });
  return jobs;
}

// ─── Ensure logged in ─────────────────────────────────────────────────────────
async function ensureLoggedIn(page, context) {
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(3000);
  const url = page.url();
  if (!url.includes('/login') && !url.includes('/checkpoint') && !url.includes('/authwall')) {
    console.log('[+] Logged in.');
    await context.storageState({ path: SESSION_FILE });
    return;
  }
  console.log('\n[!] Session expired — please log in manually in the browser window.\n');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/(feed|mynetwork|jobs|search)/, { timeout: 180000 });
  await sleep(3000);
  await context.storageState({ path: SESSION_FILE });
  console.log('[+] Login saved.\n');
}

// ─── Scroll full page ─────────────────────────────────────────────────────────
async function fullScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let y = 0;
      const step = 600;
      const id = setInterval(() => {
        window.scrollBy(0, step);
        y += step;
        if (y >= document.body.scrollHeight) { clearInterval(id); resolve(); }
      }, 250);
    });
  });
  await sleep(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
}

// ─── Contact info popup ───────────────────────────────────────────────────────
async function getContactInfo(page) {
  const result = { phone: '', email: '', website: '' };
  try {
    const btn = await page.$('a[href*="overlay/contact-info"]');
    if (!btn) return result;
    await btn.click();
    await sleep(2000);

    const text = await page.$eval(
      '.artdeco-modal__content, .pv-profile-section__section-info',
      el => el.innerText
    ).catch(() => '');

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const low = lines[i].toLowerCase();
      if (/^(phone|mobile|work phone)$/.test(low) && lines[i+1]) result.phone = lines[i+1];
      if (lines[i].includes('@') && !lines[i].includes(' '))       result.email = lines[i];
      if (/^website$/.test(low) && lines[i+1])                     result.website = lines[i+1];
    }
    const close = await page.$('.artdeco-modal__dismiss, button[aria-label="Dismiss"]');
    if (close) { await close.click(); await sleep(500); }
  } catch {}
  return result;
}

// ─── Scrape one profile — robust text-based extraction ───────────────────────
async function scrapeProfile(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await rand(1500, 2500);
  await fullScroll(page);

  const data = await page.evaluate(() => {
    const t = el => (el?.innerText || el?.textContent || '').trim();

    // ── Name ──
    const name = t(document.querySelector('h1'));

    // ── Headline — first non-name text block in top card ──
    let headline = '';
    const possibleHeadline = [
      '.text-body-medium.break-words',
      '[data-field="headline"]',
      '.pv-top-card .text-body-medium',
    ];
    for (const sel of possibleHeadline) {
      const el = document.querySelector(sel);
      if (el && t(el) && t(el) !== name) { headline = t(el); break; }
    }

    // ── Location ──
    let location = '';
    const possibleLoc = [
      '.text-body-small.inline.t-black--light.break-words',
      '.pv-top-card--list .t-black--light',
      '[data-field="location_name"]',
    ];
    for (const sel of possibleLoc) {
      const el = document.querySelector(sel);
      if (el && t(el)) { location = t(el); break; }
    }

    // ── Generic section extractor ──
    function getSection(keywords) {
      // By id anchor
      for (const kw of keywords) {
        const anchor = document.getElementById(kw);
        if (anchor) {
          const section = anchor.closest('section') || anchor.parentElement?.parentElement?.parentElement;
          if (section) return t(section).replace(/^[^\n]+\n/, '').trim().slice(0, 800);
        }
      }
      // By h2 text
      for (const section of document.querySelectorAll('section')) {
        const h2 = section.querySelector('h2');
        if (!h2) continue;
        const h2text = t(h2).toLowerCase();
        if (keywords.some(k => h2text.includes(k))) {
          return t(section).replace(/^[^\n]+\n/, '').trim().slice(0, 800);
        }
      }
      return '';
    }

    const aboutRaw      = getSection(['about']);
    const experienceRaw = getSection(['experience']);
    const educationRaw  = getSection(['education']);
    const skillsRaw     = getSection(['skills']);

    // ── Current company from top card or experience ──
    let company = '';
    // Try "at Company" pattern in headline
    const atMatch = headline.match(/ at (.+)$/i);
    if (atMatch) company = atMatch[1].trim();
    // Try experience first item
    if (!company && experienceRaw) {
      const lines = experienceRaw.split('\n').map(l => l.trim()).filter(Boolean);
      // First line is usually company or role, second is the other
      company = lines[0] || '';
    }

    // ── Connections ──
    let connections = '';
    const connEl = document.querySelector('.pv-top-card--list .t-bold, .pvs-header__subtitle');
    if (connEl) connections = t(connEl);

    return { name, headline, company, location, connections, aboutRaw, experienceRaw, educationRaw, skillsRaw };
  });

  const contact = await getContactInfo(page);

  // Clean up skills — first line per bullet
  const skills = data.skillsRaw
    ? data.skillsRaw.split('\n').map(l => l.trim()).filter(l => l && l.length < 60 && !l.match(/^\d+$/)).slice(0, 15).join(', ')
    : '';

  return {
    name:        data.name,
    headline:    data.headline,
    company:     data.company,
    location:    data.location,
    connections: data.connections,
    phone:       contact.phone,
    email:       contact.email,
    website:     contact.website,
    profileUrl:  page.url().split('?')[0],
    skills,
    experience:  data.experienceRaw,
    education:   data.educationRaw,
    about:       data.aboutRaw,
  };
}

// ─── Scrape search result cards ───────────────────────────────────────────────
async function scrapeCards(page) {
  await page.waitForSelector(
    '.reusable-search__result-container, [data-view-name="search-entity-result-universal-template"], .search-results-container li',
    { timeout: 10000 }
  ).catch(() => {});
  await rand(800, 1500);

  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // Strategy 1: standard containers
    const containers = document.querySelectorAll(
      '.reusable-search__result-container, li.reusable-search__result-container, [data-view-name="search-entity-result-universal-template"]'
    );

    containers.forEach(card => {
      const link  = card.querySelector('a[href*="/in/"]');
      if (!link) return;
      const url   = (link.href || '').split('?')[0];
      if (!url.includes('/in/') || seen.has(url)) return;

      const nameEl = card.querySelector(
        '.entity-result__title-text a span[aria-hidden="true"], [data-anonymize="person-name"], span[aria-hidden="true"]'
      );
      const name = (nameEl?.innerText || link.innerText || '').trim().split('\n')[0];
      if (!name || name.length < 2) return;

      const headline = (card.querySelector(
        '.entity-result__primary-subtitle, [data-anonymize="headline"]'
      )?.innerText || '').trim();

      const location = (card.querySelector(
        '.entity-result__secondary-subtitle, [data-anonymize="location"]'
      )?.innerText || '').trim();

      seen.add(url);
      results.push({ name, headline, location, profileUrl: url });
    });

    if (results.length > 0) return results;

    // Fallback: all /in/ links with a visible name
    document.querySelectorAll('a[href*="/in/"]').forEach(a => {
      const url = (a.href || '').split('?')[0];
      if (!url.includes('/in/') || seen.has(url)) return;
      const name = (a.querySelector('span[aria-hidden="true"]')?.innerText || a.innerText || '').trim().split('\n')[0];
      if (!name || name.length < 2 || name.length > 80) return;
      seen.add(url);
      results.push({ name, headline: '', location: '', profileUrl: url });
    });

    return results;
  });
}

// ─── Write Excel ──────────────────────────────────────────────────────────────
async function writeExcel(rows) {
  const outFile = path.join(OUTPUT_DIR, `candidates_${Date.now()}.xlsx`);
  const wb = new ExcelJS.Workbook();

  const COLS = [
    { header: 'Job Role',        key: 'jobRole',     width: 22 },
    { header: 'Name',            key: 'name',        width: 26 },
    { header: 'Headline',        key: 'headline',    width: 42 },
    { header: 'Current Company', key: 'company',     width: 28 },
    { header: 'Location',        key: 'location',    width: 24 },
    { header: 'Phone',           key: 'phone',       width: 18 },
    { header: 'Email',           key: 'email',       width: 30 },
    { header: 'Website',         key: 'website',     width: 30 },
    { header: 'Connections',     key: 'connections', width: 14 },
    { header: 'LinkedIn URL',    key: 'profileUrl',  width: 46 },
    { header: 'Skills',          key: 'skills',      width: 50 },
    { header: 'Experience',      key: 'experience',  width: 60 },
    { header: 'Education',       key: 'education',   width: 40 },
    { header: 'About',           key: 'about',       width: 60 },
  ];

  function makeSheet(name, data) {
    const ws = wb.addWorksheet(name);
    ws.columns = COLS;
    const hdr = ws.getRow(1);
    hdr.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    hdr.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } };
    hdr.height    = 22;
    hdr.alignment = { vertical: 'middle' };
    ws.views      = [{ state: 'frozen', ySplit: 1 }];

    data.forEach((d, idx) => {
      const row = ws.addRow(d);
      row.height    = 70;
      row.alignment = { wrapText: true, vertical: 'top' };
      if (idx % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' } };
      if (d.phone)      row.getCell('phone').font = { bold: true, color: { argb: 'FF0A66C2' } };
      if (d.email)      row.getCell('email').font = { bold: true, color: { argb: 'FF0A66C2' } };
      if (d.profileUrl) {
        row.getCell('profileUrl').value = { text: d.name || d.profileUrl, hyperlink: d.profileUrl };
        row.getCell('profileUrl').font  = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });
  }

  makeSheet('All Candidates', rows);

  const byRole = {};
  rows.forEach(r => { (byRole[r.jobRole] = byRole[r.jobRole] || []).push(r); });
  for (const [role, data] of Object.entries(byRole)) {
    makeSheet(role.slice(0, 31), data);
  }

  // Summary
  const sum = wb.addWorksheet('Summary');
  sum.columns = [
    { header: 'Job Role',   key: 'role',  width: 28 },
    { header: 'Total',      key: 'total', width: 10 },
    { header: 'With Phone', key: 'phone', width: 14 },
    { header: 'With Email', key: 'email', width: 14 },
  ];
  const sh = sum.getRow(1);
  sh.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } };
  sh.height = 22;
  for (const [role, data] of Object.entries(byRole)) {
    sum.addRow({ role, total: data.length, phone: data.filter(r => r.phone).length, email: data.filter(r => r.email).length });
  }

  await wb.xlsx.writeFile(outFile);
  return outFile;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const jobs = await readJobs();
  console.log(`\n[Scout] ${jobs.length} job role(s): ${jobs.map(j => `${j.role}(${j.limit})`).join(', ')}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const ctxOpts = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 800 },
    locale:    'en-US',
  };
  if (fs.existsSync(SESSION_FILE)) ctxOpts.storageState = SESSION_FILE;

  const context = await browser.newContext(ctxOpts);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await ensureLoggedIn(page, context);

  const allRows = [];

  for (const { role, limit } of jobs) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`[Role] "${role}" — top ${limit} candidates`);

    // Search ALL people for this role (not just connections)
    // network=["S","O"] = 2nd degree + 3rd degree (excludes your own connections)
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(role)}&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D`;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await rand(2000, 3000);

    const cards = await scrapeCards(page);
    if (cards.length === 0) {
      const shot = path.join(OUTPUT_DIR, `debug_${role.replace(/\s+/g, '_')}.png`);
      await page.screenshot({ path: shot });
      console.log(`  No results. Screenshot saved: ${shot}`);
      continue;
    }

    const toScrape = cards.slice(0, limit);
    console.log(`  Found ${cards.length} results — scraping top ${toScrape.length}`);

    for (let i = 0; i < toScrape.length; i++) {
      const card = toScrape[i];
      process.stdout.write(`  [${i+1}/${toScrape.length}] ${card.name} ... `);
      try {
        const profile = await scrapeProfile(page, card.profileUrl);
        allRows.push({ jobRole: role, ...card, ...profile });
        console.log(`OK  |  ${profile.headline?.slice(0,50) || '—'}`);
      } catch (err) {
        console.log(`FAILED: ${err.message.slice(0, 80)}`);
        allRows.push({ jobRole: role, ...card });
      }
      await rand(2000, 3500);
      await context.storageState({ path: SESSION_FILE });
    }
  }

  await browser.close();

  if (allRows.length === 0) {
    console.log('\n[!] No data scraped.');
    process.exit(1);
  }

  console.log(`\n[Excel] Writing ${allRows.length} candidates...`);
  const outFile = await writeExcel(allRows);
  console.log(`[Done] ${outFile}`);
  process.exit(0);
})();
