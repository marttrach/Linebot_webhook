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
| `local_llm` | You have a local model binary (e.g., ollama) on the router | `local_llm_cmd`, optional `local_llm_args`, `local_llm_timeout` |
| `remote_llm` | Call a generic HTTP LLM API | `remote_api_url`, optional `remote_api_key`, `remote_api_model`, `remote_api_timeout` |
| `moltbot` | Use Moltbot hosted API | `moltbot_url`, `moltbot_token`, optional `moltbot_model`, `moltbot_timeout` |

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

### 2) Local LLM
Example uses ollama:
```sh
uci set line_webhook.main.processor='local_llm'
uci set line_webhook.main.local_llm_cmd='/usr/bin/ollama'
uci set line_webhook.main.local_llm_args='run llama3'
uci set line_webhook.main.local_llm_timeout='20'
uci commit line_webhook
/etc/init.d/line_webhook restart
```
Notes:
- Text is piped to stdin of the command; stdout is returned to the user.
- Keep timeouts modest to avoid webhook timeouts (LINE requires <2s end-to-end; processing happens async but long runs still delay replies).

### 3) Remote LLM API
OpenAI-compatible example:
```sh
uci set line_webhook.main.processor='remote_llm'
uci set line_webhook.main.remote_api_url='https://api.openai.com/v1/chat/completions'
uci set line_webhook.main.remote_api_key='<YOUR_API_KEY>'
uci set line_webhook.main.remote_api_model='gpt-4o-mini'
uci set line_webhook.main.remote_api_timeout='15'
uci commit line_webhook
/etc/init.d/line_webhook restart
```
Payload sent: `{ "input": "<user text>", "model": "<remote_api_model?>" }`

### 4) Moltbot
```sh
uci set line_webhook.main.processor='moltbot'
uci set line_webhook.main.moltbot_url='https://api.moltbot.ai/v1/chat'
uci set line_webhook.main.moltbot_token='<MOLTBOT_TOKEN>'
uci set line_webhook.main.moltbot_model='default'   # optional
uci set line_webhook.main.moltbot_timeout='15'
uci commit line_webhook
/etc/init.d/line_webhook restart
```
Payload sent: `{ "message": "<user text>", "model": "<optional>" }`

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
- Empty replies: ensure your LLM binary/API returns text on stdout/JSON; increase timeout if needed.
- Command not found: verify `local_llm_cmd` path is executable.
- TLS issues: confirm cert/key paths and enable `use_tls=1` when ready.
