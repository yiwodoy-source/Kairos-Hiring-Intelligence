#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_URL = 'http://localhost:5173';
const DEFAULT_OUT_DIR = path.join(rootDir, 'artifacts', 'scout');
const TEXT_LIMIT = 160;

const args = parseArgs(process.argv.slice(2));
const targetUrl = args.url || args.u || DEFAULT_URL;
const outDir = path.resolve(args.out || args.o || DEFAULT_OUT_DIR);
const headless = toBool(args.headless, false);
const keepOpen = toBool(args.keepOpen ?? args['keep-open'], true);
const maskTypedText = toBool(args.maskTypedText ?? args['mask-typed-text'], true);
const recordMs = Number(args.recordMs || args['record-ms'] || 0);

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.error(
    [
      'Playwright is not installed.',
      'Run: npm install --save-dev playwright',
      'Then install browsers if needed: npx playwright install chromium',
    ].join('\n'),
  );
  process.exit(1);
}

await fs.mkdir(outDir, { recursive: true });

const startedAt = new Date();
const runId = startedAt.toISOString().replace(/[:.]/g, '-');
const runDir = path.join(outDir, runId);
await fs.mkdir(runDir, { recursive: true });

const events = [];
const consoleMessages = [];
const network = [];
const pageErrors = [];

const browser = await playwright.chromium.launch({ headless });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: headless ? undefined : { dir: runDir, size: { width: 1440, height: 1000 } },
});

const page = await context.newPage();
const started = Date.now();

page.on('console', (msg) => {
  consoleMessages.push({
    type: msg.type(),
    text: redact(String(msg.text())),
    location: msg.location(),
    ts: Date.now() - started,
  });
});

page.on('pageerror', (error) => {
  pageErrors.push({
    name: error.name,
    message: redact(error.message),
    stack: redact(error.stack || ''),
    ts: Date.now() - started,
  });
});

page.on('request', (request) => {
  const headers = redactHeaders(request.headers());
  network.push({
    phase: 'request',
    method: request.method(),
    url: redactUrl(request.url()),
    resourceType: request.resourceType(),
    headers,
    ts: Date.now() - started,
  });
});

page.on('response', (response) => {
  network.push({
    phase: 'response',
    status: response.status(),
    statusText: response.statusText(),
    url: redactUrl(response.url()),
    headers: redactHeaders(response.headers()),
    ts: Date.now() - started,
  });
});

await page.exposeBinding('__scoutLog', (_source, payload) => {
  events.push({
    ...payload,
    ts: Date.now() - started,
  });
});

await page.addInitScript(({ maskTypedText, textLimit }) => {
  const redact = (value) => {
    if (value == null) return value;
    return String(value)
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/(token|secret|password|api[_-]?key)=([^&\s]+)/gi, '$1=[REDACTED]');
  };

  const clip = (value, max = textLimit) => {
    const text = redact(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };

  const cssEscape = (value) => {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  const selectorFor = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
    if (element.id) return `#${cssEscape(element.id)}`;

    const attrs = ['data-testid', 'data-test', 'aria-label', 'name', 'role', 'type'];
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      if (value) return `${element.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
    }

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(' > ');
  };

  const summarizeElement = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return {};
    const rect = element.getBoundingClientRect();
    const type = element.getAttribute('type') || '';
    const isSensitive =
      type.toLowerCase() === 'password' ||
      /password|secret|token|api[_-]?key/i.test(element.getAttribute('name') || '') ||
      /password|secret|token|api[_-]?key/i.test(element.getAttribute('id') || '');

    let value;
    if ('value' in element) {
      if (isSensitive) value = '[REDACTED]';
      else if (maskTypedText) value = element.value ? `[${String(element.value).length} chars]` : '';
      else value = clip(element.value);
    }

    return {
      tag: element.tagName.toLowerCase(),
      selector: selectorFor(element),
      id: element.id || undefined,
      classes: element.className && typeof element.className === 'string' ? clip(element.className, 120) : undefined,
      role: element.getAttribute('role') || undefined,
      name: element.getAttribute('name') || undefined,
      type: type || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      text: isSensitive ? '[REDACTED]' : clip(element.innerText || element.textContent || ''),
      value,
      checked: 'checked' in element ? element.checked : undefined,
      href: element instanceof HTMLAnchorElement ? redact(element.href) : undefined,
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };

  const log = (event) => {
    window.__scoutLog?.({
      url: location.href,
      title: document.title,
      ...event,
    });
  };

  const installHud = () => {
    const hud = document.createElement('div');
    hud.textContent = 'Scout recording';
    hud.setAttribute('data-scout-hud', 'true');
    Object.assign(hud.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      zIndex: '2147483647',
      padding: '8px 10px',
      borderRadius: '6px',
      background: '#111827',
      color: '#fff',
      font: '12px/1.2 system-ui, sans-serif',
      boxShadow: '0 4px 20px rgba(0,0,0,.25)',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(hud);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHud, { once: true });
  } else {
    installHud();
  }

  document.addEventListener(
    'click',
    (event) => {
      log({
        event: 'click',
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        element: summarizeElement(event.target),
      });
    },
    true,
  );

  document.addEventListener(
    'input',
    (event) => {
      log({
        event: 'input',
        element: summarizeElement(event.target),
      });
    },
    true,
  );

  document.addEventListener(
    'change',
    (event) => {
      log({
        event: 'change',
        element: summarizeElement(event.target),
      });
    },
    true,
  );

  document.addEventListener(
    'submit',
    (event) => {
      log({
        event: 'submit',
        element: summarizeElement(event.target),
      });
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      log({
        event: 'keydown',
        key: event.key.length === 1 && maskTypedText ? '[char]' : event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        element: summarizeElement(event.target),
      });
    },
    true,
  );
}, { maskTypedText, textLimit: TEXT_LIMIT });

console.log(`Opening ${targetUrl}`);
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => undefined);

if (recordMs > 0) {
  console.log(`Recording for ${recordMs}ms...`);
  await page.waitForTimeout(recordMs);
} else if (keepOpen && !headless) {
  console.log('Interact with the browser. Press Ctrl+C here when you are done.');
  await waitForInterrupt();
}

await writeArtifacts(page, runDir, {
  targetUrl,
  startedAt,
  events,
  consoleMessages,
  network,
  pageErrors,
  maskTypedText,
});

await context.close();
await browser.close();

console.log(`Scout artifacts written to ${runDir}`);

async function writeArtifacts(page, runDir, metadata) {
  const snapshot = await page.evaluate((textLimit) => {
    const clip = (value, max = textLimit) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max)}...` : text;
    };

    const cssEscape = (value) => {
      if (window.CSS?.escape) return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    };

    const selectorFor = (element) => {
      if (element.id) return `#${cssEscape(element.id)}`;
      const attrs = ['data-testid', 'data-test', 'aria-label', 'name', 'role', 'type'];
      for (const attr of attrs) {
        const value = element.getAttribute(attr);
        if (value) return `${element.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
      }
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    };

    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const elements = Array.from(document.querySelectorAll('*'))
      .filter((element) => !element.hasAttribute('data-scout-hud'))
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const type = element.getAttribute('type') || '';
        const sensitive =
          type.toLowerCase() === 'password' ||
          /password|secret|token|api[_-]?key/i.test(element.getAttribute('name') || '') ||
          /password|secret|token|api[_-]?key/i.test(element.getAttribute('id') || '');

        return {
          index,
          tag: element.tagName.toLowerCase(),
          selector: selectorFor(element),
          id: element.id || undefined,
          classes: element.className && typeof element.className === 'string' ? clip(element.className, 120) : undefined,
          role: element.getAttribute('role') || undefined,
          ariaLabel: element.getAttribute('aria-label') || undefined,
          name: element.getAttribute('name') || undefined,
          type: type || undefined,
          text: sensitive ? '[REDACTED]' : clip(element.innerText || element.textContent || ''),
          visible: isVisible(element),
          bbox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });

    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      counts: {
        elements: elements.length,
        forms: document.forms.length,
        links: document.links.length,
        buttons: document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]').length,
        inputs: document.querySelectorAll('input,textarea,select').length,
      },
      elements,
    };
  }, TEXT_LIMIT);

  const html = redact(await page.content());
  const accessibility = await page.accessibility.snapshot({ interestingOnly: false }).catch((error) => ({
    error: error.message,
  }));
  const screenshotPath = path.join(runDir, 'screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await fs.writeFile(path.join(runDir, 'page.html'), html, 'utf8');
  await fs.writeFile(path.join(runDir, 'dom-elements.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.writeFile(path.join(runDir, 'events.json'), JSON.stringify(metadata.events, null, 2), 'utf8');
  await fs.writeFile(path.join(runDir, 'network.json'), JSON.stringify(metadata.network, null, 2), 'utf8');
  await fs.writeFile(path.join(runDir, 'console.json'), JSON.stringify(metadata.consoleMessages, null, 2), 'utf8');
  await fs.writeFile(path.join(runDir, 'errors.json'), JSON.stringify(metadata.pageErrors, null, 2), 'utf8');
  await fs.writeFile(path.join(runDir, 'accessibility.json'), JSON.stringify(accessibility, null, 2), 'utf8');
  await fs.writeFile(
    path.join(runDir, 'summary.json'),
    JSON.stringify(
      {
        targetUrl: metadata.targetUrl,
        finalUrl: snapshot.url,
        title: snapshot.title,
        startedAt: metadata.startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        maskTypedText: metadata.maskTypedText,
        files: [
          'page.html',
          'dom-elements.json',
          'events.json',
          'network.json',
          'console.json',
          'errors.json',
          'accessibility.json',
          'screenshot.png',
        ],
        counts: {
          ...snapshot.counts,
          events: metadata.events.length,
          network: metadata.network.length,
          console: metadata.consoleMessages.length,
          errors: metadata.pageErrors.length,
        },
      },
      null,
      2,
    ),
    'utf8',
  );
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const trimmed = arg.slice(2);
    const [key, inlineValue] = trimmed.split('=');
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      parsed[key] = argv[index + 1];
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function toBool(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function waitForInterrupt() {
  return new Promise((resolve) => {
    process.once('SIGINT', () => {
      console.log('\nStopping scout and writing artifacts...');
      resolve();
    });
  });
}

function redact(value) {
  if (value == null) return value;
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|secret|password|api[_-]?key)(["':=\s]+)([^"',&\s<]+)/gi, '$1$2[REDACTED]')
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL REDACTED]');
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (/token|secret|password|api[_-]?key|code|auth/i.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return redact(url);
  }
}

function redactHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    result[key] = /authorization|cookie|token|secret|api[_-]?key/i.test(key) ? '[REDACTED]' : redact(value);
  }
  return result;
}
