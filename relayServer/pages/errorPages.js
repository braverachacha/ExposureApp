// relayServer/pages/errorPages.js

const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeBold = (str) =>
  escapeHtml(str).replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>');

export const errorPage = (code, title, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(code)} | ApexTunnel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Mono', Monaco, 'Courier New', monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafb;
      color: #0f172a;
      padding: 20px;
    }
    .card {
      max-width: 520px;
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 56px 48px;
      text-align: center;
      box-shadow: 0 4px 6px rgba(0,0,0,0.02), 0 12px 40px rgba(0,0,0,0.06);
      animation: slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(13,148,136,0.3); }
      50% { box-shadow: 0 0 0 12px rgba(13,148,136,0); }
    }
    .icon {
      width: 72px;
      height: 72px;
      background: rgba(13,148,136,0.08);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      animation: pulse 2s infinite;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      color: #0d9488;
    }
    h1 {
      font-size: 64px;
      font-weight: 800;
      color: #0d9488;
      letter-spacing: -2px;
      line-height: 1;
      margin-bottom: 8px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 16px;
    }
    p {
      font-size: 15px;
      line-height: 1.7;
      color: #64748b;
      margin-bottom: 12px;
    }
    a {
      display: inline-block;
      color: #0d9488;
      text-decoration: none;
      font-weight: 600;
      padding: 10px 24px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #f8fafb;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      margin-top: 8px;
    }
    a:hover {
      background: #0d9488;
      color: #ffffff;
      border-color: #0d9488;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(13,148,136,0.2);
    }
    strong {
      color: #0d9488;
      font-weight: 600;
    }
    .divider {
      width: 40px;
      height: 3px;
      background: #0d9488;
      border-radius: 2px;
      margin: 24px auto;
      opacity: 0.3;
    }
    .footer {
      margin-top: 32px;
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </div>
    <h1>${escapeHtml(code)}</h1>
    <h2>${escapeHtml(title)}</h2>
    <div class="divider"></div>
    <p>${safeBold(message)}</p>
    <p><a href="/">Try Again</a></p>
    <div class="footer">ApexTunnel v2.0.1 • BraveraTech</div>
  </div>
</body>
</html>`;
