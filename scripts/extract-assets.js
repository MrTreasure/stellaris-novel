// 从群星游戏提取图片资源 (修复后的 DXT1 解码器)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const STELLARIS = 'G:/SteamLibrary/steamapps/common/Stellaris';
const OUT = 'public/images';

function rgb565(v) {
  return { r: ((v >> 11) & 0x1f) * 255 / 31, g: ((v >> 5) & 0x3f) * 255 / 63, b: (v & 0x1f) * 255 / 31 };
}

function decodeDXT1(data, off) {
  const c0 = data.readUInt16LE(off);
  const c1 = data.readUInt16LE(off + 2);
  const bits = data.readUInt32LE(off + 4);
  const col0 = rgb565(c0);
  const col1 = rgb565(c1);
  const use4 = c0 > c1;

  const colors = [
    col0,
    col1,
    use4 ? { r: (2*col0.r + col1.r)/3, g: (2*col0.g + col1.g)/3, b: (2*col0.b + col1.b)/3 }
         : { r: (col0.r + col1.r)/2, g: (col0.g + col1.g)/2, b: (col0.b + col1.b)/2 },
    use4 ? { r: (col0.r + 2*col1.r)/3, g: (col0.g + 2*col1.g)/3, b: (col0.b + 2*col1.b)/3 }
         : { r: 0, g: 0, b: 0 },
  ];

  const pixels = new Array(16);
  for (let i = 0; i < 16; i++) {
    const idx = (bits >> (i * 2)) & 3;
    const c = colors[idx];
    pixels[i] = { r: c.r, g: c.g, b: c.b, a: (!use4 && idx === 3) ? 0 : 255 };
  }
  return pixels;
}

// RGBA32 未压缩块直接读取
function decodeRGBA(data, off) {
  const pixels = new Array(16);
  for (let i = 0; i < 16; i++) {
    const po = off + i * 4;
    pixels[i] = { b: data[po], g: data[po+1], r: data[po+2], a: data[po+3] };
  }
  return pixels;
}

function ddsToRawPixels(inputPath) {
  const data = fs.readFileSync(inputPath);
  if (data.toString('ascii', 0, 4) !== 'DDS ') throw new Error('Not DDS');

  const h = data.readUInt32LE(12);
  const w = data.readUInt32LE(16);
  const pfFlags = data.readUInt32LE(80);
  const fourCC = data.toString('ascii', 84, 88).trim();
  const bpp = data.readUInt32LE(88);

  const isDXT = !!(pfFlags & 0x04);
  const isRGB = !!(pfFlags & 0x40);
  const isUncompressed = isRGB && (fourCC === '' || fourCC === '\x00\x00\x00\x00');

  const pixels = Buffer.alloc(w * h * 4, 0);

  if (isRGB && bpp === 32) {
    // 32-bit BGRA
    let off = 128;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const di = (y * w + x) * 4;
        pixels[di] = data[off + 2];     // R
        pixels[di+1] = data[off + 1];   // G
        pixels[di+2] = data[off];       // B
        pixels[di+3] = data[off + 3];   // A
        off += 4;
      }
    }
  } else if (isRGB && bpp === 24) {
    // 24-bit BGR
    let off = 128;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const di = (y * w + x) * 4;
        pixels[di] = data[off + 2];     // R
        pixels[di+1] = data[off + 1];   // G
        pixels[di+2] = data[off];       // B
        pixels[di+3] = 255;             // A
        off += 3;
      }
    }
  } else if (fourCC.startsWith('DXT')) {
    const blockSize = fourCC === 'DXT1' ? 8 : 16;
    const bx = Math.ceil(w / 4);
    const by = Math.ceil(h / 4);
    let off = 128;

    for (let byi = 0; byi < by; byi++) {
      for (let bxi = 0; bxi < bx; bxi++) {
        let blockPixels;
        if (fourCC === 'DXT1') {
          blockPixels = decodeDXT1(data, off);
        } else {
          // DXT3/DXT5: skip alpha block for now, decode DXT1 color
          blockPixels = decodeDXT1(data, off + (fourCC === 'DXT5' ? 8 : 8));
        }

        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 4; px++) {
            const dx = bxi * 4 + px;
            const dy = byi * 4 + py;
            if (dx >= w || dy >= h) continue;
            const idx = py * 4 + px;
            const di = (dy * w + dx) * 4;
            pixels[di] = blockPixels[idx].r;
            pixels[di+1] = blockPixels[idx].g;
            pixels[di+2] = blockPixels[idx].b;
            pixels[di+3] = blockPixels[idx].a;
          }
        }
        off += blockSize;
      }
    }
  } else {
    throw new Error(`Unsupported format: ${fourCC}, bpp=${bpp}`);
  }

  return { pixels, w, h };
}

function saveAsPNG(img, outputPath) {
  const w = img.w, h = img.h;
  const rowSize = 1 + w * 3; // filter byte + RGB pixels
  const raw = Buffer.alloc(rowSize * h);

  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * rowSize + 1 + x * 3;
      raw[di] = img.pixels[si];     // R
      raw[di + 1] = img.pixels[si + 1]; // G
      raw[di + 2] = img.pixels[si + 2]; // B
    }
  }

  const deflated = zlib.deflateSync(raw);

  // Build PNG chunks
  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crc = crc32(buf.slice(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = makeChunk('IDAT', deflated);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  fs.writeFileSync(outputPath, Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    idat,
    iend,
  ]));
}

// CRC32 for PNG
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Main
async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // Copy PNGs
  if (fs.existsSync(`${STELLARIS}/assets/game-logo.png`))
    fs.copyFileSync(`${STELLARIS}/assets/game-logo.png`, `${OUT}/logo.png`);
  if (fs.existsSync(`${STELLARIS}/assets/app-background.png`))
    fs.copyFileSync(`${STELLARIS}/assets/app-background.png`, `${OUT}/bg-space.png`);

  // 所有图片 → PNG (使用内置编码器,不依赖sharp)
  console.log('加载画面:');
  for (let i = 1; i <= 20; i++) {
    const src = `${STELLARIS}/gfx/loadingscreens/load_${i}.dds`;
    if (!fs.existsSync(src)) continue;
    try {
      const img = ddsToRawPixels(src);
      saveAsPNG(img, `${OUT}/hero_${i}.png`);
      console.log(`  ✓ hero_${i}.png (${img.w}x${img.h})`);
    } catch (e) { console.log(`  ✗ load_${i}: ${e.message}`); }
  }

  console.log('事件+图标:');
  const itemDefs = [
    [STELLARIS + '/gfx/event_pictures/alien_city.dds', 'event_alien_city.png'],
    [STELLARIS + '/gfx/event_pictures/alien_planet.dds', 'event_alien_planet.png'],
    [STELLARIS + '/gfx/event_pictures/dyson_sphere.dds', 'event_dyson_sphere.png'],
    [STELLARIS + '/gfx/event_pictures/alien_ruins.dds', 'event_alien_ruins.png'],
    [STELLARIS + '/gfx/event_pictures/ancient_ruins.dds', 'event_ancient_ruins.png'],
    [STELLARIS + '/gfx/event_pictures/ai_planet.dds', 'event_ai_planet.png'],
    [STELLARIS + '/gfx/interface/icons/technologies/tech_titans.dds', 'icon_tech_titans.png'],
    [STELLARIS + '/gfx/interface/icons/technologies/tech_colossus.dds', 'icon_tech_colossus.png'],
    [STELLARIS + '/gfx/interface/icons/technologies/tech_mega_engineering.dds', 'icon_tech_mega_engineering.png'],
    [STELLARIS + '/gfx/interface/icons/technologies/tech_jump_drive_1.dds', 'icon_tech_jump_drive_1.png'],
    [STELLARIS + '/gfx/interface/icons/technologies/tech_gateway_construction.dds', 'icon_tech_gateway_construction.png'],
    [STELLARIS + '/gfx/interface/icons/technologies/tech_synthetics.dds', 'icon_tech_synthetics.png'],
    [STELLARIS + '/gfx/interface/icons/megastructures/dyson_sphere.dds', 'icon_mega_dyson_sphere.png'],
    [STELLARIS + '/gfx/interface/icons/megastructures/dyson_swarm_1.dds', 'icon_mega_dyson_swarm_1.png'],
    [STELLARIS + '/gfx/interface/icons/megastructures/crisis_sphere.dds', 'icon_mega_crisis_sphere.png'],
    [STELLARIS + '/gfx/interface/icons/ascension_perks/ap_arcology_project.dds', 'icon_ap_arcology_project.png'],
    [STELLARIS + '/gfx/interface/icons/ascension_perks/ap_colossus_project.dds', 'icon_ap_colossus_project.png'],
    [STELLARIS + '/gfx/interface/icons/ascension_perks/ap_defender_of_the_galaxy.dds', 'icon_ap_defender.png'],
  ];

  for (const [src, outName] of itemDefs) {
    if (!fs.existsSync(src)) continue;
    try {
      const img = ddsToRawPixels(src);
      saveAsPNG(img, OUT + '/' + outName);
      console.log('  ✓ ' + outName);
    } catch (e) { console.log('  ✗ ' + outName + ': ' + e.message); }
  }

  console.log('\n完成!');
}

main().catch(console.error);
