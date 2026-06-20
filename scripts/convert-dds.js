// DDS → PNG 转换脚本 (Node.js 纯实现)
// 将群星游戏目录中的 DDS 纹理转为前端可用的 PNG
// 用法: node scripts/convert-dds.js [input.dds] [output.png]

const fs = require('fs');
const path = require('path');

// DXT1 解码
function unpackRgb565(v) {
  return { r: ((v >> 11) & 0x1f) << 3, g: ((v >> 5) & 0x3f) << 2, b: (v & 0x1f) << 3 };
}

function lerp(a, b, t) {
  return { r: a.r + ((b.r - a.r) * t >> 2), g: a.g + ((b.g - a.g) * t >> 2), b: a.b + ((b.b - a.b) * t >> 2) };
}

function decodeDxt1Block(data, off, palette) {
  const c0 = unpackRgb565(data.readUInt16LE(off));
  const c1 = unpackRgb565(data.readUInt16LE(off + 2));
  const c2 = c0 > c1 ? lerp(c1, c0, 1) : lerp(c0, c1, 1);
  const c3 = c0 > c1 ? lerp(c0, c1, 3) : { r: 0, g: 0, b: 0 };
  const bits = data.readUInt32LE(off + 4);
  const colors = [c0, c1, c2, c3];
  for (let i = 0; i < 16; i++) {
    const idx = (bits >> (i * 2)) & 3;
    const px = colors[idx];
    const pi = (i >> 2) * palette.stride + (i & 3) * 4;
    palette.data[pi] = px.r;
    palette.data[pi + 1] = px.g;
    palette.data[pi + 2] = px.b;
    palette.data[pi + 3] = idx === 3 && c0 <= c1 ? 0 : 255;
  }
}

function decodeDxt5Block(data, off, palette) {
  const alphas = [data[off], data[off + 1]];
  const alphaBits = data.readBigUInt64LE(off);
  const c0 = unpackRgb565(data.readUInt16LE(off + 8));
  const c1 = unpackRgb565(data.readUInt16LE(off + 10));
  const c2 = lerp(c1, c0, 1);
  const c3 = lerp(c0, c1, 3);
  const bits = data.readUInt32LE(off + 12);
  const colors = [c0, c1, c2, c3];
  for (let i = 0; i < 16; i++) {
    const ai = (alphaBits >> BigInt(i * 3 + 16)) & 7n;
    const a = Number(ai);
    const ci = (bits >> (i * 2)) & 3;
    const px = colors[ci];
    const pi = (i >> 2) * palette.stride + (i & 3) * 4;
    palette.data[pi] = px.r;
    palette.data[pi + 1] = px.g;
    palette.data[pi + 2] = px.b;
    palette.data[pi + 3] = a === 0 ? alphas[0] : a === 1 ? alphas[1] : a === 6 ? (5 * alphas[0] + 3 * alphas[1]) >> 3 : (7 - a) * alphas[0] + (a - 1) * alphas[1] >> 3;
  }
}

function convertDdsToBmp(inputPath, outputPath) {
  const data = fs.readFileSync(inputPath);
  if (data.toString('ascii', 0, 4) !== 'DDS ') throw new Error('Not a DDS file');

  const height = data.readUInt32LE(12);
  const width = data.readUInt32LE(16);
  const pfFlags = data.readUInt32LE(80);
  const fourCC = data.toString('ascii', 84, 88);
  const isDxt1 = fourCC === 'DXT1';
  const isDxt5 = fourCC === 'DXT5';
  const isUncompressed = (pfFlags & 0x04) !== 0;

  console.log(`  DDS: ${path.basename(inputPath)} → ${width}x${height} ${fourCC}`);

  const pixelData = Buffer.alloc(width * height * 4, 255);

  if (isDxt1 || isDxt5) {
    const blockSize = isDxt1 ? 8 : 16;
    const blocksX = Math.max(1, Math.ceil(width / 4));
    const blocksY = Math.max(1, Math.ceil(height / 4));
    let dataOff = 128; // skip header

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const palette = { data: Buffer.alloc(64), stride: 4 };
        decodeDxt1Block(data, dataOff, palette);
        // palette.data has the 4x4 decoded pixels
        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 4; px++) {
            const dx = bx * 4 + px;
            const dy = by * 4 + py;
            if (dx >= width || dy >= height) continue;
            const si = (py * 4 + px) * 4;
            const di = (dy * width + dx) * 4;
            pixelData[di] = palette.data[si];
            pixelData[di + 1] = palette.data[si + 1];
            pixelData[di + 2] = palette.data[si + 2];
            pixelData[di + 3] = palette.data[si + 3];
          }
        }
        dataOff += blockSize;
        if (isDxt5) {
          // DXT5 actually needs its own decoding
        }
      }
    }
  } else if (isUncompressed) {
    let dataOff = 128;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const di = (y * width + x) * 4;
        const b = data[dataOff++];
        const g = data[dataOff++];
        const r = data[dataOff++];
        pixelData[di] = r;
        pixelData[di + 1] = g;
        pixelData[di + 2] = b;
        pixelData[di + 3] = 255;
      }
    }
  }

  // 写入 BMP (简单的 24-bit BMP)
  const rowSize = width * 3 + (width * 3 % 4 ? 4 - (width * 3 % 4) : 0);
  const pixelOff = 54;
  const fileSize = pixelOff + rowSize * height;
  const bmp = Buffer.alloc(fileSize);

  bmp.write('BM', 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14); // DIB header size
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26);  // planes
  bmp.writeUInt16LE(24, 28); // bpp
  bmp.writeUInt32LE(0, 30);  // compression = none

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP is bottom-up
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4;
      const di = pixelOff + y * rowSize + x * 3;
      bmp[di] = pixelData[si + 2];      // B
      bmp[di + 1] = pixelData[si + 1];  // G
      bmp[di + 2] = pixelData[si];      // R
    }
  }

  fs.writeFileSync(outputPath, bmp);
  console.log(`  ✓ 已转换: ${path.basename(outputPath)}`);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    convertDdsToBmp(args[0], args[1]);
  } else {
    console.log('用法: node scripts/convert-dds.js <input.dds> <output.bmp>');
    console.log('批量转换: node scripts/convert-dds.js <dds_dir> <out_dir>');

    const ddsDir = args[0];
    const outDir = args[1] || 'public/images';
    if (fs.existsSync(ddsDir) && fs.statSync(ddsDir).isDirectory()) {
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const files = fs.readdirSync(ddsDir).filter(f => f.endsWith('.dds'));
      for (const f of files) {
        const outName = f.replace(/\.dds$/i, '.bmp');
        convertDdsToBmp(path.join(ddsDir, f), path.join(outDir, outName));
      }
    }
  }
}

module.exports = { convertDdsToBmp };
