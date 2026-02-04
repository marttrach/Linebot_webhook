# OpenClaw LINE Bridge

Node.js bridge that connects OpenWrt LINE Webhook to OpenClaw Gateway using the correct WS protocol.

## Requirements

- Node.js 18+
- `ws` package

## Install

```sh
npm install ws
```

## Run

```sh
node openclaw-line-bridge.js
```

Or with environment variables:

```sh
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789 \
BRIDGE_PORT=5001 \
node openclaw-line-bridge.js
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `BRIDGE_PORT` | `5001` | HTTP listen port |
| `DEVICE_KEY_PATH` | `./device-key.json` | Path to ed25519 device key |

## API

### POST /message

Send a message to OpenClaw agent.

**Request:**
```json
{
  "text": "Hello",
  "userId": "Uxxxxxxxx",
  "sourceType": "user",
  "groupId": null,
  "attachments": []
}
```

**Response:**
```json
{
  "text": "Hello! How can I help?",
  "channelData": {
    "line": {
      "quickReplies": ["Help", "Status"]
    }
  }
}
```
