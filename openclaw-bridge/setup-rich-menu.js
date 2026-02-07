#!/usr/bin/env node
/**
 * LINE Rich Menu Setup Script
 * 
 * Creates and configures a Rich Menu for OpenClaw LINE Bot.
 * 
 * Usage:
 *   node setup-rich-menu.js
 * 
 * Environment:
 *   LINE_CHANNEL_ACCESS_TOKEN - Your LINE channel access token (required)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!CHANNEL_ACCESS_TOKEN) {
  console.error('Error: LINE_CHANNEL_ACCESS_TOKEN environment variable is required');
  console.error('Get it from: https://developers.line.biz/console/');
  process.exit(1);
}

// Rich Menu Definition (2500x843 compact size, 3x2 grid)
// Using postback actions so commands are hidden from chat display
const RICH_MENU = {
  size: {
    width: 2500,
    height: 843
  },
  selected: true, // Show menu by default
  name: 'OpenClaw 功能選單',
  chatBarText: '📋 功能選單',
  areas: [
    // Row 1 (y: 0-421)
    {
      // 新對話 - Start new conversation
      bounds: { x: 0, y: 0, width: 833, height: 421 },
      action: {
        type: 'postback',
        label: '新對話',
        data: 'action=new&cmd=/new',
        displayText: '🆕 開始新對話'
      }
    },
    {
      // 模型 - Show current model
      bounds: { x: 833, y: 0, width: 833, height: 421 },
      action: {
        type: 'postback',
        label: '模型',
        data: 'action=model&cmd=/model',
        displayText: '📊 查看目前模型'
      }
    },
    {
      // 模型列表 - List available models
      bounds: { x: 1666, y: 0, width: 834, height: 421 },
      action: {
        type: 'postback',
        label: '模型列表',
        data: 'action=models&cmd=/models',
        displayText: '📋 查看可用模型'
      }
    },
    // Row 2 (y: 421-843)
    {
      // 狀態 - Show system status
      bounds: { x: 0, y: 421, width: 833, height: 422 },
      action: {
        type: 'postback',
        label: '狀態',
        data: 'action=status&cmd=/status',
        displayText: '📈 查看系統狀態'
      }
    },
    {
      // 清除 - Clear conversation
      bounds: { x: 833, y: 421, width: 833, height: 422 },
      action: {
        type: 'postback',
        label: '清除',
        data: 'action=clear&cmd=/clear',
        displayText: '🗑️ 清除對話紀錄'
      }
    },
    {
      // 說明 - Show help
      bounds: { x: 1666, y: 421, width: 834, height: 422 },
      action: {
        type: 'postback',
        label: '說明',
        data: 'action=help&cmd=/help',
        displayText: '❓ 查看使用說明'
      }
    }
  ]
};

/**
 * Make HTTPS request to LINE API
 */
function lineApi(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      }
    };

    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      options.headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    } else if (body instanceof Buffer) {
      options.headers['Content-Type'] = 'image/png';
      options.headers['Content-Length'] = body.length;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Upload image for rich menu
 */
function uploadRichMenuImage(richMenuId, imagePath) {
  return new Promise((resolve, reject) => {
    const imageBuffer = fs.readFileSync(imagePath);
    
    const options = {
      hostname: 'api-data.line.me',
      port: 443,
      path: `/v2/bot/richmenu/${richMenuId}/content`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data || 'OK');
        } else {
          reject(new Error(`Image upload failed ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(imageBuffer);
    req.end();
  });
}

/**
 * Main setup function
 */
async function main() {
  console.log('🚀 Setting up LINE Rich Menu for OpenClaw...\n');

  // Step 1: Delete existing default rich menu (if any)
  console.log('1️⃣ Checking for existing default rich menu...');
  try {
    await lineApi('DELETE', '/v2/bot/user/all/richmenu');
    console.log('   Removed existing default rich menu');
  } catch (e) {
    console.log('   No existing default rich menu');
  }

  // Step 2: Create new rich menu
  console.log('\n2️⃣ Creating rich menu...');
  const createResult = await lineApi('POST', '/v2/bot/richmenu', RICH_MENU);
  const richMenuId = createResult.richMenuId;
  console.log(`   Created: ${richMenuId}`);

  // Step 3: Upload image
  console.log('\n3️⃣ Uploading menu image...');
  const imagePath = path.join(__dirname, 'rich-menu-image.png');
  
  if (!fs.existsSync(imagePath)) {
    console.log('   ⚠️  Image not found: rich-menu-image.png');
    console.log('   Please place a 2500x843 PNG image at:');
    console.log(`   ${imagePath}`);
    console.log('\n   Then run this script again, or manually upload via:');
    console.log(`   LINE Official Account Manager > Rich menus`);
    
    // Set as default anyway (will show without image)
    console.log('\n4️⃣ Setting as default rich menu...');
    await lineApi('POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
    console.log('   ✅ Set as default (image pending)');
  } else {
    await uploadRichMenuImage(richMenuId, imagePath);
    console.log('   Uploaded image');

    // Step 4: Set as default
    console.log('\n4️⃣ Setting as default rich menu...');
    await lineApi('POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
    console.log('   ✅ Set as default');
  }

  console.log('\n✨ Rich Menu 設定完成!');
  console.log('\n選單功能:');
  console.log('  🆕 新對話    - 開始新的對話');
  console.log('  📊 模型      - 查看目前使用的模型');
  console.log('  📋 模型列表  - 查看可用的模型列表');
  console.log('  📈 狀態      - 查看系統狀態');
  console.log('  🗑️  清除      - 清除對話紀錄');
  console.log('  ❓ 說明      - 查看使用說明');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
