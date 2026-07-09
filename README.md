<p align="center">
  <img src="./assets/logo.svg" width="400" alt="ApexTunnel Logo">
</p>

<br>

# ApexTunnel

Expose any local server to the internet via a secure tunnel between your machine and a relay server.

```
Browser → relay:443 ──── TCP ────→ client → localhost:3000
```

# What's ApexTunnel?

ApexTunnel is a lightweight tunneling application designed to expose your locally running applications to the internet. By generating secure, public URLs on the fly, it allows you to instantly share your progress with clients, teammates, and friends—all before you write a single line of deployment code.

>️ **Note:** ApexTunnel is strictly a local proxy and sharing tool. It is **not** a production deployment tool or hosting service.

# What's ApexTunnel used for?

ApexTunnel is optimized for **small-to-medium applications** and shines brightest when testing **backend services**. It is perfect for:
* Publicly testing APIs and webhooks (like Stripe or GitHub actions) locally.
* Demoing full-stack or backend MVPs to clients without spinning up cloud infrastructure.
* Speeding up microservice integration testing.




---

## Getting an Auth Token

1. Go to [our website](https://apextunnel.top) and create an account.
2. After signing in, navigate to your dashboard and copy your auth token
3. Save it locally.

> **Tip:** Alternatively, you can chat with our [Telegram Bot](https://t.me/apextunnel_bot?text=Help%20me%20setup%20my%20account) to get started instantly.


```bash
apex authtoken <your_token>
```

Your token is encrypted and stored on your machine. To update it later:

```bash
apex new token <your_token>
```

---

## Installation

### Download a binary

Grab the binary for your platform from the [releases page](https://github.com/braverachacha/ExposureApp/releases):

| Platform | File |
|----------|------|
| Linux x64 | `apex-linux-x64` |
| Linux ARM64 | `apex-linux-arm64` |
| macOS x64 | `apex-macos-x64` |
| Windows ARM64 | `apex-win-arm64` |

### Make it executable

```bash
chmod +x apex-linux-arm64   # replace with your downloaded filename
```

### Add to PATH

Moving the binary to `/usr/local/bin` makes the `apex` command available anywhere in your terminal:

```bash
sudo mv apex-linux-arm64 /usr/local/bin/apex
```

Verify the install:

```bash
apex help
```

---

## Usage

### Expose a local port

```bash
apex http 3000
```

### Expose with a custom subdomain

```bash
apex http 3000 --subdomain myapp
```

Once connected:

```
┌─────────────────────────────────────────────────────────┐
│  ApexTunnel v2.0.1                                      │
│  ─────────────────────────────────────────              │
│  Account     you@example.com (Free)                     │
│  Status      ● online                                   │
│  Forwarding  https://swift-falcon.apextunnel.top ->     │
│  localhost:3000                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Inspector & Dashboard

The inspector lets you view and replay live requests passing through the tunnel.

Once the tunnel is running, open the inspector from the terminal UI by pressing `I`. You'll be prompted for your password.

---

## Commands

| Command | Description |
|---------|-------------|
| `apex http <port>` | Expose a local port |
| `apex http <port> --subdomain <name>` | Expose with a custom subdomain |
| `apex authtoken <token>` | Save your auth token |
| `apex new token <token>` | Update your auth token |
| `apex pass <password>` | Set your dashboard password |
| `apex new pass <password>` | Update your dashboard password |
| `apex status` | Show saved token and relay info |
| `apex help` | Show help message |

## Keybinds

| Key | Action |
|-----|--------|
| `Q` | Quit |
| `R` | Restart tunnel |
| `C` | Clear request log |
| `O` | Open tunnel URL in browser |
| `I` | Open inspector |

---

## Environment Overrides

For debugging or self-hosted relay setups, you can override defaults via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `APEX_RELAY` | `relay.apextunnel.top` | Relay hostname |
| `APEX_RELAY_PORT` | `9000` | Relay port |
| `APEX_TLS` | `false` | Enable TLS on the tunnel connection |
| `APEX_TLS_CA` | — | Path to CA cert for self-signed TLS |
| `APEX_LOCAL_HOST` | `localhost` | Local app hostname |

---

## Troubleshooting

**`apex: command not found`**

The binary isn't on your PATH. Either move it to `/usr/local/bin`:
```bash
sudo mv apex-linux-arm64 /usr/local/bin/apex
```
Or prefix your command with the full path:
```bash
./apex http 3000
```

**`Permission denied` when running the binary**

The binary isn't marked as executable:
```bash
chmod +x apex-linux-arm64
```

**Tunnel connects but site isn't reachable**

Make sure the local server you're exposing is actually running on the port you specified. The tunnel forwards traffic to `localhost:<port>` — if nothing is listening there, requests will fail.

**Subdomain already in use**

If a subdomain was recently disconnected it may take a few seconds to be reclaimed. Try again or choose a different subdomain with `--subdomain`.

**Windows SmartScreen warning**

The Windows binary is currently unsigned. Click **"More info"** then **"Run anyway"** to proceed. You can also run it from PowerShell directly to bypass the prompt.

**Auth token rejected**

Double-check the token copied from your dashboard — tokens are long and easy to truncate. Re-run `apex authtoken <token>` with the full value.

**Connection drops frequently**

Try enabling TLS on the tunnel for a more stable connection:
```bash
APEX_TLS=true apex http 3000
```

###  Need Support?

If you encounter any issues, please email me directly at [apextunnel.support@gmail.com](mailto:apextunnel.support@gmail.com). To help me get things sorted for you faster, please include a clear description of the problem. I'll get back to you shortly!


---

## License

ISC
