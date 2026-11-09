// The simulator as an iPhone: `npm run sim:iphone`.
// Starts the sim server (unless it already runs) and opens it in its own Chrome window that emulates an iPhone 15 Pro through the
// DevTools protocol: 393 × 852 points at 3x, touch instead of the mouse, the iPhone user agent. Closing the window ends the server
// this script started. Needs only Node 22+ (built-in fetch and WebSocket) and Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.argv[2] ?? 'http://localhost:5174/?scenario=own&lang=de';
const PORT = 9333;
const PHONE = { width: 393, height: 852, deviceScaleFactor: 3, mobile: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };

function chromePath() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const found = c.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome nicht gefunden (CHROME_PATH setzen).');
  return found;
}

// 1. the sim server
let server = null;
if (!(await up('http://localhost:5174/'))) {
  server = spawn('npm', ['run', 'sim'], { stdio: 'inherit', shell: true });
  for (let i = 0; i < 120 && !(await up('http://localhost:5174/')); i++) await sleep(250);
}

// 2. its own Chrome window (own profile, so it never touches the normal browser), sized like the phone
const profile = path.join(os.tmpdir(), 'maraplanna-iphone');
mkdirSync(profile, { recursive: true });
const chrome = spawn(chromePath(), [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  `--window-size=${PHONE.width + 16},${PHONE.height + 39}`,
  `--app=${URL_}`,
], { stdio: 'ignore' });

// 3. iPhone emulation on the page
let target = null;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
if (!target) throw new Error('Chrome-Fenster nicht erreichbar.');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
send('Emulation.setDeviceMetricsOverride', PHONE);
send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'iPhone' });
send('Page.reload', { ignoreCache: true });
console.log(`\n  iPhone-Simulator offen: ${URL_}  (Fenster schliessen = beenden)\n`);

// 4. the window closes: end what this script started
const end = () => { try { ws.close(); } catch { /* gone */ } if (server) { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore', shell: true }); else server.kill(); } process.exit(0); };
ws.addEventListener('close', end);
chrome.on('exit', end);
process.on('SIGINT', () => { chrome.kill(); end(); });
