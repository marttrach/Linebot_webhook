# Message Processing Setup Guide (process_message options)

This guide explains how to deploy the new `process_message` modes and choose the right option for your environment. All commands are for OpenWrt shells; run as root.

## Prerequisites
- luci-app-line-webhook installed on your OpenWrt device.
- LINE channel credentials (`access_token`, `channel_secret`).
- Network access for any remote API you plan to call.
- Optional: TLS cert/key if you enable HTTPS.

## Quick flow
1. Decide which processor you want (see table below).
2. Set UCI options or configure in LuCI (Services ▸ LINE Webhook ▸ Message Processing).
3. Commit config and restart the service.
4. Send a LINE message to verify the reply.

### Processor cheat sheet
| Mode | When to use | Minimum settings |
| --- | --- | --- |
| `echo` | Simple connectivity test | `processor=echo` |
| `remote_llm` | Call Ollama HTTP API | `remote_api_url`, optional `remote_api_key`, `remote_api_model`, `remote_api_timeout` |
| `openclaw` | OpenClaw Gateway via bridge | `openclaw_bridge_url` (default http://127.0.0.1:5001/message), `openclaw_timeout` |

## Common base config
```sh
uci set line_webhook.main.enabled='1'
uci set line_webhook.main.port='5000'
uci set line_webhook.main.bind_address='0.0.0.0'
uci set line_webhook.main.access_token='<LINE_ACCESS_TOKEN>'
uci set line_webhook.main.channel_secret='<LINE_CHANNEL_SECRET>'
```

## Mode setup steps

### 1) Echo test
```sh
uci set line_webhook.main.processor='echo'
uci commit line_webhook
/etc/init.d/line_webhook restart
```
Send any text; it should echo back.

### 2) Remote LLM API (Ollama)
Ollama `/api/chat` example:
```sh
uci set line_webhook.main.processor='remote_llm'
uci set line_webhook.main.remote_api_url='http://YOUR_HOST:11434/api/chat'
uci set line_webhook.main.remote_api_model='mistral'
uci set line_webhook.main.remote_api_timeout='60'
uci commit line_webhook
/etc/init.d/line_webhook restart
```

Payload sent:
```json
{
  "model": "<remote_api_model>",
  "messages": [{"role": "user", "content": "<user text>"}]
}
```

Response: Streaming NDJSON where each line contains `{"message": {"content": "..."}, "done": false/true}`. All `content` tokens are concatenated to form the final reply.

### 3) OpenClaw (Gateway Bridge)
Forwards messages to OpenClaw via an HTTP bridge. The bridge (Node.js script on OpenClaw host) handles Gateway WS protocol (connect.challenge, ed25519 device signature, agent RPC).

**Architecture:**
```
OpenWrt (HTTP) → Bridge (http://host:5001) → Gateway WS (ws://127.0.0.1:18789)
```

**Part 1: OpenClaw Host Setup (Bridge)**

1.  **Install the bridge script**
    Copy `openclaw-bridge/openclaw-line-bridge.js` to your OpenClaw host.

2.  **Install dependencies**
    ```sh
    npm install ws
    ```

3.  **Run the bridge**
    
    **Option A: Manual Run (Test)**
    ```sh
    node openclaw-line-bridge.js --port 5001
    ```

    **Option B: PM2 (Recommended for production)**
    ```sh
    npm install -g pm2
    pm2 start openclaw-line-bridge.js --name "line-bridge" -- --port 5001
    pm2 save
    pm2 startup
    ```

    **Option C: Systemd (Standard Linux)**
    Create `/etc/systemd/system/openclaw-line-bridge.service`:
    ```ini
    [Unit]
    Description=OpenClaw LINE Bridge
    After=network.target

    [Service]
    Type=simple
    User=root
    WorkingDirectory=/path/to/openclaw-bridge
    ExecStart=/usr/bin/node openclaw-line-bridge.js
    Restart=always
    Environment=BRIDGE_PORT=5001
    Environment=OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789

    [Install]
    WantedBy=multi-user.target
    ```
    Enable and start:
    ```sh
    systemctl enable openclaw-line-bridge
    systemctl start openclaw-line-bridge
    ```

    The bridge will:
    - Listen on `http://0.0.0.0:5001/message` (accessible from OpenWrt)
    - Connect to Gateway at `ws://127.0.0.1:18789`
    - Handle protocol handshake (connect.challenge, device signature)
    - Forward messages via `agent` RPC

**Part 2: OpenWrt Side Setup**

1.  **Configure Processor**
    ```sh
    uci set line_webhook.main.processor='openclaw'
    ```

2.  **Configure Bridge URL**
    Set the HTTP endpoint to your bridge (adjust IP if needed).
    ```sh
    uci set line_webhook.main.openclaw_bridge_url='http://192.168.1.100:5001/message'
    ```

3.  **Complete Setup**
    ```sh
    uci set line_webhook.main.openclaw_timeout='60'
    uci commit line_webhook
    /etc/init.d/line_webhook restart
    ```

**How it works:**
- **Inbound (User → Agent)**: 
  - Text messages: Forwarded to bridge via HTTP POST. Bridge calls `agent` RPC.
  - **Postback Events**: Triggered by Rich Menu buttons (e.g., `/status`, `/new`). `line-webhook-server` parses the `cmd` parameter and forwards it as a command to the bridge.
- **Outbound (Agent → User)**:
  - Text replies: Bridge returns `{ text }`.
  - **Flex Messages (Rich Cards)**: Agent includes `channelData.line.flexMessage` in the response. Bridge passes this through, and `line-webhook-server` renders it as a native Interactive Card.

## Verification
1. Send a message from LINE; expect a reply per the selected mode.
2. Check logs if anything fails:
   ```sh
   logread | grep line-webhook
   ```
3. Optional health check:
   ```sh
   curl -k https://<router>:5000/    # or http if TLS disabled
   ```

## Troubleshooting tips
- Signature errors: re-check `channel_secret`.
- Empty replies: ensure your LLM API returns valid JSON; increase timeout if needed.
- TLS issues: confirm cert/key paths and enable `use_tls=1` when ready.
