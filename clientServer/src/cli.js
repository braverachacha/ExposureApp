// clientServer/src/cli.js

import blessed from 'blessed';
import { exec } from 'child_process';
import { BLESSED as T } from './colors.js';
import { CONFIG } from './config.js';
import { broadcast } from './inspector.js';

let screen = null;
let statusBox = null;
let requestLog = null;
let commandInput = null;
let requestLines = [];
let rawRequests = [];
let currentInfo = {};
let restartCallback = null;
let inspectorPort = null;

export let uiActive = false;

const MAX_LOG_LINES = 200;
const MAX_RAW_REQUESTS = 200;

const isTermux = typeof process.env.TERMUX_VERSION === 'string'
  || (typeof process.env.PREFIX === 'string' && process.env.PREFIX.includes('com.termux'));

const buildUI = () => {
  screen = blessed.screen({
    smartCSR: true,
    title: 'ApexTunnel',
    fullUnicode: true,
  });

  statusBox = blessed.box({
    top: 0, left: 0,
    width: '100%', height: 9,
    border: { type: 'line' },
    style: { border: { fg: T.brand } },
    tags: true,
  });

  const separator = blessed.line({
    top: 9, left: 0, width: '100%',
    orientation: 'horizontal',
    style: { fg: T.brand },
  });

  const requestsLabel = blessed.text({
    top: 10, left: 2,
    content: ' Requests ',
    style: { fg: T.brand, bold: true },
  });

  requestLog = blessed.box({
    top: 11, left: 0,
    width: '100%', height: '100%-14',
    scrollable: true, alwaysScroll: true, tags: true,
    content: ` {${T.dim}-fg}Waiting for requests…{/${T.dim}-fg}`,
  });

  commandInput = blessed.textbox({
    bottom: 0, left: 0, height: 3, width: '100%',
    border: { type: 'line' },
    style: { border: { fg: T.brand } },
    label: ' Command (type "h" for help) ',
    inputOnFocus: true,
  });

  screen.append(statusBox);
  screen.append(separator);
  screen.append(requestsLabel);
  screen.append(requestLog);
  screen.append(commandInput);

  commandInput.on('submit', (value) => {
    handleCommand(value);
    commandInput.clearValue();
    commandInput.focus();
    screen.render();
  });

  screen.key(['q', 'C-c'], () => { destroyUI(); process.exit(0); });
  screen.key(['r'], () => handleCommand('restart'));
  screen.key(['c'], () => handleCommand('clear'));
  screen.key(['h'], () => handleCommand('help'));
  screen.key(['o'], () => handleCommand('open'));
  screen.key(['i'], () => handleCommand('inspect'));

  commandInput.focus();
};

const openInBrowser = (url) => {
  let bin;
  if (isTermux) bin = 'termux-open-url';
  else if (process.platform === 'darwin') bin = 'open';
  else if (process.platform === 'win32') bin = 'start';
  else bin = 'xdg-open';

  exec(`${bin} ${url}`, (err) => {
    if (err) logError(`Failed to open browser: ${err.message}`);
  });
};

const handleCommand = (cmd) => {
  const c = cmd.trim().toLowerCase();
  if (!c) return;

  switch (c) {
    case 'open':
    case 'o':
      if (currentInfo.subdomain) {
        const url = `https://${currentInfo.subdomain}.apextunnel.top`;
        openInBrowser(url);
        addLog(`{${T.brand}-fg}Opening ${url} in browser…{/${T.brand}-fg}`);
      } else {
        addLog(`{${T.error}-fg}Error: No active subdomain to open.{/${T.error}-fg}`);
      }
      break;

    case 'inspect':
    case 'i':
      if (inspectorPort) {
        const url = `http://127.0.0.1:${inspectorPort}`;
        openInBrowser(url);
        addLog(`{${T.brand}-fg}Opening inspector at ${url}{/${T.brand}-fg}`);
      } else {
        addLog(`{${T.error}-fg}Inspector not available.{/${T.error}-fg}`);
      }
      break;

    case 'restart':
    case 'r':
      addLog(`{${T.warning}-fg}Restarting tunnel…{/${T.warning}-fg}`);
      restartCallback?.();
      break;

    case 'clear':
    case 'c':
      requestLines = [];
      rawRequests = [];
      requestLog.setContent(` {${T.dim}-fg}Waiting for requests…{/${T.dim}-fg}`);
      break;

    case 'help':
    case 'h':
      addLog([
        `{bold}Available Commands:{/bold}`,
        ` {${T.brand}-fg}open / o{/${T.brand}-fg}     - Open tunnel URL in browser`,
        ` {${T.brand}-fg}inspect / i{/${T.brand}-fg} - Open inspector dashboard`,
        ` {${T.brand}-fg}help / h{/${T.brand}-fg}    - Show this list`,
        ` {${T.brand}-fg}restart / r{/${T.brand}-fg}  - Re-establish connection`,
        ` {${T.brand}-fg}clear / c{/${T.brand}-fg}   - Wipe request history`,
        ` {${T.brand}-fg}exit / q{/${T.brand}-fg}   - Close ApexTunnel`,
      ].join('\n'));
      break;

    case 'exit':
    case 'q':
      destroyUI();
      process.exit(0);
      break;

    default:
      addLog(`{${T.error}-fg}Unknown command: "${c}". Press H for help.{/${T.error}-fg}`);
  }

  screen?.render();
};

const renderStatus = () => {
  if (!statusBox || !screen) return;

  const statusColor = currentInfo.online ? T.success : T.warning;
  const statusText = currentInfo.online ? '● online' : '○ connecting…';
  const inspectLine = inspectorPort
    ? ` Inspector   {${T.brand}-fg}http://127.0.0.1:${inspectorPort}{/${T.brand}-fg} (press I)`
    : '';

  statusBox.setContent([
    ` {bold}ApexTunnel v${CONFIG.app.version}{/bold}`,
    ` {${T.dim}-fg}─────────────────────────────────────────{/${T.dim}-fg}`,
    ` Account     ${currentInfo.email || `{${T.warning}-fg}connecting…{/${T.warning}-fg}`} (${currentInfo.isPremium ? `{${T.success}-fg}Premium ★{/${T.success}-fg}` : `{${T.dim}-fg}Free{/${T.dim}-fg}`})`,
    ` Status      {${statusColor}-fg}${statusText}{/${statusColor}-fg}`,
    ` Forwarding  ${
      currentInfo.subdomain
        ? `{${T.brand}-fg}https://${currentInfo.subdomain}.apextunnel.top{/${T.brand}-fg} → {${T.dim}-fg}localhost:${currentInfo.port}{/${T.dim}-fg}`
        : `{${T.warning}-fg}pending…{/${T.warning}-fg}`
    }`,
    inspectLine,
    ` {${T.dim}-fg}─────────────────────────────────────────{/${T.dim}-fg}`,
    ` Press {bold}O{/bold} open | {bold}I{/bold} inspect | {bold}H{/bold} help | {bold}Q{/bold} quit`,
  ].join('\n'));

  screen.render();
};

export const setConnecting = (port) => {
  if (!screen) { uiActive = true; buildUI(); }
  currentInfo = { ...currentInfo, online: false, port };
  renderStatus();
};

export const setOnline = (info) => {
  currentInfo = { ...currentInfo, ...info, online: true };
  renderStatus();
};

export const setReconnecting = () => {
  currentInfo = { ...currentInfo, online: false };
  renderStatus();
  addLog(`{${T.warning}-fg}Tunnel closed. Reconnecting…{/${T.warning}-fg}`);
};

export const setInspectorPort = (port) => {
  inspectorPort = port;
  renderStatus();
};

export const addLog = (line) => {
  if (!requestLog || !screen) return;
  requestLines.push(line);
  if (requestLines.length > MAX_LOG_LINES) {
    requestLines = requestLines.slice(-MAX_LOG_LINES);
  }
  requestLog.setContent(requestLines.join('\n'));
  requestLog.setScrollPerc(100);
  screen.render();
};

export const logError = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ERROR: ${message}`;
  // Print outside blessed UI so it doesn't corrupt the layout
  console.error(line);
};

export const logRequest = (method, url, status, duration = 0, details = {}) => {
  if (!screen) return;
  const time = new Date().toLocaleTimeString();
  const color = status >= 500 ? T.error : status >= 400 ? T.warning : T.success;

  const normalizeHeaders = (h) => {
    if (!h || typeof h !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(h)) {
      out[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    return out;
  };

  const raw = {
    time,
    method,
    url,
    status,
    duration,
    reqHeaders: normalizeHeaders(details.reqHeaders),
    resHeaders: normalizeHeaders(details.resHeaders),
  };

  rawRequests.push(raw);
  if (rawRequests.length > MAX_RAW_REQUESTS) {
    rawRequests = rawRequests.slice(-MAX_RAW_REQUESTS);
  }
  broadcast(raw);

  addLog(` {bold}${time}{/bold} {${T.brand}-fg}${method.padEnd(7)}{/${T.brand}-fg} {${T.dim}-fg}${url}{/${T.dim}-fg} {${color}-fg}${status}{/${color}-fg}`);
};

export const getState = () => ({
  info: currentInfo,
  requests: rawRequests,
});

export const destroyUI = () => {
  if (screen) {
    screen.destroy();
    screen = null;
    statusBox = null;
    requestLog = null;
    commandInput = null;
  }
  uiActive = false;
};

export const setRestartCallback = (cb) => {
  restartCallback = cb;
};
