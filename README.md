# LuCI LINE Webhook for OpenWrt

A LuCI application package that provides a web-configurable LINE BOT Webhook server for OpenWrt routers.

## Features

- 📱 **LINE BOT Integration**: Receive and reply to LINE messages
- 🖥️ **LuCI Web Interface**: Configure via OpenWrt's web UI
- 🔒 **Secure Configuration**: Credentials stored in UCI with proper permissions
- 🔄 **Procd Service**: Managed as a native OpenWrt service
- 🎯 **Extensible**: Easy to add custom reply logic

## Requirements

- OpenWrt 24.10.x or later
- Architecture: x86_64 (more architectures can be added)
- Dependencies: `python3`, `python3-flask`, `python3-requests`, `luci-base`

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
4. Enable the service
5. Save & Apply

### Via Command Line

```sh
uci set line_webhook.main.enabled='1'
uci set line_webhook.main.port='5000'
uci set line_webhook.main.access_token='YOUR_ACCESS_TOKEN'
uci set line_webhook.main.channel_secret='YOUR_CHANNEL_SECRET'
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

1. Install `cloudflared` on your router
2. Create a tunnel pointing to `localhost:5000`
3. Use the tunnel URL as your LINE Webhook URL

## LINE Developer Console Setup

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Create or select your Messaging API channel
3. In **Messaging API** tab:
   - Copy **Channel Access Token** (issue if needed)
   - Copy **Channel Secret** from Basic Settings
4. Set **Webhook URL** to your exposed endpoint
5. Enable **Use webhook**
6. Click **Verify** to test the connection

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
curl http://localhost:5000/
```

### Common issues

- **Port in use**: Change the port in configuration
- **Missing dependencies**: Run `opkg update && opkg install python3 python3-flask python3-requests`
- **Signature validation failed**: Verify your Channel Secret is correct

## License

MIT License

## Credits

Based on the LINE Webhook tutorial from [STEAM 教育學習網](https://steam.oxxostudio.tw/category/python/example/line-webhook.html)
