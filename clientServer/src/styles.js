// clientServer/src/styles.js
export const INSPECTOR_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Mono', Monaco, 'Courier New', monospace;
  background: #0a0a0a;
  color: #e0e0e0;
  line-height: 1.5;
  min-height: 100vh;
}
.header {
  background: #111;
  border-bottom: 1px solid #222;
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
  color: #00ff88;
  letter-spacing: -0.3px;
}
.meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #666;
  flex-wrap: wrap;
}
.meta span { display: flex; align-items: center; gap: 6px; }
.meta .dot { width: 8px; height: 8px; border-radius: 50%; background: #00ff88; }
.meta .dot.offline { background: #ffcc00; }
.container { padding: 16px 20px; max-width: 1400px; margin: 0 auto; }
.status-bar {
  background: #111;
  border: 1px solid #222;
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
  color: #00ff88;
  word-break: break-all;
}
.status-bar .label {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.controls { display: flex; gap: 8px; align-items: center; }
.btn {
  background: #1a1a1a;
  border: 1px solid #333;
  color: #ccc;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.btn:hover { background: #222; border-color: #444; color: #fff; }
.btn:active { background: #1a1a1a; }
.btn.primary { background: #00ff8811; border-color: #00ff88; color: #00ff88; }
.btn.primary:hover { background: #00ff8822; }
.btn.danger { background: #ff444411; border-color: #ff4444; color: #ff4444; }
.btn.danger:hover { background: #ff444422; }
.table-wrapper {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid #222;
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
  color: #666;
  background: #111;
  border-bottom: 1px solid #222;
}
td {
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid #1a1a1a;
  font-family: 'SF Mono', Monaco, monospace;
  vertical-align: top;
}
.time-col { width: 90px; color: #888; }
.method-col { width: 70px; }
.url-col { width: auto; word-break: break-all; overflow-wrap: break-word; color: #aaa; }
.status-col { width: 60px; text-align: center; }
.dur-col { width: 70px; text-align: right; color: #888; }

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
.request-row:active td { background: #1a1a1a; }
.request-row.filtered { display: none; }

.detail-row { animation: slideIn 0.25s ease-out; }
.detail-row td { padding: 0; border: none; }
.detail-panel {
  background: #0a0a0a;
  border-left: 3px solid #00ff88;
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
  color: #666;
  margin-bottom: 6px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-section pre {
  background: #111;
  border: 1px solid #222;
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
.method.get { background: #00ff8822; color: #00ff88; }
.method.post { background: #00aaff22; color: #00aaff; }
.method.put { background: #ffaa0022; color: #ffaa00; }
.method.patch { background: #aa00ff22; color: #aa00ff; }
.method.delete { background: #ff004422; color: #ff0044; }
.method.head { background: #66666622; color: #999; }
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
  color: #00ff88;
  background: #00ff8811;
  padding: 4px 10px;
  border-radius: 12px;
  flex-shrink: 0;
}
.live-badge::before {
  content: '';
  width: 6px; height: 6px;
  background: #00ff88;
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
  background: #111;
  border: 1px solid #222;
  border-radius: 8px;
  padding: 12px 16px;
  flex: 1;
  min-width: 150px;
}
.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #666;
  margin-bottom: 4px;
}
.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #00ff88;
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
  background: #111;
  border: 1px solid #222;
  color: #e0e0e0;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  min-width: 200px;
}
.filter-input:focus { outline: none; border-color: #00ff88; }
.filter-select {
  background: #111;
  border: 1px solid #222;
  color: #e0e0e0;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.filter-select:focus { outline: none; border-color: #00ff88; }
.copy-btn {
  background: #1a1a1a;
  border: 1px solid #333;
  color: #888;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.copy-btn:hover { background: #222; border-color: #00ff88; color: #00ff88; }
.copy-btn.copied { background: #00ff8822; border-color: #00ff88; color: #00ff88; }
.json-key { color: #9cdcfe; }
.json-string { color: #ce9178; }
.json-number { color: #b5cea8; }
.json-boolean { color: #569cd6; }
.json-null { color: #569cd6; }
.body-preview {
  background: #111;
  border: 1px solid #222;
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
  background: #111;
  border: 1px solid #222;
  border-radius: 4px;
  padding: 10px;
  margin-top: 8px;
  font-size: 11px;
  color: #ccc;
  max-height: 200px;
  overflow-y: auto;
}
.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  border-bottom: 1px solid #222;
  padding-bottom: 4px;
}
.tab {
  background: transparent;
  border: none;
  color: #666;
  padding: 4px 12px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.tab:hover { color: #ccc; }
.tab.active { background: #00ff8811; color: #00ff88; }

@media (max-width: 768px) {
  .dur-col, .time-col { display: none; }
  .header h1 { font-size: 16px; }
  .meta { font-size: 11px; }
  .container { padding: 12px; }
  .status-bar { padding: 10px 12px; }
  .stats { flex-direction: column; }
  .stat-card { min-width: 100%; }
}`;
