#!/usr/bin/env node
/**
 * OpenClaw LINE Bridge
 * 
 * HTTP server that bridges OpenWrt LINE webhook to OpenClaw Gateway.
 * Handles proper Gateway WS protocol: connect.challenge, device signature, agent RPC.
 * 
 * Usage:
 *   node openclaw-line-bridge.js [--port 5001] [--gateway ws://127.0.0.1:18789]
 * 
 * Environment:
 *   OPENCLAW_GATEWAY_URL - Gateway WebSocket URL (default: ws://127.0.0.1:18789)
 *   BRIDGE_PORT - HTTP listen port (default: 5001)
 *   DEVICE_KEY_PATH - Path to ed25519 device key file (optional, auto-generated if missing)
 */

const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const { URL } = require('url');

// Configuration
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '5001', 10);
const DEVICE_KEY_PATH = process.env.DEVICE_KEY_PATH || './device-key.json';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

// Protocol constants
const CLIENT_ID = 'gateway-client';
const CLIENT_MODE = 'backend';
const PROTOCOL_VERSION = { min: 1, max: 3 };
const SCOPES = ['agent', 'operator.write', 'operator.admin'];

// Device identity (ed25519 keypair)
let deviceKey = null;

// Session version tracking (for /new and /clear commands)
// Maps userId -> version number (incremented on /new or /clear)
const sessionVersions = new Map();

/**
 * Generate or load ed25519 device keypair
 */
function loadOrCreateDeviceKey() {
  const fs = require('fs');
  
  try {
    if (fs.existsSync(DEVICE_KEY_PATH)) {
      const data = JSON.parse(fs.readFileSync(DEVICE_KEY_PATH, 'utf8'));
      deviceKey = {
        privateKey: Buffer.from(data.privateKey, 'base64'),
        publicKey: Buffer.from(data.publicKey, 'base64'),
        deviceId: data.deviceId
      };
      console.log(`[Bridge] Loaded device key: ${deviceKey.deviceId.slice(0, 16)}...`);
      return;
    }
  } catch (e) {
    console.warn('[Bridge] Failed to load device key, generating new one');
  }
  
  // Generate new ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubKeyRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32); // Raw 32-byte key
  const privKeyRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32); // Raw 32-byte key
  
  // Device ID = SHA256 of public key (hex, first 32 chars)
  const deviceId = crypto.createHash('sha256').update(pubKeyRaw).digest('hex').slice(0, 32);
  
  deviceKey = {
    privateKey: privKeyRaw,
    publicKey: pubKeyRaw,
    deviceId
  };
  
  // Save for persistence
  try {
    fs.writeFileSync(DEVICE_KEY_PATH, JSON.stringify({
      privateKey: privKeyRaw.toString('base64'),
      publicKey: pubKeyRaw.toString('base64'),
      deviceId
    }));
    console.log(`[Bridge] Generated new device key: ${deviceId.slice(0, 16)}...`);
  } catch (e) {
    console.warn('[Bridge] Failed to save device key:', e.message);
  }
}

/**
 * Sign payload with ed25519
 */
function signPayload(payload) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const privateKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'), // PKCS8 ed25519 prefix
      deviceKey.privateKey
    ]),
    format: 'der',
    type: 'pkcs8'
  });
  
  const signature = crypto.sign(null, Buffer.from(payloadStr), privateKeyObj);
  return signature.toString('base64url');
}

/**
 * Base64url encode
 */
function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate UUID v4
 */
function uuid() {
  return crypto.randomUUID();
}

/**
 * OpenClaw Gateway WebSocket Client
 */
class GatewayClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.pendingRequests = new Map();
    this.eventHandlers = new Map();
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.on('open', () => {
        console.log('[Gateway] WebSocket connected');
      });
      
      this.ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleMessage(msg, resolve, reject);
        } catch (e) {
          console.error('[Gateway] Failed to parse message:', e);
        }
      });
      
      this.ws.on('error', (err) => {
        console.error('[Gateway] WebSocket error:', err);
        reject(err);
      });
      
      this.ws.on('close', () => {
        console.log('[Gateway] WebSocket closed');
        this.connected = false;
      });
    });
  }
  
  async handleMessage(msg, connectResolve, connectReject) {
    // Handle connect.challenge
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      console.log('[Gateway] Received connect.challenge');
      await this.respondToChallenge(msg.payload, connectResolve, connectReject);
      return;
    }
    
    // Handle response to our requests
    if (msg.type === 'res' && msg.id) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        // OpenClaw sends two responses: first 'accepted', then 'ok' with result
        // Only resolve when we get the final 'ok' status
        if (msg.payload && msg.payload.status === 'accepted') {
          // Don't resolve yet, wait for the 'ok' response
          return;
        }
        
        this.pendingRequests.delete(msg.id);
        if (msg.error || !msg.ok) {
          pending.reject(new Error(msg.error?.message || 'Request failed'));
        } else {
          // Extract result from payload
          pending.resolve(msg.payload);
        }
      }
      return;
    }
    
    // Handle events
    if (msg.type === 'event') {
      const handler = this.eventHandlers.get(msg.event);
      if (handler) {
        handler(msg.payload);
      }
    }
  }
  
  async respondToChallenge(challenge, connectResolve, connectReject) {
    const { nonce, ts } = challenge;
    
    const clientInfo = {
      id: CLIENT_ID,
      mode: CLIENT_MODE,
      version: process.version,
      platform: `${process.platform}-${process.arch}`
    };

    let connectReq;

    // Use token-based auth if GATEWAY_TOKEN is set
    if (GATEWAY_TOKEN) {
      console.log('[Gateway] Using token-based authentication');
      connectReq = {
        type: 'req',
        id: uuid(),
        method: 'connect',
        params: {
          minProtocol: PROTOCOL_VERSION.min,
          maxProtocol: PROTOCOL_VERSION.max,
          scopes: SCOPES,
          client: clientInfo,
          auth: {
            token: GATEWAY_TOKEN
          }
        }
      };
    } else {
      // Fallback to device signature auth
      console.log('[Gateway] Using device signature authentication');
      const signedAt = Date.now();
      const signaturePayload = {
        nonce,
        ts,
        scopes: SCOPES,
        client: clientInfo,
        device: {
          id: deviceKey.deviceId,
          publicKey: base64url(deviceKey.publicKey),
          signedAt
        }
      };
      const signature = signPayload(signaturePayload);

      connectReq = {
        type: 'req',
        id: uuid(),
        method: 'connect',
        params: {
          minProtocol: PROTOCOL_VERSION.min,
          maxProtocol: PROTOCOL_VERSION.max,
          scopes: SCOPES,
          client: clientInfo,
          device: {
            id: deviceKey.deviceId,
            publicKey: base64url(deviceKey.publicKey),
            signedAt,
            signature
          }
        }
      };
    }
    
    this.pendingRequests.set(connectReq.id, {
      resolve: (result) => {
        console.log('[Gateway] Connected successfully');
        this.connected = true;
        connectResolve();
      },
      reject: connectReject
    });
    
    this.ws.send(JSON.stringify(connectReq));
  }
  
  async sendRequest(method, params) {
    if (!this.connected) {
      throw new Error('Not connected to Gateway');
    }
    
    const req = {
      type: 'req',
      id: uuid(),
      method,
      params
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(req.id);
        reject(new Error('Request timeout'));
      }, 60000);
      
      this.pendingRequests.set(req.id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });
      
      this.ws.send(JSON.stringify(req));
    });
  }
  
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Global gateway client (singleton, reconnects as needed)
let gatewayClient = null;

async function getGatewayClient() {
  if (gatewayClient && gatewayClient.connected) {
    return gatewayClient;
  }
  
  gatewayClient = new GatewayClient(GATEWAY_URL);
  await gatewayClient.connect();
  return gatewayClient;
}

/**
 * Call OpenClaw agent RPC
 */
async function callAgent(message, sessionKey, attachments = null) {
  const client = await getGatewayClient();
  
  const params = {
    message,
    sessionKey,
    deliver: false,
    idempotencyKey: uuid()
  };
  
  if (attachments && attachments.length > 0) {
    params.attachments = attachments;
  }
  
  console.log(`[Agent] Calling with sessionKey=${sessionKey}`);
  
  const payload = await client.sendRequest('agent', params);
  
  // Extract text and channelData from payload.result.payloads[0]
  
  if (payload && payload.status === 'ok' && payload.result && payload.result.payloads) {
    const payloads = payload.result.payloads;
    if (payloads.length > 0) {
      const firstPayload = payloads[0];
      return {
        text: firstPayload.text || '',
        mediaUrl: firstPayload.mediaUrl || null,
        channelData: firstPayload.channelData || {},
        meta: payload.result.meta
      };
    }
  }
  
  return { text: '(No response from agent)', channelData: {}, meta: null };
}

/**
 * Call OpenClaw session_status RPC
 * Returns session info: model, token usage, cost, etc.
 */
async function callSessionStatus(sessionKey) {
  const client = await getGatewayClient();
  
  const params = sessionKey ? { sessionKey } : {};
  
  console.log(`[SessionStatus] Querying session: ${sessionKey || 'default'}`);
  
  const payload = await client.sendRequest('session_status', params);
  
  return payload;
}

/**
 * Format session_status result as readable text for LINE
 */
function formatSessionStatus(data) {
  // Safely extract fields with fallbacks
  const model = 
    data?.currentModel ?? 
    data?.model ?? 
    data?.defaultModel ?? 
    '未知';
  
  const totalTokens = 
    data?.stats?.totalTokens ?? 
    data?.usage?.totalTokens ?? 
    'N/A';
  
  const inputTokens = data?.stats?.inputTokens ?? 'N/A';
  const outputTokens = data?.stats?.outputTokens ?? 'N/A';
  
  const costUsd = 
    data?.stats?.costUsd ?? 
    data?.cost?.usd ?? 
    null;
  const costText = costUsd !== null ? `$${costUsd.toFixed(4)} USD` : 'N/A';
  
  const reasoning = data?.flags?.reasoning ?? 'off';
  const elevated = data?.flags?.elevated ? '是' : '否';
  
  const sessionKey = data?.session?.sessionKey ?? 'main';
  
  const uptime = data?.runtime?.uptimeSeconds 
    ? `${Math.floor(data.runtime.uptimeSeconds / 60)} 分鐘`
    : 'N/A';

  // Format as multi-line text
  const lines = [
    '📊 OpenClaw Session 狀態',
    '─────────────────',
    `🤖 模型：${model}`,
    `📈 Token 用量：${totalTokens}`,
    `   ├ 輸入：${inputTokens}`,
    `   └ 輸出：${outputTokens}`,
    `💰 預估費用：${costText}`,
    '─────────────────',
    `🔧 Reasoning：${reasoning}`,
    `⚡ Elevated：${elevated}`,
    `🔑 Session：${sessionKey}`,
    `⏱️ 運行時間：${uptime}`
  ];

  return lines.join('\n');
}

/**
 * HTTP Request Handler
 */
async function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  // Parse URL
  const url = new URL(req.url, `http://localhost:${BRIDGE_PORT}`);
  
  if (url.pathname !== '/message' && url.pathname !== '/') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  
  // Read body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }
  
  // Extract fields
  const {
    text = '',
    userId = 'unknown',
    sourceType = 'user',
    groupId = null,
    attachments = null
  } = payload;
  
  // Build session key (with version suffix for /new and /clear support)
  const baseSessionKey = groupId
    ? `agent:main:line-bridge:group:${groupId}`
    : `agent:main:line-bridge:dm:${userId}`;
  
  // Get current session version (default to 0)
  const sessionVersion = sessionVersions.get(userId) || 0;
  const sessionKey = sessionVersion > 0 
    ? `${baseSessionKey}:v${sessionVersion}` 
    : baseSessionKey;
  
  try {
    // If text is empty but we have attachments, provide a default message
    // OpenClaw Gateway requires message to have at least 1 character
    let message = text;
    if (!message && attachments && attachments.length > 0) {
      // Describe the attachment type(s) as the message
      const types = attachments.map(a => a.type || 'file').join(', ');
      message = `[Attached: ${types}]`;
    }
    
    // ========================================
    // Built-in command routing (handle locally)
    // ========================================
    const trimmedText = (message || '').trim().toLowerCase();
    
    // /status - Forward to agent (agent has session_status tool)
    if (trimmedText === '/status') {
      console.log('[Bridge] Forwarding /status to agent');
      // Let the agent handle this - it has access to session_status tool
      // Fall through to callAgent below
    }
    
    // /model - Forward to agent
    if (trimmedText === '/model') {
      console.log('[Bridge] Forwarding /model to agent');
      // Let the agent handle this
      // Fall through to callAgent below
    }
    
    // /help - Show available commands (handle locally)
    if (trimmedText === '/help') {
      const helpText = [
        '📋 可用指令',
        '─────────────────',
        '🆕 /new - 開始新對話',
        '📊 /model - 查看目前模型',
        '📋 /models - 列出可用模型',
        '📈 /status - 查看 Session 狀態',
        '🗑️ /clear - 清除對話紀錄',
        '❓ /help - 顯示此說明'
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: helpText, channelData: {} }));
      return;
    }
    
    // /models - List available models (forward to agent as it may have this info)
    if (trimmedText === '/models') {
      console.log('[Bridge] Handling /models command - forwarding to agent');
      // Let the agent handle this command as it knows what models are available
      // Fall through to callAgent below
    }
    
    // /new - Start new conversation (reset session context)
    if (trimmedText === '/new') {
      console.log('[Bridge] Handling /new command');
      // Increment session version to create a new session
      const currentVersion = sessionVersions.get(userId) || 0;
      const newVersion = currentVersion + 1;
      sessionVersions.set(userId, newVersion);
      
      const newText = [
        '🆕 已開始新對話！',
        '─────────────────',
        '之前的對話紀錄已清除。',
        `Session 版本：v${newVersion}`,
        '請輸入您的問題。'
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: newText, channelData: {} }));
      return;
    }
    
    // /clear - Clear conversation history (similar to /new)
    if (trimmedText === '/clear') {
      console.log('[Bridge] Handling /clear command');
      // Increment session version to clear history
      const currentVersion = sessionVersions.get(userId) || 0;
      const newVersion = currentVersion + 1;
      sessionVersions.set(userId, newVersion);
      
      const clearText = [
        '🗑️ 對話紀錄已清除！',
        '─────────────────',
        `Session 版本：v${newVersion}`,
        '您可以開始新的對話。'
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: clearText, channelData: {} }));
      return;
    }
    
    // ========================================
    // Forward other messages to OpenClaw Agent
    // ========================================
    const result = await callAgent(message || '[Empty message]', sessionKey, attachments);
    
    // Parse result into text + channelData (handle null/undefined result)
    const response = {
      text: (result && (result.text || result.response || result.message)) || '(No response)',
      channelData: (result && result.channelData) || {}
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    
  } catch (err) {
    console.error('[Bridge] Agent call failed:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Main
 */
async function main() {
  console.log('[Bridge] OpenClaw LINE Bridge starting...');
  console.log(`[Bridge] Gateway: ${GATEWAY_URL}`);
  console.log(`[Bridge] Listen port: ${BRIDGE_PORT}`);
  console.log(`[Bridge] Auth mode: ${GATEWAY_TOKEN ? 'token' : 'device-signature'}`);
  
  // Load device key only if not using token auth
  if (!GATEWAY_TOKEN) {
    loadOrCreateDeviceKey();
  }
  
  // Pre-connect to gateway
  try {
    await getGatewayClient();
    console.log('[Bridge] Gateway connection established');
  } catch (err) {
    console.warn('[Bridge] Initial gateway connection failed, will retry on first request:', err.message);
  }
  
  // Start HTTP server
  const host = process.env.BRIDGE_HOST || '127.0.0.1';
  const server = http.createServer(handleRequest);
  server.listen(BRIDGE_PORT, host, () => {
    console.log(`[Bridge] HTTP server listening on http://${host}:${BRIDGE_PORT}`);
    console.log('[Bridge] POST /message to send messages to OpenClaw agent');
  });
}

main().catch(console.error);
