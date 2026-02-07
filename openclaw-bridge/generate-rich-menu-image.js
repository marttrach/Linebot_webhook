#!/usr/bin/env node
/**
 * Rich Menu Image Generator
 * 
 * Generates a 2500x843 PNG image for LINE Rich Menu.
 * Uses pure Node.js canvas to create the image programmatically.
 * 
 * Usage:
 *   npm install canvas
 *   node generate-rich-menu-image.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Canvas dimensions (LINE Rich Menu compact size)
const WIDTH = 2500;
const HEIGHT = 843;

// Grid layout: 3 columns x 2 rows
const COLS = 3;
const ROWS = 2;
const CELL_WIDTH = Math.floor(WIDTH / COLS);
const CELL_HEIGHT = Math.floor(HEIGHT / ROWS);

// Button definitions
const BUTTONS = [
  // Row 1
  { icon: '🆕', label: '新對話', sublabel: 'New Chat' },
  { icon: '📊', label: '模型', sublabel: 'Model' },
  { icon: '📋', label: '模型列表', sublabel: 'Models' },
  // Row 2
  { icon: '📈', label: '狀態', sublabel: 'Status' },
  { icon: '🗑️', label: '清除', sublabel: 'Clear' },
  { icon: '❓', label: '說明', sublabel: 'Help' }
];

// Colors
const COLORS = {
  bgGradientStart: '#1a1a2e',
  bgGradientEnd: '#16213e',
  cellBorder: '#3a3a5c',
  iconBg: '#2a2a4e',
  textPrimary: '#ffffff',
  textSecondary: '#8888aa'
};

function generateImage() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, COLORS.bgGradientStart);
  gradient.addColorStop(1, COLORS.bgGradientEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Draw cells
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const index = row * COLS + col;
      const button = BUTTONS[index];
      
      const x = col * CELL_WIDTH;
      const y = row * CELL_HEIGHT;
      const cellW = col === COLS - 1 ? WIDTH - x : CELL_WIDTH;
      const cellH = row === ROWS - 1 ? HEIGHT - y : CELL_HEIGHT;

      // Cell border
      ctx.strokeStyle = COLORS.cellBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellH);

      // Icon background circle
      const centerX = x + cellW / 2;
      const centerY = y + cellH / 2 - 40;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.iconBg;
      ctx.fill();

      // Icon (emoji as text)
      ctx.font = '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.textPrimary;
      ctx.fillText(button.icon, centerX, centerY);

      // Main label
      ctx.font = 'bold 48px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
      ctx.fillStyle = COLORS.textPrimary;
      ctx.fillText(button.label, centerX, centerY + 100);

      // Sublabel
      ctx.font = '28px Arial, sans-serif';
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText(button.sublabel, centerX, centerY + 150);
    }
  }

  // Save to file
  const outputPath = path.join(__dirname, 'rich-menu-image.png');
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Rich Menu image generated: ${outputPath}`);
  console.log(`   Size: ${WIDTH}x${HEIGHT} pixels`);
}

// Check if canvas module is available
try {
  require.resolve('canvas');
  generateImage();
} catch (e) {
  console.log('📦 Installing canvas module...');
  console.log('   Run: npm install canvas');
  console.log('   Then run this script again.');
  console.log('\n或者您可以手動建立圖片:');
  console.log('   - 尺寸: 2500 x 843 像素');
  console.log('   - 格式: PNG 或 JPEG');
  console.log('   - 佈局: 3 欄 x 2 列');
  console.log('   - 按鈕: 🆕新對話、📊模型、📋模型列表、📈狀態、🗑️清除、❓說明');
}
