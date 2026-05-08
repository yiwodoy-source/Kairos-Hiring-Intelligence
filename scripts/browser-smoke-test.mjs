import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = path.join(rootDir, 'artifacts', 'browser-smoke');
const userDataDir = path.join(artifactsDir, 'chrome-profile');
const debugPort = 9222;

const processes = [];

function spawnService(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
    env: process.env
  });

  child.stdout.on('data', (data) => process.stdout.write(`[service] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[service:err] ${data}`));
  processes.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 15000) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function getLoginToken() {
  const username = process.env.ADMIN_USER || 'mayur';
  const password = process.env.ADMIN_PASSWORD || 'mayur';
  const response = await fetch('http://127.0.0.1:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error(`Login failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.token) throw new Error('Login response did not include a token');
  return payload.token;
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  return {
    send(method, params = {}) {
      const messageId = ++id;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    },
    close() {
      socket.close();
    }
  };
}

async function createTab() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to create Chrome tab: ${response.status}`);
  return response.json();
}

async function screenshot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const filePath = path.join(artifactsDir, name);
  await writeFile(filePath, Buffer.from(result.data, 'base64'));
  return filePath;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result.value;
}

async function waitForExpression(cdp, expression, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function clickButtonByText(cdp, text) {
  return evaluate(cdp, `
    (() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.innerText.trim().includes(${JSON.stringify(text)}));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
}

async function main() {
  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(userDataDir, { recursive: true });

  if (!process.env.ATTACH_BROWSER_SMOKE) {
    spawnService('C:\\Program Files\\nodejs\\node.exe', ['dist\\server.js'], path.join(rootDir, 'backend'));
    spawnService('C:\\Program Files\\nodejs\\node.exe', ['scripts\\serve-dist.mjs'], rootDir);

    const chrome = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      'about:blank'
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    });
    chrome.stderr.on('data', (data) => process.stderr.write(`[chrome] ${data}`));
    processes.push(chrome);
  }

  try {
    await waitFor('http://127.0.0.1:3001/api/health');
    await waitFor('http://127.0.0.1:3003/');
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);

    const token = await getLoginToken();
    const tab = await createTab();
    const cdp = await connectCdp(tab.webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:3003/' });
    await waitForExpression(cdp, `document.readyState === 'complete' && Boolean(document.querySelector('#username'))`);

    const loginMetrics = await evaluate(cdp, `
      (() => {
        const username = document.querySelector('#username');
        const password = document.querySelector('#password');
        const title = document.querySelector('h1');
        const u = getComputedStyle(username);
        const p = getComputedStyle(password);
        const t = getComputedStyle(title);
        return {
          titleText: title?.innerText || '',
          usernameColor: u.color,
          usernameBackground: u.backgroundColor,
          passwordColor: p.color,
          titleColor: t.color,
          usernameRect: username.getBoundingClientRect().toJSON(),
          passwordRect: password.getBoundingClientRect().toJSON()
        };
      })()
    `);
    const loginShot = await screenshot(cdp, '01-login.png');

    await evaluate(cdp, `
      localStorage.setItem('nexus_hr_session_token', ${JSON.stringify(token)});
      location.reload();
      true;
    `);
    await waitForExpression(cdp, `document.readyState === 'complete' && document.body.innerText.includes('AI Analytics')`);
    const dashboardShot = await screenshot(cdp, '02-dashboard.png');

    const recruitmentClicked = await clickButtonByText(cdp, 'Recruitment');
    await waitForExpression(cdp, `document.body.innerText.includes('Recruitment & Hiring')`);
    const recruitmentText = await evaluate(cdp, `document.body.innerText`);
    const recruitmentShot = await screenshot(cdp, '03-recruitment.png');

    const hrAgentClicked = await clickButtonByText(cdp, 'HR AI Agent');
    await waitForExpression(cdp, `document.body.innerText.includes('HR AI Agent') || document.body.innerText.includes('Talent Intelligence')`);
    const hrAgentText = await evaluate(cdp, `document.body.innerText`);
    const hrAgentShot = await screenshot(cdp, '04-hr-agent.png');

    const report = {
      health: {
        frontend: 'ok',
        backend: 'ok'
      },
      loginMetrics,
      navigation: {
        recruitmentClicked,
        hrAgentClicked,
        recruitmentLoaded: recruitmentText.includes('Recruitment & Hiring'),
        hrAgentLoaded: hrAgentText.includes('HR AI Agent') || hrAgentText.includes('Talent Intelligence')
      },
      screenshots: {
        login: loginShot,
        dashboard: dashboardShot,
        recruitment: recruitmentShot,
        hrAgent: hrAgentShot
      }
    };

    await writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    cdp.close();
  } finally {
    for (const child of processes.reverse()) {
      if (!child.killed) child.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  for (const child of processes.reverse()) {
    if (!child.killed) child.kill();
  }
  process.exitCode = 1;
});
