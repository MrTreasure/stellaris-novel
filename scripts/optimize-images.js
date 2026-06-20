// 优化图片: BMP → WebP (更小,浏览器原生支持)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'public/images';
const OUT = 'public/images';

async function optimize() {
  const files = fs.readdirSync(SRC);
  let ok = 0, skip = 0;

  for (const f of files) {
    if (!f.endsWith('.bmp')) continue;
    const srcPath = path.join(SRC, f);
    const webpName = f.replace(/\.bmp$/i, '.webp');
    const webpPath = path.join(OUT, webpName);

    try {
      const img = sharp(srcPath);
      const meta = await img.metadata();

      // 大图(加载画面/事件图)缩小到合适尺寸
      let pipeline = img;
      if (meta.width && meta.width > 1200) {
        pipeline = pipeline.resize(1200);
      } else if (meta.width && meta.width > 600) {
        pipeline = pipeline.resize(600);
      }

      await pipeline.webp({ quality: 80 }).toFile(webpPath);

      const srcSize = fs.statSync(srcPath).size;
      const dstSize = fs.statSync(webpPath).size;
      console.log(`  ✓ ${f} → ${webpName} (${(srcSize/1024).toFixed(0)}KB → ${(dstSize/1024).toFixed(0)}KB, ${meta.width}x${meta.height})`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${f}: ${e.message}`);
      skip++;
    }
  }

  console.log(`\n完成: ${ok} 转换, ${skip} 跳过`);
}

optimize().catch(e => console.error(e));
