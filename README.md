# LuCI LINE Webhook for OpenWrt

A LuCI application package that provides a web-configurable LINE BOT Webhook server for OpenWrt routers.

For detailed install/build steps, see the [Install & Build Guide](docs/install-build-guide.md).

## Features

- **LINE BOT Integration**: Receive and reply to LINE messages
- **LuCI Web Interface**: Configure via OpenWrt's web UI
- **Secure Configuration**: Credentials stored in UCI with proper permissions
- **Procd Service**: Managed as a native OpenWrt service
- **Extensible**: Easy to add custom reply logic
- **TLS Ready**: Supports TLS 1.2/1.3 with hardened cipher suites
- **Grafana Alerting**: Receive Grafana alerts via `/grafana` webhook endpoint

## Requirements

- OpenWrt 24.10.x or later
- Architecture: x86_64 (more architectures can be added)
- Dependencies: `python3`, `python3-requests`, `luci-base`

## Installation

### From GitHub Releases

1. Download the latest `.ipk` file from [Releases](../../releases)
2. Upload to your OpenWrt device
3. Install via SSH:

```sh
opkg install luci-app-line-webhook_*.ipk
```

### Build from Source

This repository uses GitHub Actions to automatically build packages. You can:

1. Fork this repository
2. Push changes to trigger a build
3. Download artifacts from the Actions tab

## Configuration

### Via LuCI Web Interface

1. Navigate to **Services → LINE Webhook**
2. Enter your LINE Channel credentials:
   - **Channel Access Token**: From LINE Developers Console
   - **Channel Secret**: From LINE Developers Console
3. Set the port (default: 5000)
4. (Recommended) Enable **TLS** and provide paths to a CA-signed cert/key
5. Enable the service
5. Save & Apply

### Via Command Line

```sh
uci set line_webhook.main.enabled='1'
uci set line_webhook.main.port='5000'
uci set line_webhook.main.access_token='YOUR_ACCESS_TOKEN'
uci set line_webhook.main.channel_secret='YOUR_CHANNEL_SECRET'
uci set line_webhook.main.use_tls='1'
uci set line_webhook.main.tls_cert='/etc/ssl/line_webhook/server.crt'
uci set line_webhook.main.tls_key='/etc/ssl/line_webhook/server.key'
uci commit line_webhook
/etc/init.d/line_webhook restart
```

## Exposing the Webhook

Since your OpenWrt router is likely behind NAT, you need to expose the webhook endpoint to the internet. Options:

### Option 1: Port Forwarding + DDNS

1. Set up Dynamic DNS on your router
2. Forward port 5000 (or your configured port) to the router itself
3. Use `https://your-ddns-domain:5000` as your LINE Webhook URL

### Option 2: Reverse Proxy with Cloudflare Tunnel

- Install `cloudflared` on the router (or another always-on host).
- In Cloudflare Zero Trust dashboard, create a Tunnel and an ingress rule that forwards `https://your-hostname` to `http://localhost:5000` (or your configured port).
- Publish the hostname via Cloudflare DNS and use that HTTPS URL as your LINE Webhook URL.
- Keep other services from exposing directory listings on the same host.

## LINE Developer Console Setup

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Create or select your Messaging API channel
3. In **Messaging API** tab:
   - Copy **Channel Access Token** (issue if needed)
   - Copy **Channel Secret** from Basic Settings
4. Set **Webhook URL** to your exposed endpoint
5. Enable **Use webhook**
6. Click **Verify** to test the connection

### Message Processing Modes

You can choose how `process_message` replies via LuCI or UCI (`line_webhook.main.processor`):

- `echo` (default): Replies with the same text.
- `remote_llm`: Calls Ollama's `/api/chat` endpoint with streaming NDJSON support. Configure `remote_api_url`, `remote_api_model`, and optional `remote_api_timeout`.
- `openclaw`: Forwards messages to OpenClaw via HTTP bridge (`openclaw_bridge_url`, default `http://127.0.0.1:5001/message`). The bridge (Node.js script on OpenClaw host) handles Gateway WS protocol with device signature and agent RPC. Supports Rich Messages.
- `anythingllm`: Calls AnythingLLM's workspace chat API. Configure `anythingllm_url`, `anythingllm_api_key`, `anythingllm_mode` (default: `chat`), and optional `anythingllm_timeout`.
- `n8n`: Forwards messages to N8N workflow for advanced processing with Cloudflare R2 image hosting, conversation memory, and async responses via Push API.

#### AnythingLLM Setup

1. **Get your API Key** from AnythingLLM: Settings → API Keys → Generate New API Key
2. **Find your Workspace Slug** from the AnythingLLM URL (e.g., `my-workspace`)
3. **Configure via UCI**:
   ```sh
   uci set line_webhook.main.processor='anythingllm'
   uci set line_webhook.main.anythingllm_url='http://<anythingllm-host>:3001/api/v1/workspace/<workspace-slug>/chat'
   uci set line_webhook.main.anythingllm_api_key='<your-api-key>'
   uci set line_webhook.main.anythingllm_mode='chat'
   uci commit line_webhook
   /etc/init.d/line_webhook restart
   ```

#### N8N Workflow Setup

The N8N processor enables advanced features like image generation with R2 hosting and per-user conversation memory.

1. **Import the workflow**: Load `docs/n8n-line-llm-workflow.json` into your N8N instance
2. **Configure environment variables** in N8N (R2, AnythingLLM endpoints)
3. **Configure via UCI**:
   ```sh
   uci set line_webhook.main.processor='n8n'
   uci set line_webhook.main.n8n_webhook_url='http://<n8n-host>:5678/webhook/line'
   uci set line_webhook.main.n8n_webhook_secret='<optional-secret>'
   uci commit line_webhook
   /etc/init.d/line_webhook restart
   ```

For detailed setup instructions, see [N8N Workflow Setup Guide](docs/n8n-setup-guide.md).

### Documentation

| Guide | Description |
|-------|-------------|
| [Message Processing Guide](docs/message-processing-guide.md) | Processor configuration and troubleshooting |
| [N8N Workflow Setup](docs/n8n-setup-guide.md) | N8N + R2 + AnythingLLM integration |
| [Install & Build Guide](docs/install-build-guide.md) | Building the IPK package | 

### Grafana Alerting Integration

The webhook server includes a dedicated `/grafana` endpoint to receive Grafana alerting notifications and forward them to LINE.

#### Setup Steps

#### Setup Steps

##### Step 1: Get your LINE User ID

1. Send any message to your LINE Bot.
2. Check the logs on your router:
   ```sh
   logread | grep "Message from user"
   ```
3. Copy the `Uxxxxxxxx...` ID (33 characters).

##### Step 2: Generate a Webhook Secret

You need a secret string to secure the webhook. You can generate a random one using `openssl` (on OpenWrt or any Linux/Mac):

```sh
# Generate a random 32-character alphanumeric string
openssl rand -hex 16
# Example output: 8f3d2a1b9c4e5d6f7a8b9c0d1e2f3a4b
```

*Note: You can use any string you like, but a random string is recommended for security.*

##### Step 3: Configure the Webhook Server

**Via LuCI Web Interface:**
1. Navigate to **Services → LINE Webhook**.
2. Scroll to the **Grafana Integration** section.
3. Paste your **LINE User ID**.
4. Paste your **Webhook Secret** (from Step 2).
5. Click **Save & Apply**.

**Via Command Line:**
```sh
uci set line_webhook.main.grafana_user_id='Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
uci set line_webhook.main.grafana_secret='YOUR_GENERATED_SECRET'
uci commit line_webhook
/etc/init.d/line_webhook restart
```

##### Step 4: Configure Grafana Contact Point

1. Log in to your Grafana instance.
2. Go to **Alerting** → **Contact points**.
3. Click **+ Add contact point**.
4. **Name**: Enter a name (e.g., `LINE Bot`).
5. **Integration**: Select `Webhook`.
6. **Url**: Enter your webhook endpoint:
   - If using DDNS: `https://your-domain.com:5000/grafana`
   - If using Cloudflare Tunnel: `https://your-hostname/grafana`
7. Expand **Optional Webhook settings**.
8. **Http Method**: `POST` (Default).
9. **Authorization Header**:
   - Format: `Bearer <YOUR_SECRET>`
   - Example: `Bearer 8f3d2a1b9c4e5d6f7a8b9c0d1e2f3a4b`
   - *Important: You MUST include the word "Bearer " before the secret.*
10. Click **Test** → **Send test notification**.
    - You should receive a test message on LINE.
11. Click **Save contact point**.

#### Example LINE Message

When an alert fires, you'll receive a formatted message like:

```
🔥 [FIRING:1] High CPU Usage
狀態: FIRING

【High CPU usage】
  摘要: CPU usage is above 80%
  severity: critical
  instance: server-1

🔗 https://grafana.example.com/alerting/...
```

## Extending the Bot

The webhook server is located at `/usr/bin/line-webhook-server`. To add custom reply logic, modify the `process_message()` function:

```python
def process_message(event, access_token):
    message_type = event.get('message', {}).get('type', '')
    reply_token = event.get('replyToken', '')
    
    if message_type == 'text':
        text = event['message'].get('text', '')
        
        # Add your custom logic here
        if text == '/help':
            reply_text = 'Available commands: /help, /status'
        elif text == '/status':
            reply_text = 'Bot is running!'
        else:
            reply_text = text  # Echo by default
        
        messages = [{'type': 'text', 'text': reply_text}]
    else:
        messages = [{'type': 'text', 'text': '請傳送文字訊息'}]
    
    send_reply(reply_token, messages, access_token)
```

## Troubleshooting

### Check service status

```sh
/etc/init.d/line_webhook status
logread | grep line
```

### Test locally

```sh
# If TLS is enabled
curl -k https://localhost:5000/
# If TLS is disabled (development only)
# curl http://localhost:5000/
```

### Common issues

- **Port in use**: Change the port in configuration
- **Missing dependencies**: Run `opkg update && opkg install python3 python3-requests`
- **Signature validation failed**: Verify your Channel Secret is correct
- **TLS failed to start**: Ensure the cert/key files exist and are CA-signed; TLS 1.2+ is required

## License

MIT License
