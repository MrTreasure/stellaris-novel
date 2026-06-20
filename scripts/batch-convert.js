// 批量转换群星游戏资源
const fs = require('fs');
const path = require('path');
const { convertDdsToBmp } = require('./convert-dds');

const STELLARIS = 'G:/SteamLibrary/steamapps/common/Stellaris';
const OUT = 'public/images';
const files = [];

// 确保输出目录
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// 1. 复制 PNG
const pngFiles = [
  [STELLARIS + '/assets/game-logo.png', 'logo.png'],
  [STELLARIS + '/assets/app-background.png', 'bg-space.png'],
];
for (const [src, dst] of pngFiles) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, OUT + '/' + dst);
    console.log('✓ 复制:', dst);
  }
}

// 2. 转换事件图片 (选适合做 banner 的大尺寸)
const eventPics = [
  'alien_city', 'alien_planet', 'space_battle', 'dyson_sphere',
  'alien_ruins', 'ancient_ruins', 'galactic_core', 'space_exploration',
  'alien_biosphere', 'ai_planet', 'strategic_reason', 'ascension',
];
for (const name of eventPics) {
  const src = `${STELLARIS}/gfx/event_pictures/${name}.dds`;
  if (fs.existsSync(src)) files.push([src, `event_${name}.bmp`]);
}

// 3. 转换加载画面 (1920x1080 的大图)
for (let i = 1; i <= 20; i++) {
  const src = `${STELLARIS}/gfx/loadingscreens/load_${i}.dds`;
  if (fs.existsSync(src)) files.push([src, `load_${i}.bmp`]);
}

// 4. 巨型结构图标
const megaIcons = [
  'dyson_sphere', 'dyson_swarm_1', 'crisis_sphere',
  'galactic_crucible', 'behemoth_egg',
];
for (const name of megaIcons) {
  const src = `${STELLARIS}/gfx/interface/icons/megastructures/${name}.dds`;
  if (fs.existsSync(src)) files.push([src, `mega_${name}.bmp`]);
}

// 5. 科技图标 (选代表性的)
const techIcons = [
  'tech_titans', 'tech_colossus', 'tech_mega_engineering',
  'tech_jump_drive_1', 'tech_synthetics', 'tech_gateway_construction',
];
for (const name of techIcons) {
  const src = `${STELLARIS}/gfx/interface/icons/technologies/${name}.dds`;
  const src2 = `${STELLARIS}/gfx/interface/icons/technologies/categories/${name}.dds`;
  if (fs.existsSync(src)) files.push([src, `tech_${name}.bmp`]);
  if (fs.existsSync(src2)) files.push([src2, `tech_${name}.bmp`]);
}

// 6. 传统/飞升图标
const ascIcons = [
  'ap_arcology_project', 'ap_colossus_project', 'ap_mastery_of_nature',
  'ap_defender_of_the_galaxy', 'ap_executive_vigilance',
];
for (const name of ascIcons) {
  const src = `${STELLARIS}/gfx/interface/icons/ascension_perks/${name}.dds`;
  if (fs.existsSync(src)) files.push([src, `ap_${name}.bmp`]);
}

// 执行转换
console.log(`\n共 ${files.length} 个 DDS 文件待转换...`);
let ok = 0, fail = 0;
for (const [src, dst] of files) {
  try {
    convertDdsToBmp(src, OUT + '/' + dst);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${dst}: ${e.message}`);
    fail++;
  }
}
console.log(`\n完成: ${ok} 成功, ${fail} 失败`);
console.log(`图片保存在 ${OUT}/`);
