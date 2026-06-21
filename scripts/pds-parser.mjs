// Generic PDS (Paradox Development Studio) script parser for Node.js
// Mirror of src/lib/parser/pds-parser.ts for use in preload .mjs scripts

function tokenize(text) {
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { i++; continue; }

    // Comments
    if (ch === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }

    // Braces
    if (ch === '{') { tokens.push({ type: 'brace_open', value: '{' }); i++; continue; }
    if (ch === '}') { tokens.push({ type: 'brace_close', value: '}' }); i++; continue; }
    if (ch === '=') { tokens.push({ type: 'equals', value: '=' }); i++; continue; }

    // Quoted string
    if (ch === '"') {
      let str = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) { str += text[i + 1]; i += 2; }
        else { str += text[i]; i++; }
      }
      i++;
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Variable
    if (ch === '@') {
      let id = '@'; i++;
      while (i < text.length && /[a-zA-Z0-9_.]/.test(text[i])) { id += text[i]; i++; }
      tokens.push({ type: 'variable', value: id });
      continue;
    }

    // Number
    if ((ch >= '0' && ch <= '9') || (ch === '-' && i + 1 < text.length && text[i + 1] >= '0' && text[i + 1] <= '9')) {
      let num = '';
      while (i < text.length && /[0-9.\-]/.test(text[i])) { num += text[i]; i++; }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifier
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < text.length && /[a-zA-Z0-9_./:\-\[\]]/.test(text[i])) { id += text[i]; i++; }
      tokens.push({ type: 'identifier', value: id });
      continue;
    }

    i++;
  }

  return tokens;
}

class PDSParser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }

  peek() { return this.pos < this.tokens.length ? this.tokens[this.pos] : null; }
  consume() { return this.tokens[this.pos++]; }

  parse() {
    const root = {};
    while (this.pos < this.tokens.length) this.parseAssignment(root);
    return root;
  }

  parseAssignment(node) {
    const t = this.peek();
    if (!t || t.type !== 'identifier') { if (t) this.consume(); return false; }
    const key = t.value;
    this.consume();
    const eq = this.peek();
    if (!eq || eq.type !== 'equals') return false;
    this.consume();
    const value = this.parseValue();
    if (value === undefined) return false;
    this.setNodeValue(node, key, value);
    return true;
  }

  parseValue() {
    const t = this.peek();
    if (!t) return undefined;
    switch (t.type) {
      case 'brace_open': this.consume(); return this.parseBlock();
      case 'string': this.consume(); return t.value;
      case 'number': { this.consume(); const n = parseFloat(t.value); return isNaN(n) ? t.value : n; }
      case 'identifier': this.consume(); if (t.value === 'yes') return true; if (t.value === 'no') return false; return t.value;
      case 'variable': this.consume(); return t.value;
      default: this.consume(); return undefined;
    }
  }

  parseBlock() {
    const node = {};
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (!t) break;
      if (t.type === 'brace_close') { this.consume(); return node; }
      if (t.type === 'identifier') this.parseAssignment(node);
      else this.consume();
    }
    return node;
  }

  setNodeValue(node, key, value) {
    const existing = node[key];
    if (existing === undefined) node[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else node[key] = [existing, value];
  }
}

export function parsePDSText(text) {
  const tokens = tokenize(text);
  return new PDSParser(tokens).parse();
}

// Helpers
export function asArray(val) {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

export function asString(val) {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'yes' : 'no';
  return '';
}

export function isBlockNode(val) {
  return typeof val === 'object' && !Array.isArray(val) && val !== null;
}

/** Find all blocks in a node that match given key, shallow search only */
export function findBlocks(node, key) {
  const results = [];
  const val = node[key];
  if (val !== undefined) {
    const items = Array.isArray(val) ? val : [val];
    for (const item of items) {
      if (isBlockNode(item)) results.push(item);
    }
  }
  return results;
}

/** Find all event blocks (country_event, planet_event, ship_event, fleet_event, event, etc.) */
export function findAllEventBlocks(node) {
  const eventKeys = ['country_event','planet_event','ship_event','fleet_event','pop_event','event'];
  const results = [];
  for (const key of eventKeys) {
    const items = findBlocks(node, key);
    for (const item of items) results.push({ type: key, block: item });
  }
  return results;
}
