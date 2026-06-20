// Node.js 内置 SQLite 类型声明 (Node 24+)
// 实验性 API 的类型补丁

declare module 'node:sqlite' {
  interface DatabaseSyncOptions {
    readonly?: boolean;
    allowExtension?: boolean;
  }

  interface StatementResulting {
    lastInsertRowid: bigint;
    changes: number;
  }

  export class DatabaseSync {
    constructor(file: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  interface StatementSync {
    run(...params: any[]): StatementResulting;
    get(...params: any[]): unknown;
    all(...params: any[]): unknown[];
  }
}
