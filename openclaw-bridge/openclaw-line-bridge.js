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

// Protocol constants
const CLIENT_ID = 'gateway-client';
const CLIENT_MODE = 'backend';
const PROTOCOL_VERSION = { min: 1, max: 1 };
const SCOPES = ['agent'];

// Device identity (ed25519 keypair)
let deviceKey = null;

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
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || 'Unknown error'));
        } else {
          pending.resolve(msg.result);
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
    
    // Build signature payload
    const signaturePayload = {
      nonce,
      ts,
      scopes: SCOPES
    };
    
    const signature = signPayload(signaturePayload);
    
    // Send connect request
    const connectReq = {
      type: 'req',
      id: uuid(),
      method: 'connect',
      params: {
        client: { id: CLIENT_ID, mode: CLIENT_MODE },
        protocol: PROTOCOL_VERSION,
        scopes: SCOPES,
        device: {
          deviceId: deviceKey.deviceId,
          publicKey: base64url(deviceKey.publicKey),
          signature
        }
      }
    };
    
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
    };
    
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
  
  const result = await client.sendRequest('agent', params);
  
  // Result contains runId, we may need to wait for completion
  // For now, assume synchronous response or poll agent.wait
  return result;
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
  
  // Build session key
  const sessionKey = groupId
    ? `agent:main:line-bridge:group:${groupId}`
    : `agent:main:line-bridge:dm:${userId}`;
  
  try {
    console.log(`[Bridge] Received message from ${userId}: "${text.slice(0, 50)}..."`);
    
    const result = await callAgent(text, sessionKey, attachments);
    
    // Parse result into text + channelData
    const response = {
      text: result.text || result.response || '',
      channelData: result.channelData || {}
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
  
  // Load device key
  loadOrCreateDeviceKey();
  
  // Pre-connect to gateway
  try {
    await getGatewayClient();
    console.log('[Bridge] Gateway connection established');
  } catch (err) {
    console.warn('[Bridge] Initial gateway connection failed, will retry on first request:', err.message);
  }
  
  // Start HTTP server
  const host = process.env.BRIDGE_HOST || '0.0.0.0';
  const server = http.createServer(handleRequest);
  server.listen(BRIDGE_PORT, host, () => {
    console.log(`[Bridge] HTTP server listening on http://${host}:${BRIDGE_PORT}`);
    console.log('[Bridge] POST /message to send messages to OpenClaw agent');
  });
}

main().catch(console.error);
