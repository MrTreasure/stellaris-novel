// 群星游戏目录数据导入器 — 纯 TypeScript 实现
// 解析 localisation、events、common 目录 → 写入 SQLite game_data 表

import fs from 'fs';
import path from 'path';
import { insertGameDataBatch, getGameDataCount } from '@/lib/db';
import type { GameData } from '@/types';

// ===== 本地化文件解析 =====

interface LocEntry {
  key: string;
  zh_name: string;
  description: string;
}

function parseLocalisationFile(filePath: string): LocEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const entries: LocEntry[] = [];

  // 格式: key:序号 "文本"
  // 例如: anomaly.35:0 "分子焕活所"
  //       anomaly.35.desc:0 "深入研究细胞的复杂性..."

  // 先收集所有条目
  const rawEntries: Map<string, { name?: string; desc?: string }> = new Map();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('l_')) continue;

    // 匹配 key:number "value"
    const m = trimmed.match(/^([\w.]+):\d+\s+"(.+)"$/);
    if (!m) continue;

    const key = m[1];
    const value = m[2];

    if (key.endsWith('.desc')) {
      // 描述
      const parentKey = key.slice(0, -5); // 去掉 .desc
      if (!rawEntries.has(parentKey)) rawEntries.set(parentKey, {});
      rawEntries.get(parentKey)!.desc = value;
    } else if (!key.includes('.')) {
      // 顶级条目直接存
      if (!rawEntries.has(key)) rawEntries.set(key, {});
      rawEntries.get(key)!.name = value;
    } else {
      // 普通条目 (如 anomaly.35)
      if (!rawEntries.has(key)) rawEntries.set(key, {});
      rawEntries.get(key)!.name = value;
    }
  }

  // 转换为 GameData
  for (const [key, val] of rawEntries) {
    if (!val.name && !val.desc) continue;

    // 推断分类
    let category = guessCategory(key);

    entries.push({
      key,
      zh_name: val.name || '',
      description: val.desc || '',
    });
  }

  return entries;
}

function guessCategory(key: string): string {
  if (key.startsWith('anomaly.')) return 'anomaly';
  if (key.startsWith('tech_')) return 'technology';
  if (key.startsWith('tradition_')) return 'tradition';
  if (key.startsWith('ascension_perk_')) return 'ascension_perk';
  if (key.startsWith('ethic_')) return 'ethic';
  if (key.startsWith('civic_')) return 'civic';
  if (key.startsWith('origin_')) return 'origin';
  if (key.startsWith('building_')) return 'building';
  if (key.startsWith('megastructure_')) return 'megastructure';
  if (key.startsWith('crisis_')) return 'crisis';
  if (key.startsWith('story.') || key.startsWith('fleet.') || key.startsWith('event.')) return 'event';
  if (key.startsWith('trait_')) return 'trait';
  if (key.startsWith('edict_')) return 'edict';
  if (key.startsWith('resolution_')) return 'resolution';
  if (key.startsWith('relic_')) return 'relic';
  return 'other';
}

// ===== 群星游戏目录扫描 =====

function scanGameDirectory(stellarisDir: string): LocEntry[] {
  const allEntries: LocEntry[] = [];
  const localisationDir = path.join(stellarisDir, 'localisation');

  // 优先简体中文
  const zhFile = path.join(localisationDir, 'l_simp_chinese.yml');
  const enFile = path.join(localisationDir, 'l_english.yml');

  if (fs.existsSync(zhFile)) {
    console.log('  解析 l_simp_chinese.yml...');
    const entries = parseLocalisationFile(zhFile);
    allEntries.push(...entries);
    console.log(`  提取了 ${entries.length} 条中文条目`);
  } else if (fs.existsSync(enFile)) {
    console.log('  未找到中文文件,回退到英文 l_english.yml...');
    const entries = parseLocalisationFile(enFile);
    allEntries.push(...entries);
    console.log(`  提取了 ${entries.length} 条英文条目`);
  } else {
    console.log('  未找到本地化文件');
  }

  return allEntries;
}

// ===== 主入口 =====

export function importGameData(stellarisDir: string): { total: number; categories: Record<string, number> } {
  if (!fs.existsSync(stellarisDir)) {
    throw new Error(`群星游戏目录不存在: ${stellarisDir}`);
  }

  console.log(`导入游戏数据: ${stellarisDir}`);

  // 扫描本地化文件
  const locEntries = scanGameDirectory(stellarisDir);

  // 转换为 GameData 格式
  const gameData: GameData[] = locEntries.map(e => ({
    key: e.key,
    zh_name: e.zh_name,
    description: e.description,
    category: guessCategory(e.key),
  }));

  // 批量写入 SQLite
  insertGameDataBatch(gameData);

  const total = getGameDataCount();
  console.log(`入库完成,共 ${total} 条`);

  return { total, categories: {} };
}

// ===== CLI 入口 =====

if (require?.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('用法: npx ts-node game-importer.ts <群星游戏目录>');
    process.exit(1);
  }
  const result = importGameData(dir);
  console.log(JSON.stringify(result, null, 2));
}
