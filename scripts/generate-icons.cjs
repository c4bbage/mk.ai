const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconDir = path.join(__dirname, '../src-tauri/icons');

// 确保目录存在
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// 创建 SVG 图标
function createSvgIcon(size) {
  const radius = size * 0.2;
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#grad)"/>
  <text x="50%" y="55%" 
        font-family="-apple-system, BlinkMacSystemFont, sans-serif" 
        font-size="${size * 0.55}" 
        font-weight="bold" 
        fill="white" 
        text-anchor="middle" 
        dominant-baseline="middle">M</text>
</svg>`;
}

async function generateIcons() {
  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    const svg = createSvgIcon(size);
    const outputPath = path.join(iconDir, name);
    
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);
    
    console.log(`Generated ${name}`);
  }

  // 生成 icon.icns 需要的 1024x1024 图标
  const svg1024 = createSvgIcon(1024);
  await sharp(Buffer.from(svg1024))
    .png()
    .toFile(path.join(iconDir, '1024x1024.png'));
  console.log('Generated 1024x1024.png');

  console.log('\n✅ Icon generation complete!');
}

generateIcons().catch(console.error);
