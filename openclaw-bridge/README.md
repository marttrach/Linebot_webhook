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

## Rich Menu Setup

The bridge includes scripts to generate and upload a Rich Menu to your LINE Bot.

### 1. Generate Menu Image

This script programmatically generates the 2500x843 menu image.

```sh
node generate-rich-menu-image.js
```
*Output: `rich-menu-image.png`*

### 2. Upload & Apply Menu

This script configures the menu layout and uploads the image to LINE.

```sh
# Set your LINE Channel Access Token
export LINE_CHANNEL_ACCESS_TOKEN="YOUR_ACCESS_TOKEN"

# Run setup
node setup-rich-menu.js
```
*(On Windows CMD: `set LINE_CHANNEL_ACCESS_TOKEN=...`)*

## Built-in Commands

The bridge handles these commands locally or forwards them to the Agent:

| Command | Handler | Description |
|---|---|---|
| `/status` | **Bridge** | Queries Gateway `session_status` RPC and formats result |
| `/model` | **Bridge** | Shows current model (via session_status) |
| `/models` | **Agent** | Forwarded to Agent (if supported) |
| `/new` | **Bridge** | **Resets Session** (increments session version) |
| `/clear` | **Bridge** | Clears history (same as /new) |
| `/help` | **Bridge** | Shows this command list |

### Session Versioning

The bridge uses a versioning suffix for session keys to support `/new` and `/clear` commands effectively:

- Default: `agent:main:line-bridge:dm:UserID`
- After `/new`: `agent:main:line-bridge:dm:UserID:v1`
- Next `/new`: `agent:main:line-bridge:dm:UserID:v2`

This ensures a clean context for the Agent without needing to delete keys from the database.
