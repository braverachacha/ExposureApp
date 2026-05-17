<p align="center">
  <img src="./assets/logo.svg" width="400" alt="ApexTunnel Logo">
</p>

<br>

# ApexTunnel v2.0.1

A self-hosted reverse tunnel. Expose any local server to the internet via a persistent TCP connection between a relay (VPS) and a client (your machine).

```
Browser → relay:443 ──── TCP ────→ client → localhost:8000
```

## What's New in v2.0.1

- **Binary Framing Protocol** — replaces newline-delimited JSON with a robust binary frame format supporting streaming bodies without base64 encoding
- **Streaming Bodies** — images, videos, audio, and large files are streamed directly without loading into memory
- **TLS Tunnel Encryption** — optional TLS wrapping on the TCP tunnel between relay and client
- **Heartbeat & Connection Management** — automatic dead connection detection and cleanup
- **Rate Limiting** — IP-based rate limiting on both HTTP and registration endpoints
- **Backpressure Control** — prevents memory exhaustion when client is slower than relay
- **Subdomain Reclaim** — stale connections are forcefully reclaimed instead of permanently blocking the subdomain
- **Prometheus Metrics** — `/metrics` and `/health` endpoints for observability
- **Security Hardening** — input validation, header sanitization, request size limits, and safer token validation
- **Test Suite** — comprehensive unit tests for protocol, rate limiting, security, and backpressure
- **Graceful Shutdown** — clean resource cleanup on SIGINT/SIGTERM

## Stack

Pure Node.js — `net` `tls` `http` `crypto`. No npm packages on the relay. Client uses `blessed` for the terminal UI.

## Setup

### 1. Relay — Run on your VPS

```bash
cd ExposureApp/relayServer

# 1. Generate TLS certificates for secure tunneling
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes

# 2. Configure environment
cp .env.example .env
# Edit .env to set your API_URL, INTERNAL_SECRET, and FRONTEND_URL

# 3. Start the relay
pnpm install
pnpm dev
```

### 2. Client — Run locally

**Option A — Download binary** (Linux / macOS / Windows)

Grab the binary for your platform from the <a href="https://github.com/braverachacha/ExposureApp/releases">releases page, then:</a>

```bash
# Linux/macOS — make it executable and move to PATH
chmod +x apex-linux-arm64   # or apex-linux-x64 / apex-macos-x64
sudo mv apex-linux-arm64 /usr/local/bin/apex
```

**Option B — Run from source** (Termux / Android or any Node.js environment)

```bash
cd ExposureApp/clientServer
pnpm install
pnpm run bundle          # builds dist/bundle.cjs

# Link globally so the `apex` command is available anywhere
pnpm link --global
```

---

Once installed, save your auth token once:

```bash
apex authtoken <your_token>
```

Then expose a local port:

```bash
# Expose port 3000
apex http 3000

# Expose with a custom subdomain
apex http 3000 --subdomain myapp
```

```
✔ Authtoken saved to ~/.apextunnel

┌─────────────────────────────────────────────────────────┐
│  ApexTunnel v2.0.1                                      │
│  ─────────────────────────────────────────              │
│  Account     you@example.com (Free)                     │
│  Status      ● online                                   │
│  Forwarding  https://swift-falcon.apextunnel.top ->     │
│  localhost:3000                                         │
└─────────────────────────────────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `apex http <port>` | Expose a local port |
| `apex http <port> --subdomain <name>` | Expose with a custom subdomain |
| `apex authtoken <token>` | Save your auth token |
| `apex status` | Show saved token & relay info |
| `apex help` | Show help message |

## Keybinds

| Key | Action |
|-----|--------|
| `Q` | Quit |
| `R` | Restart tunnel |
| `C` | Clear request log |
| `O` | Open tunnel URL in browser |

## Env Overrides (debugging)

| Variable | Default | Description |
|----------|---------|-------------|
| `APEX_RELAY` | `relay.apextunnel.top` | Relay hostname |
| `APEX_RELAY_PORT` | `9000` | Relay port |
| `APEX_TLS` | `false` | Enable TLS on tunnel connection |
| `APEX_TLS_CA` | — | Path to CA cert for self-signed TLS |

## Observability

The relay exposes a metrics server on port `9090` (configurable via `METRICS_PORT`):

- `GET /metrics` — Prometheus-compatible metrics
- `GET /health` — Health check JSON

Metrics include:
- `apex_requests_total` — Counter by method and status
- `apex_request_duration_seconds` — Histogram of request latencies
- `apex_connections_total` — Total client connections
- `apex_active_connections` — Gauge of currently connected clients
- `apex_uptime_seconds` — Process uptime

## Testing

```bash
# Install root dev dependencies
pnpm install

# Run all tests
pnpm test

# Watch mode
pnpm test:watch
```

## File Structure

```
ExposureApp-v2/
├── .gitignore
├── CHANGELOG.md
├── README.md
├── SECURITY.md
├── package.json
├── vitest.config.js
├── tests/
│   ├── protocol.test.js
│   ├── rateLimiter.test.js
│   ├── security.test.js
│   └── backpressure.test.js
├── clientServer/
│   ├── client.js
│   ├── package.json
│   └── src/
│       ├── auth.js
│       ├── cli.js
│       ├── clientError.js
│       ├── connection.js
│       └── protocol.js
└── relayServer/
    ├── .env.example
    ├── logger.js
    ├── package.json
    ├── relay.js
    ├── handlers/
    │   └── register.js
    ├── pages/
    │   └── errorPages.js
    └── src/
        ├── protocol.js
        ├── connectionManager.js
        ├── rateLimiter.js
        ├── security.js
        ├── metrics.js
        ├── backpressure.js
        └── tls.js
```

## License

ISC
