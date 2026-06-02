// clientServer/src/pages/inspectorPage.js
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function truncateUrl(url, max) {
  return typeof url === 'string' && url.length > max ? url.slice(0, max) + '…' : url || '';
}

export const inspectorPage = (state, css, currentTheme = 'teal') => {
  const { info } = state;
  const safeInfo = {
    online: !!info?.online,
    email: info?.email || '—',
    isPremium: !!info?.isPremium,
    subdomain: info?.subdomain || '',
    port: info?.port || '',
  };
  const nextTheme = currentTheme === 'teal' ? 'dark' : 'teal';
  
  const sunIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
  const moonIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const themeIcon = currentTheme === 'teal' ? moonIcon : sunIcon;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ApexTunnel Inspector</title>
<style>${css}</style>
</head>
<body>
<div class="header">
<div>
<h1>⚡ ApexTunnel Inspector</h1>
<div class="meta">
<span><div class="dot ${safeInfo.online ? '' : 'offline'}"></div> ${safeInfo.online ? 'Online' : 'Connecting…'}</span>
<span>📧 ${escapeHtml(safeInfo.email)}</span>
<span>${safeInfo.isPremium ? '⭐ Premium' : '○ Free'}</span>
</div>
</div>
<button class="theme-toggle" id="theme-btn" onclick="toggleTheme()" title="Switch to ${nextTheme} theme">${themeIcon}</button>
</div>
<div class="container">
<div class="status-bar">
<div>
<div class="label">Forwarding</div>
<div class="url">${safeInfo.subdomain ? 'https://' + escapeHtml(safeInfo.subdomain) + '.apextunnel.top → localhost:' + escapeHtml(safeInfo.port) : 'Pending…'}</div>
</div>
<div style="display: flex; gap: 8px; align-items: center;">
<div class="live-badge">Live</div>
<button class="btn primary" onclick="downloadLog()">Export</button>
</div>
</div>
<div class="stats">
<div class="stat-card"><div class="stat-label">Total Requests</div><div class="stat-value" id="total-count">0</div></div>
<div class="stat-card"><div class="stat-label">Requests / min</div><div class="stat-value" id="rate">0</div></div>
<div class="stat-card"><div class="stat-label">Avg Response Time</div><div class="stat-value" id="avg-time">—</div></div>
<div class="stat-card"><div class="stat-label">Error Rate</div><div class="stat-value" id="error-rate">0%</div></div>
</div>
<div class="filter-bar">
<input type="text" class="filter-input" id="filter-url" placeholder="Filter by URL..." oninput="applyFilters()">
<select class="filter-select" id="filter-method" onchange="applyFilters()">
<option value="">All Methods</option>
<option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
<option value="PATCH">PATCH</option><option value="DELETE">DELETE</option><option value="HEAD">HEAD</option>
</select>
<select class="filter-select" id="filter-status" onchange="applyFilters()">
<option value="">All Status</option>
<option value="2xx">2xx Success</option><option value="3xx">3xx Redirect</option>
<option value="4xx">4xx Client Error</option><option value="5xx">5xx Server Error</option>
</select>
<button class="btn clear" onclick="clearFilters()">Clear</button>
</div>
<div class="table-wrapper">
<table>
<thead><tr><th class="time-col">Time</th><th class="method-col">Method</th><th class="url-col">Path</th><th class="status-col">Status</th><th class="dur-col">Duration</th></tr></thead>
<tbody><tr><td colspan="5" class="empty">Waiting for requests…</td></tr></tbody>
</table>
</div>
</div>
<script>
async function toggleTheme() {
  const btn = document.getElementById('theme-btn');
  btn.disabled = true;
  btn.innerHTML = '...';
  try {
    const res = await fetch('/api/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: '${nextTheme}' }) });
    if (res.ok) window.location.reload();
    else throw new Error('Failed');
  } catch {
    btn.innerHTML = 'Error';
    setTimeout(() => { btn.disabled = false; btn.innerHTML = '${themeIcon.replace(/'/g, "\\'")}'; }, 1000);
  }
}
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
let allRequests = [];
const MAX_STORED = 500;
let activeDetailId = null;
function toggleDetail(id) {
  const row = document.getElementById(id);
  const isVisible = row.style.display !== 'none';
  document.querySelectorAll('.detail-row').forEach(r => r.style.display = 'none');
  if (!isVisible) { row.style.display = 'table-row'; activeDetailId = id; loadBodyPreview(id); }
  else { activeDetailId = null; }
}
function truncateUrl(url, max) { return url && url.length > max ? url.slice(0, max) + '…' : url || ''; }
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function syntaxHighlightJson(json) {
  let str = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/("(\\\\.|[^"])*"(\\s*:)?)/g, m => {
      let cls = 'json-string';
      if (/:$/.test(m)) { cls = 'json-key'; m = m.slice(0,-1)+'</span>:'; return '<span class="'+cls+'">'+m; }
      return '<span class="'+cls+'">'+m+'</span>';
    })
    .replace(/\\b(true|false)\\b/g, '<span class="json-boolean">$1</span>')
    .replace(/\\b(null)\\b/g, '<span class="json-null">$1</span>')
    .replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="json-number">$1</span>');
}
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
  });
}
function updateStats() {
  const total = allRequests.length;
  const now = Date.now(), oneMinAgo = now - 60000;
  const recentReqs = allRequests.filter(r => r._timestamp > oneMinAgo);
  const rate = recentReqs.length;
  const errors = allRequests.filter(r => r.status >= 400);
  const errorRate = total > 0 ? Math.round((errors.length / total) * 100) : 0;
  const avgTime = total > 0 ? Math.round(allRequests.reduce((s, r) => s + r.duration, 0) / total) : 0;
  document.getElementById('total-count').textContent = total;
  document.getElementById('rate').textContent = rate;
  document.getElementById('avg-time').textContent = avgTime + 'ms';
  document.getElementById('error-rate').textContent = errorRate + '%';
}
function downloadLog() {
  const json = JSON.stringify(allRequests, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'apex-requests-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
}
function applyFilters() {
  const urlFilter = document.getElementById('filter-url').value.toLowerCase();
  const methodFilter = document.getElementById('filter-method').value;
  const statusFilter = document.getElementById('filter-status').value;
  document.querySelectorAll('.request-row').forEach(row => {
    const method = row.querySelector('.method-col .method').textContent;
    const url = row.querySelector('.url-col').textContent.toLowerCase();
    const status = parseInt(row.querySelector('.status-col').textContent) || 0;
    let show = true;
    if (urlFilter && !url.includes(urlFilter)) show = false;
    if (methodFilter && method !== methodFilter) show = false;
    if (statusFilter) { const sg = Math.floor(status / 100) + 'xx'; if (sg !== statusFilter) show = false; }
    row.classList.toggle('filtered', !show);
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains('detail-row')) detail.style.display = 'none';
  });
}
function clearFilters() {
  document.getElementById('filter-url').value = '';
  document.getElementById('filter-method').value = '';
  document.getElementById('filter-status').value = '';
  applyFilters();
}
async function loadBodyPreview(detailId) {
  const detailRow = document.getElementById(detailId);
  if (!detailRow) return;
  const reqData = allRequests.find(r => r._detailId === detailId);
  if (!reqData) return;
  if (reqData.reqBodyPath) {
    const reqBodyId = reqData.reqBodyPath.replace(/.*[/\\\\]/, '');
    const previewEl = detailRow.querySelector('.req-body-preview');
    if (previewEl && !previewEl.dataset.loaded) {
      try {
        const res = await fetch('/api/preview/' + reqBodyId);
        const data = await res.json();
        previewEl.innerHTML = syntaxHighlightJson(data.content);
        previewEl.dataset.loaded = 'true';
        if (data.truncated) { const link = previewEl.nextElementSibling; if (link) link.style.display = 'block'; }
      } catch {}
    }
  }
  if (reqData.resBodyPath) {
    const resBodyId = reqData.resBodyPath.replace(/.*[/\\\\]/, '');
    const previewEl = detailRow.querySelector('.res-body-preview');
    if (previewEl && !previewEl.dataset.loaded) {
      try {
        const res = await fetch('/api/preview/' + resBodyId);
        const data = await res.json();
        previewEl.innerHTML = syntaxHighlightJson(data.content);
        previewEl.dataset.loaded = 'true';
        if (data.truncated) { const link = previewEl.nextElementSibling; if (link) link.style.display = 'block'; }
      } catch {}
    }
  }
}
async function replayRequest(reqData) {
  const btn = document.getElementById('replay-btn-' + reqData._detailId);
  if (btn) { btn.textContent = 'Replaying...'; btn.disabled = true; }
  try {
    let bodyContent = null;
    if (reqData.reqBodyPath) {
      const reqBodyId = reqData.reqBodyPath.replace(/.*[/\\\\]/, '');
      const res = await fetch('/api/body/' + reqBodyId);
      bodyContent = await res.text();
    }
    const res = await fetch('/api/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: reqData.method, url: reqData.url, headers: reqData.reqHeaders || {}, bodyPath: reqData.reqBodyPath, bodyContent })
    });
    const result = await res.json();
    const resultEl = document.getElementById('replay-result-' + reqData._detailId);
    if (resultEl) {
      const statusColor = result.status >= 400 ? '#ff4444' : '#00ff88';
      resultEl.innerHTML = '<div style="color:' + statusColor + ';font-weight:600;margin-bottom:4px;">Status: ' + (result.status || 'Error') + '</div><pre style="white-space:pre-wrap;word-break:break-all;">' + escapeHtml(result.body || result.error || '') + '</pre>';
      resultEl.style.display = 'block';
    }
  } catch (err) {
    const resultEl = document.getElementById('replay-result-' + reqData._detailId);
    if (resultEl) { resultEl.innerHTML = '<div style="color:#ff4444;">Replay failed: ' + escapeHtml(err.message) + '</div>'; resultEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = '↻ Replay'; btn.disabled = false; }
  }
}
function createDetailPanel(r, reqId) {
  const reqHeadersJson = r.reqHeaders && Object.keys(r.reqHeaders).length ? JSON.stringify(r.reqHeaders, null, 2) : null;
  const resHeadersJson = r.resHeaders && Object.keys(r.resHeaders).length ? JSON.stringify(r.resHeaders, null, 2) : null;
  const reqBodyId = r.reqBodyPath ? r.reqBodyPath.replace(/.*[/\\\\]/, '') : null;
  const resBodyId = r.resBodyPath ? r.resBodyPath.replace(/.*[/\\\\]/, '') : null;
  const reqBodyDownload = reqBodyId ? '<a href="/api/body/' + escapeHtml(reqBodyId) + '" target="_blank" style="color:var(--method-post)">Download request body (' + formatBytes(r.reqBodySize || 0) + ')</a>' : '';
  const resBodyDownload = resBodyId ? '<a href="/api/body/' + escapeHtml(resBodyId) + '" target="_blank" style="color:var(--success)">Download response body (' + formatBytes(r.resBodySize || 0) + ')</a>' : '';
  return '<div class="detail-panel">' +
    '<div class="detail-section"><h4>Request Headers <button class="copy-btn" onclick="copyToClipboard(' + JSON.stringify(reqHeadersJson || '').replace(/"/g, '&quot;') + ', this)">Copy</button></h4><pre>' + (reqHeadersJson ? syntaxHighlightJson(reqHeadersJson) : '<em class="empty-hint">No headers captured</em>') + '</pre></div>' +
    (reqBodyId || reqBodyDownload ? '<div class="detail-section"><h4>Request Body</h4><div class="body-preview req-body-preview" data-loaded="false"><em class="empty-hint">Loading preview...</em></div><div class="body-actions">' + reqBodyDownload + '</div></div>' : '') +
    '<div class="detail-section"><h4>Response Headers <button class="copy-btn" onclick="copyToClipboard(' + JSON.stringify(resHeadersJson || '').replace(/"/g, '&quot;') + ', this)">Copy</button></h4><pre>' + (resHeadersJson ? syntaxHighlightJson(resHeadersJson) : '<em class="empty-hint">No headers captured</em>') + '</pre></div>' +
    (resBodyId || resBodyDownload ? '<div class="detail-section"><h4>Response Body</h4><div class="body-preview res-body-preview" data-loaded="false"><em class="empty-hint">Loading preview...</em></div><div class="body-actions">' + resBodyDownload + '</div></div>' : '') +
    '<div class="detail-section"><h4>Actions</h4><div class="body-actions"><button class="btn primary" id="replay-btn-' + reqId + '" onclick="replayRequest(allRequests.find(r => r._detailId === \\'' + reqId + '\\'))">↻ Replay</button></div><div class="replay-result" id="replay-result-' + reqId + '" style="display:none"></div></div>' +
  '</div>';
}
const tbody = document.querySelector('tbody');
const es = new EventSource('/api/stream');
function addRequestRow(r, isNew = true) {
  r._timestamp = r._timestamp || Date.now();
  r._detailId = r._detailId || ('req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
  const statusColor = r.status >= 500 ? 'var(--error)' : r.status >= 400 ? 'var(--warning)' : 'var(--success)';
  const reqId = r._detailId;
  const rawTime = r.time || new Date().toISOString();
  const displayTime = rawTime.includes('T') ? rawTime.slice(11, 19) : rawTime;
  const tr = document.createElement('tr');
  tr.className = 'request-row';
  tr.dataset.method = r.method;
  tr.dataset.status = r.status;
  tr.onclick = () => toggleDetail(reqId);
  const escapedUrl = escapeHtml(truncateUrl(r.url, 60));
  const escapedMethod = escapeHtml(r.method);
  tr.innerHTML = '<td class="time-col">' + escapeHtml(displayTime) + '</td><td class="method-col"><span class="method ' + escapedMethod.toLowerCase() + '">' + escapedMethod + '</span></td><td class="url-col">' + escapedUrl + '</td><td class="status-col" style="color:' + statusColor + ';font-weight:600">' + r.status + '</td><td class="dur-col">' + r.duration + 'ms</td>';
  const detailTr = document.createElement('tr');
  detailTr.className = 'detail-row';
  detailTr.id = reqId;
  detailTr.style.display = 'none';
  detailTr.innerHTML = '<td colspan="5">' + createDetailPanel(r, reqId) + '</td>';
  if (tbody.querySelector('.empty')) tbody.innerHTML = '';
  if (isNew) { tbody.insertBefore(detailTr, tbody.firstChild); tbody.insertBefore(tr, tbody.firstChild); }
  else { tbody.appendChild(tr); tbody.appendChild(detailTr); }
  const allRows = tbody.querySelectorAll('.request-row');
  while (allRows.length > 50) {
    const lastRow = tbody.querySelectorAll('.request-row')[49];
    const lastDetail = lastRow?.nextElementSibling;
    if (lastDetail?.classList.contains('detail-row')) lastDetail.remove();
    lastRow?.remove();
  }
  applyFilters(); updateStats();
}
es.onmessage = e => {
  try {
    const r = JSON.parse(e.data);
    allRequests.push(r);
    while (allRequests.length > MAX_STORED) allRequests.shift();
    addRequestRow(r, true);
  } catch (err) { console.error('EventSource parse error:', err); }
};
es.onerror = () => { console.error('EventSource connection lost'); setTimeout(() => location.reload(), 3000); };
fetch('/api/requests').then(r => r.json()).then(data => {
  if (data.length > 0) {
    tbody.innerHTML = '';
    data.reverse().forEach(r => { allRequests.push(r); addRequestRow(r, false); });
  }
}).catch(err => console.error('Failed to load history:', err));
setInterval(updateStats, 5000); updateStats();
</script>
</body>
</html>`;
};
