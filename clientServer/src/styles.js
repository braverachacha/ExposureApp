// clientServer/src/styles.js

export const THEMES = {
  teal: {
    name: 'Teal',
    bg: '#0a0a0a',
    bgSecondary: '#111',
    bgTertiary: '#1a1a1a',
    border: '#222',
    text: '#e0e0e0',
    textDim: '#888',
    textMuted: '#666',
    brand: '#00ffcc',
    brandDim: 'rgba(0,255,204,0.07)',
    brandHover: 'rgba(0,255,204,0.13)',
    success: '#7fffd4',
    warning: '#ffe4b5',
    error: '#fa8072',
    errorDim: 'rgba(250,128,114,0.07)',
    errorHover: 'rgba(250,128,114,0.13)',
    methodGet: '#00ffcc',
    methodGetBg: 'rgba(0,255,204,0.13)',
    methodPost: '#00d4ff',
    methodPostBg: 'rgba(0,212,255,0.13)',
    methodPut: '#ffaa00',
    methodPutBg: 'rgba(255,170,0,0.13)',
    methodPatch: '#bc13fe',
    methodPatchBg: 'rgba(188,19,254,0.13)',
    methodDelete: '#ff003c',
    methodDeleteBg: 'rgba(255,0,60,0.13)',
    methodHead: '#999',
    methodHeadBg: 'rgba(153,153,153,0.13)',
    jsonKey: '#9cdcfe',
    jsonString: '#ce9178',
    jsonNumber: '#b5cea8',
    jsonBoolean: '#569cd6',
    jsonNull: '#569cd6',
  },
  dark: {
    name: 'Dark',
    bg: '#0d0d12',
    bgSecondary: '#16161e',
    bgTertiary: '#1e1e2e',
    border: '#2a2a3a',
    text: '#cdd6f4',
    textDim: '#7f849c',
    textMuted: '#585b70',
    brand: '#f38ba8',        // Pink
    brandDim: 'rgba(243,139,168,0.07)',
    brandHover: 'rgba(243,139,168,0.13)',
    success: '#a6e3a1',      // Soft green
    warning: '#f9e2af',      // Peach
    error: '#f38ba8',        // Pink (same as brand)
    errorDim: 'rgba(243,139,168,0.07)',
    errorHover: 'rgba(243,139,168,0.13)',
    methodGet: '#89b4fa',    // Blue
    methodGetBg: 'rgba(137,180,250,0.13)',
    methodPost: '#cba6f7',   // Lavender
    methodPostBg: 'rgba(203,166,247,0.13)',
    methodPut: '#fab387',    // Peach
    methodPutBg: 'rgba(250,179,135,0.13)',
    methodPatch: '#f5c2e7',  // Pink
    methodPatchBg: 'rgba(245,194,231,0.13)',
    methodDelete: '#f38ba8', // Pink
    methodDeleteBg: 'rgba(243,139,168,0.13)',
    methodHead: '#9399b2',   // Gray
    methodHeadBg: 'rgba(147,153,178,0.13)',
    jsonKey: '#89b4fa',
    jsonString: '#a6e3a1',
    jsonNumber: '#fab387',
    jsonBoolean: '#cba6f7',
    jsonNull: '#cba6f7',
  },
};

export function generateCSS(theme) {
  const t = THEMES[theme] || THEMES.teal;
  return `* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: ${t.bg};
  --bg-secondary: ${t.bgSecondary};
  --bg-tertiary: ${t.bgTertiary};
  --border: ${t.border};
  --text: ${t.text};
  --text-dim: ${t.textDim};
  --text-muted: ${t.textMuted};
  --brand: ${t.brand};
  --brand-dim: ${t.brandDim};
  --brand-hover: ${t.brandHover};
  --success: ${t.success};
  --warning: ${t.warning};
  --error: ${t.error};
  --error-dim: ${t.errorDim};
  --error-hover: ${t.errorHover};
  --method-get: ${t.methodGet};
  --method-get-bg: ${t.methodGetBg};
  --method-post: ${t.methodPost};
  --method-post-bg: ${t.methodPostBg};
  --method-put: ${t.methodPut};
  --method-put-bg: ${t.methodPutBg};
  --method-patch: ${t.methodPatch};
  --method-patch-bg: ${t.methodPatchBg};
  --method-delete: ${t.methodDelete};
  --method-delete-bg: ${t.methodDeleteBg};
  --method-head: ${t.methodHead};
  --method-head-bg: ${t.methodHeadBg};
  --json-key: ${t.jsonKey};
  --json-string: ${t.jsonString};
  --json-number: ${t.jsonNumber};
  --json-boolean: ${t.jsonBoolean};
  --json-null: ${t.jsonNull};
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Mono', Monaco, 'Courier New', monospace;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  min-height: 100vh;
}
.header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 16px 20px;
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header h1 {
  font-size: 18px;
  font-weight: 600;
  color: var(--brand);
  letter-spacing: -0.3px;
}
.meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
  flex-wrap: wrap;
}
.meta span { display: flex; align-items: center; gap: 6px; }
.meta .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); }
.meta .dot.offline { background: var(--warning); }
.container { padding: 16px 20px; max-width: 1400px; margin: 0 auto; }
.status-bar {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.status-bar .url {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
  color: var(--brand);
  word-break: break-all;
}
.status-bar .label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.controls { display: flex; gap: 8px; align-items: center; }
.btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: #ccc;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.btn:hover { background: #222; border-color: #444; color: #fff; }
.btn:active { background: var(--bg-tertiary); }
.btn.primary { background: var(--brand-dim); border-color: var(--brand); color: var(--brand); }
.btn.primary:hover { background: var(--brand-hover); }
.btn.danger { background: var(--error-dim); border-color: var(--error); color: var(--error); }
.btn.danger:hover { background: var(--error-hover); }
.table-wrapper {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
}
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { position: sticky; top: 0px; z-index: 10; width: 100%; }
th {
  text-align: left;
  padding: 10px 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
td {
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--bg-tertiary);
  font-family: 'SF Mono', Monaco, monospace;
  vertical-align: top;
}
.time-col { width: 90px; color: var(--text-dim); }
.method-col { width: 70px; }
.url-col { width: auto; word-break: break-all; overflow-wrap: break-word; color: #aaa; }
.status-col { width: 60px; text-align: center; }
.dur-col { width: 70px; text-align: right; color: var(--text-dim); }

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.request-row {
  cursor: pointer;
  transition: background 0.15s;
  animation: slideIn 0.25s ease-out;
}
.request-row:hover td { background: #161616; }
.request-row:active td { background: var(--bg-tertiary); }
.request-row.filtered { display: none; }

.detail-row { animation: slideIn 0.25s ease-out; }
.detail-row td { padding: 0; border: none; }
.detail-panel {
  background: var(--bg);
  border-left: 3px solid var(--brand);
  margin: 0 12px 12px;
  padding: 14px;
  border-radius: 0 6px 6px 0;
  animation: slideIn 0.25s ease-out;
}
.detail-section { margin-bottom: 14px; }
.detail-section:last-child { margin-bottom: 0; }
.detail-section h4 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-section pre {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  font-size: 11px;
  color: #ccc;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  position: relative;
}
.method {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.method.get { background: var(--method-get-bg); color: var(--method-get); }
.method.post { background: var(--method-post-bg); color: var(--method-post); }
.method.put { background: var(--method-put-bg); color: var(--method-put); }
.method.patch { background: var(--method-patch-bg); color: var(--method-patch); }
.method.delete { background: var(--method-delete-bg); color: var(--method-delete); }
.method.head { background: var(--method-head-bg); color: var(--method-head); }
.empty {
  text-align: center;
  padding: 48px;
  color: #444;
  font-size: 13px;
}
.empty-hint { color: #555; font-style: italic; }
.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--brand);
  background: var(--brand-dim);
  padding: 4px 10px;
  border-radius: 12px;
  flex-shrink: 0;
}
.live-badge::before {
  content: '';
  width: 6px; height: 6px;
  background: var(--brand);
  border-radius: 50%;
  animation: pulse 2s infinite;
}
.stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  flex: 1;
  min-width: 150px;
}
.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--brand);
  font-family: 'SF Mono', Monaco, monospace;
}
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-input {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  min-width: 200px;
}
.filter-input:focus { outline: none; border-color: var(--brand); }
.filter-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.filter-select:focus { outline: none; border-color: var(--brand); }
.copy-btn {
  background: var(--bg-tertiary);
  border: 1px solid #333;
  color: #888;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover { background: #222; border-color: var(--brand); color: var(--brand); }
.copy-btn.copied { background: var(--brand-dim); border-color: var(--brand); color: var(--brand); }
.json-key { color: var(--json-key); }
.json-string { color: var(--json-string); }
.json-number { color: var(--json-number); }
.json-boolean { color: var(--json-boolean); }
.json-null { color: var(--json-null); }
.body-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  font-size: 11px;
  color: #ccc;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
.body-actions { display: flex; gap: 8px; margin-top: 8px; }
.replay-result {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  margin-top: 8px;
  font-size: 11px;
  color: #ccc;
  max-height: 200px;
  overflow-y: auto;
}
.theme-toggle {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.theme-toggle:hover { border-color: var(--brand); color: var(--brand); }
.theme-toggle svg { width: 16px; height: 16px; }

@media (max-width: 768px) {
  .dur-col, .time-col { display: none; }
  .header h1 { font-size: 16px; }
  .meta { font-size: 11px; }
  .container { padding: 12px; }
  .status-bar { padding: 10px 12px; }
  .stats { flex-direction: column; }
  .stat-card { min-width: 100%; }
}`;
}
