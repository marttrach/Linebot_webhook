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
| `openclaw` | Use OpenClaw API | `openclaw_url`, `openclaw_token`, optional `openclaw_model`, `openclaw_timeout` |

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

### 3) OpenClaw
```sh
uci set line_webhook.main.processor='openclaw'
uci set line_webhook.main.openclaw_url='https://your-openclaw-server/api/chat'
uci set line_webhook.main.openclaw_token='<OPENCLAW_TOKEN>'
uci set line_webhook.main.openclaw_model='default'   # optional
uci set line_webhook.main.openclaw_timeout='60'
uci commit line_webhook
/etc/init.d/line_webhook restart
```
Payload sent: `{ "message": "<user text>", "model": "<optional>" }`
Supports both regular JSON and streaming NDJSON responses.

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
