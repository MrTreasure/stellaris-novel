// Generic PDS (Paradox Development Studio) script parser
// Handles Stellaris game script files: events, anomalies, archaeology, projects, etc.
//
// PDS format:
//   key = value        — scalar assignment
//   key = { ... }      — block assignment
//   key = "string"     — quoted string
//   key = @variable    — variable reference
//   key = identifier   — unquoted identifier
//   Repeated keys are collected into arrays.

export type PDSValue = string | number | boolean | PDSNode | PDSValue[];
export interface PDSNode {
  [key: string]: PDSValue | PDSValue[];
}

// Tokenizer state
interface Token {
  type: 'brace_open' | 'brace_close' | 'equals' | 'string' | 'number' | 'identifier' | 'variable';
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    // Comments: # to end of line
    if (ch === '#') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    // Braces
    if (ch === '{') { tokens.push({ type: 'brace_open', value: '{' }); i++; continue; }
    if (ch === '}') { tokens.push({ type: 'brace_close', value: '}' }); i++; continue; }
    if (ch === '=') { tokens.push({ type: 'equals', value: '=' }); i++; continue; }

    // Quoted string
    if (ch === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          str += text[i + 1];
          i += 2;
        } else {
          str += text[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Variable reference
    if (ch === '@') {
      let id = '@';
      i++;
      while (i < text.length && /[a-zA-Z0-9_.]/.test(text[i])) { id += text[i]; i++; }
      tokens.push({ type: 'variable', value: id });
      continue;
    }

    // Number (including negative and decimals)
    if ((ch >= '0' && ch <= '9') || (ch === '-' && i + 1 < text.length && text[i + 1] >= '0' && text[i + 1] <= '9')) {
      let num = '';
      while (i < text.length && /[0-9.\-]/.test(text[i])) { num += text[i]; i++; }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifier (unquoted key/name)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < text.length && /[a-zA-Z0-9_./:\-\[\]]/.test(text[i])) { id += text[i]; i++; }
      tokens.push({ type: 'identifier', value: id });
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

// ===== Parser =====

class PDSParser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: Token['type']): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type} (${t.value})`);
    return t;
  }

  /** Parse top-level: zero or more assignment statements */
  parse(): PDSNode {
    const root: PDSNode = {};
    while (this.pos < this.tokens.length) {
      this.parseAssignment(root);
    }
    return root;
  }

  /** Parse one assignment: key = value  or  key = { ... } */
  private parseAssignment(node: PDSNode): boolean {
    const t = this.peek();
    if (!t) return false;

    // Only identifiers can start an assignment
    if (t.type !== 'identifier') {
      this.consume(); // skip
      return false;
    }

    const key = t.value;
    this.consume(); // consume identifier

    // Expect '='
    const eq = this.peek();
    if (!eq || eq.type !== 'equals') {
      // Not an assignment — might be bare identifier, skip
      return false;
    }
    this.consume(); // consume '='

    const value = this.parseValue();
    if (value === undefined) return false;

    this.setNodeValue(node, key, value);
    return true;
  }

  /** Parse a value after '=' */
  private parseValue(): PDSValue | undefined {
    const t = this.peek();
    if (!t) return undefined;

    switch (t.type) {
      case 'brace_open':
        this.consume(); // consume '{'
        const block = this.parseBlock();
        return block;
      case 'string':
        this.consume();
        return t.value;
      case 'number': {
        this.consume();
        const n = parseFloat(t.value);
        return isNaN(n) ? t.value : n;
      }
      case 'identifier': {
        this.consume();
        // Handle booleans
        if (t.value === 'yes') return true;
        if (t.value === 'no') return false;
        return t.value;
      }
      case 'variable':
        this.consume();
        return t.value;
      default:
        // Unexpected token, skip
        this.consume();
        return undefined;
    }
  }

  /** Parse block contents: zero or more assignment statements */
  private parseBlock(): PDSNode {
    const node: PDSNode = {};
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (!t) break;
      if (t.type === 'brace_close') {
        this.consume(); // consume '}'
        return node;
      }
      if (t.type === 'identifier') {
        this.parseAssignment(node);
      } else {
        this.consume(); // skip unexpected
      }
    }
    return node;
  }

  /** Set value on node, handling repeated keys as arrays */
  private setNodeValue(node: PDSNode, key: string, value: PDSValue) {
    const existing = node[key];
    if (existing === undefined) {
      node[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      node[key] = [existing, value];
    }
  }
}

// ===== Public API =====

/** Parse a PDS script string into a nested node structure */
export function parsePDSText(text: string): PDSNode {
  const tokens = tokenize(text);
  const parser = new PDSParser(tokens);
  return parser.parse();
}

/** Parse a PDS file at the given path */
export function parsePDSFile(filePath: string, readFile: (path: string) => string): PDSNode {
  return parsePDSText(readFile(filePath));
}

// ===== Query helpers =====

/** Get nested value by dot-separated path: "option.name" */
export function getByPath(node: PDSNode, path: string): PDSValue | undefined {
  const parts = path.split('.');
  let current: PDSValue | undefined = node;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    if (typeof current === 'object' && !Array.isArray(current)) {
      current = (current as PDSNode)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Find all blocks of a given type (key) in a node, recursively */
export function findAllBlocks(node: PDSNode, blockType: string): { key: string; value: PDSNode }[] {
  const results: { key: string; value: PDSNode }[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === blockType) {
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (typeof item === 'object' && !Array.isArray(item)) {
          results.push({ key, value: item });
        }
      }
    }
    // Recursively search block values
    const items = Array.isArray(value) ? value : [value];
    for (const v of items) {
      if (typeof v === 'object' && !Array.isArray(v)) {
        results.push(...findAllBlocks(v, blockType));
      }
    }
  }
  return results;
}

/** Check if a PDS value is a block node */
export function isBlockNode(value: PDSValue | undefined): value is PDSNode {
  return typeof value === 'object' && !Array.isArray(value) && value !== null;
}

/** Get string value, safely */
export function asString(value: PDSValue | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return '';
}

/** Get array of values for a repeated key */
export function asArray(value: PDSValue | undefined): PDSValue[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
