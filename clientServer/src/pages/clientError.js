export function getClientErrorPage(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>502 | Local App Unreachable</title>
  <style>
    body {
      font-family: 'Courier New', Courier, monospace;
      max-width: 600px;
      margin: 80px auto;
      padding: 0 20px;
      color: #00ff88;
      background: #0a0a0a;
      text-align: center;
    }
    h1 { font-size: 72px; margin: 0; color: #00ff88; text-shadow: 0 0 20px #00ff8844; }
    h2 { margin-top: 10px; color: #00cc6a; font-weight: 500; }
    p { line-height: 1.6; color: #88ffaa; }
    .footer { margin-top: 40px; font-size: 12px; color: #44aa66; }
    strong { color: #00ff88; }
  </style>
</head>
<body>
  <h1>502</h1>
  <h2>Local App Unreachable</h2>
  <p>The tunnel is active, but your local server on port <strong>${port}</strong> is not responding.</p>
  <p class="footer">ApexTunnel v2.0.1 • BraveraTech</p>
</body>
</html>`;
}
