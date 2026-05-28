const fs = require('fs');
const path = require('path');

// Target paths
const pngSrc = `C:\\Users\\HP\\.gemini\\antigravity\\brain\\56830c24-437b-4e44-b68b-2499c9193452\\restaurant_os_icon_1779939860688.png`;
const pngDest = path.join(__dirname, 'logo.png');
const pngPublicDest = path.join(__dirname, 'public', 'logo.png');
const icoDest = path.join(__dirname, 'restaurant-os.ico');
const icoFaviconDest = path.join(__dirname, 'public', 'favicon.ico');

try {
  // 1. Read PNG file
  const pngBuffer = fs.readFileSync(pngSrc);
  
  // 2. Write PNG copies
  fs.writeFileSync(pngDest, pngBuffer);
  fs.writeFileSync(pngPublicDest, pngBuffer);
  console.log('PNG copies created successfully.');
  
  // 3. Create ICO header (22 bytes)
  const icoHeader = Buffer.alloc(22);
  // Header
  icoHeader.writeUInt16LE(0, 0);     // Reserved
  icoHeader.writeUInt16LE(1, 2);     // Type (1 = ICO)
  icoHeader.writeUInt16LE(1, 4);     // Image count (1)
  
  // Directory entry
  icoHeader.writeUInt8(0, 6);        // Width (0 = 256)
  icoHeader.writeUInt8(0, 7);        // Height (0 = 256)
  icoHeader.writeUInt8(0, 8);        // Color count (0 = >= 256 colors)
  icoHeader.writeUInt8(0, 9);        // Reserved
  icoHeader.writeUInt16LE(1, 10);    // Planes (1)
  icoHeader.writeUInt16LE(32, 12);   // BPP (32)
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // Size of PNG data
  icoHeader.writeUInt32LE(22, 18);   // Offset of PNG data (22)
  
  // 4. Combine Header + PNG Data
  const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
  
  // 5. Save ICO files
  fs.writeFileSync(icoDest, icoBuffer);
  fs.writeFileSync(icoFaviconDest, icoBuffer);
  console.log('ICO icon files created successfully at root and public/ directories!');
} catch (e) {
  console.error('Error creating icon files:', e);
}
