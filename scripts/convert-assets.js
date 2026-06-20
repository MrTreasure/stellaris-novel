// 直接 DDS → WebP (跳过 BMP 中间步骤)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const STELLARIS = 'G:/SteamLibrary/steamapps/common/Stellaris';
const OUT = 'public/images';

async function convert() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // 1. 复制已有 PNG
  if (fs.existsSync(`${STELLARIS}/assets/game-logo.png`))
    fs.copyFileSync(`${STELLARIS}/assets/game-logo.png`, `${OUT}/logo.png`);
  if (fs.existsSync(`${STELLARIS}/assets/app-background.png`))
    fs.copyFileSync(`${STELLARIS}/assets/app-background.png`, `${OUT}/bg-space.png`);

  // 2. 加载画面作为 hero 背景
  console.log('转换加载画面...');
  for (let i = 1; i <= 20; i++) {
    const src = `${STELLARIS}/gfx/loadingscreens/load_${i}.dds`;
    if (!fs.existsSync(src)) continue;
    try {
      await sharp(src).resize(1200).webp({ quality: 75 }).toFile(`${OUT}/hero_${i}.webp`);
      console.log(`  ✓ hero_${i}.webp`);
    } catch (e) {
      // skip - some formats not supported
    }
  }

  // 3. 事件图片 (用作故事插图和背景)
  console.log('转换事件图片...');
  const events = [
    'alien_city', 'alien_planet', 'dyson_sphere', 'alien_ruins',
    'ancient_ruins', 'space_battle', 'ai_planet', 'ascension',
    'galactic_core', 'space_exploration',
  ];
  for (const name of events) {
    const src = `${STELLARIS}/gfx/event_pictures/${name}.dds`;
    if (!fs.existsSync(src)) continue;
    try {
      await sharp(src).resize(800).webp({ quality: 80 }).toFile(`${OUT}/event_${name}.webp`);
      console.log(`  ✓ event_${name}.webp`);
    } catch (e) { /* skip */ }
  }

  // 4. 科技图标
  console.log('转换科技图标...');
  const techs = ['tech_titans', 'tech_colossus', 'tech_mega_engineering',
    'tech_jump_drive_1', 'tech_gateway_construction', 'tech_synthetics'];
  for (const name of techs) {
    const src = `${STELLARIS}/gfx/interface/icons/technologies/${name}.dds`;
    if (!fs.existsSync(src)) continue;
    try {
      await sharp(src).resize(64).webp({ quality: 90 }).toFile(`${OUT}/icon_${name}.webp`);
      console.log(`  ✓ icon_${name}.webp`);
    } catch (e) { /* skip */ }
  }

  // 5. 巨型结构图标
  console.log('转换巨型结构图标...');
  const megas = ['dyson_sphere', 'dyson_swarm_1', 'crisis_sphere', 'galactic_crucible'];
  for (const name of megas) {
    const src = `${STELLARIS}/gfx/interface/icons/megastructures/${name}.dds`;
    if (!fs.existsSync(src)) continue;
    try {
      await sharp(src).resize(64).webp({ quality: 90 }).toFile(`${OUT}/icon_mega_${name}.webp`);
      console.log(`  ✓ icon_mega_${name}.webp`);
    } catch (e) { /* skip */ }
  }

  // 6. 飞升天赋图标
  console.log('转换飞升图标...');
  const aps = ['ap_arcology_project', 'ap_colossus_project', 'ap_defender_of_the_galaxy',
    'ap_mastery_of_nature', 'ap_executive_vigilance', 'ap_become_the_crisis'];
  for (const name of aps) {
    const src = `${STELLARIS}/gfx/interface/icons/ascension_perks/${name}.dds`;
    if (!fs.existsSync(src)) continue;
    try {
      await sharp(src).resize(64).webp({ quality: 90 }).toFile(`${OUT}/icon_ap_${name}.webp`);
      console.log(`  ✓ icon_ap_${name}.webp`);
    } catch (e) { /* skip */ }
  }

  // 清理旧 BMP
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith('.bmp')) fs.unlinkSync(path.join(OUT, f));
  }

  console.log('\n全部完成!');
  console.log(`图片目录: ${OUT}/`);
  for (const f of fs.readdirSync(OUT).sort()) {
    const s = fs.statSync(path.join(OUT, f));
    console.log(`  ${f} (${(s.size/1024).toFixed(0)}KB)`);
  }
}

convert().catch(console.error);
