const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const iconDir = path.join(__dirname, '../src-tauri/icons');

// ICO file format header
function createIcoHeader(numImages) {
  const buffer = Buffer.alloc(6);
  buffer.writeUInt16LE(0, 0); // Reserved
  buffer.writeUInt16LE(1, 2); // ICO type
  buffer.writeUInt16LE(numImages, 4); // Number of images
  return buffer;
}

// ICO directory entry
function createIcoDirEntry(width, height, size, offset) {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt8(width === 256 ? 0 : width, 0);
  buffer.writeUInt8(height === 256 ? 0 : height, 1);
  buffer.writeUInt8(0, 2); // Color palette
  buffer.writeUInt8(0, 3); // Reserved
  buffer.writeUInt16LE(1, 4); // Color planes
  buffer.writeUInt16LE(32, 6); // Bits per pixel
  buffer.writeUInt32LE(size, 8); // Image size
  buffer.writeUInt32LE(offset, 12); // Offset
  return buffer;
}

async function generateIco() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  
  const sourcePath = path.join(iconDir, 'icon.png');
  
  for (const size of sizes) {
    const buffer = await sharp(sourcePath)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer });
  }
  
  // Calculate offsets
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + (dirEntrySize * pngBuffers.length);
  
  const dirEntries = [];
  for (const { size, buffer } of pngBuffers) {
    dirEntries.push(createIcoDirEntry(size, size, buffer.length, offset));
    offset += buffer.length;
  }
  
  // Assemble ICO file
  const header = createIcoHeader(pngBuffers.length);
  const ico = Buffer.concat([
    header,
    ...dirEntries,
    ...pngBuffers.map(p => p.buffer)
  ]);
  
  const icoPath = path.join(iconDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  
  console.log('✅ icon.ico created!');
}

generateIco().catch(console.error);
