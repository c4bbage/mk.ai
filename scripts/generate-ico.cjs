const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const iconDir = path.join(__dirname, '../src-tauri/icons');

async function generateIco() {
  const sourcePath = path.join(iconDir, 'icon.png');
  const sizes = [16, 32, 48, 64, 128, 256];

  // Generate PNG buffers for each size
  const buffers = [];
  for (const size of sizes) {
    const buffer = await sharp(sourcePath)
      .resize(size, size, { fit: 'cover', background: '#FFFFFF' })
      .png()
      .toBuffer();
    buffers.push(buffer);
  }

  // Use library to produce ICO with proper PNG-ICO headers for best Windows compatibility
  const icoBuffer = await pngToIco(buffers);
  const icoPath = path.join(iconDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('✅ icon.ico created via png-to-ico!');
}

generateIco().catch((e) => { console.error(e); process.exit(1); });
