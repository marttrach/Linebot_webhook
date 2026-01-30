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
- `local_llm`: Pipes the user text to a local command (`local_llm_cmd` + `local_llm_args`), reading the reply from stdout. Configure an optional `local_llm_timeout` (seconds).
- `remote_llm`: POSTs `{ input, model? }` to `remote_api_url` with `Authorization: Bearer <remote_api_key>` if provided; waits up to `remote_api_timeout` seconds.
- `moltbot`: POSTs `{ message, model? }` to `moltbot_url` with `Authorization: Bearer <moltbot_token>`; waits up to `moltbot_timeout` seconds.

More script usage detail see [Message Processing Setup Guide](docs/message-processing-guide.md) 

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
