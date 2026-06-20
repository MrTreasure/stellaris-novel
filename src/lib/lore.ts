// Dynamic lore loader - reads Markdown files from docs/ at runtime
// This keeps the AI prompt content separate from code, easy to update

import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'docs');

/** Load lore from a markdown file, returning the body text (stripped of frontmatter) */
export function loadLore(filename: string): string {
  const filePath = path.join(DOCS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`Lore file not found: ${filePath}`);
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  // Strip YAML frontmatter (between --- markers) if present
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)/);
  return bodyMatch ? bodyMatch[1].trim() : content.trim();
}

/** Load all lore files and concatenate them */
export function loadAllLore(): string {
  const files = [
    'stellaris-lore.md',
  ];
  let result = '';
  for (const f of files) {
    const text = loadLore(f);
    if (text) result += text + '\n\n---\n\n';
  }
  return result;
}
