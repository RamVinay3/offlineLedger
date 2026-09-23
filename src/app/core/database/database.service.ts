import { Injectable } from '@angular/core';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { SCHEMA_SQL } from './schema.sql';

const IDB_NAME = 'loop_offline_database';
const IDB_STORE = 'sqlite_storage';
const IDB_KEY = 'loop_sqlite_binary';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private db: Database | null = null;
  private sqlJs: SqlJsStatic | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() { }

  async init(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const isNode =
          typeof globalThis !== 'undefined' &&
          Boolean((globalThis as any).process?.versions?.node);

        this.sqlJs = await initSqlJs({
          locateFile: (file: string) => {
            if (isNode) {
              return `src/assets/${file}`;
            }
            return `/assets/${file}`;
          },
        });

        // Attempt to load existing SQLite binary from IndexedDB
        const savedBinary = await this.loadFromIndexedDB();

        if (savedBinary && savedBinary.length > 0) {
          this.db = new this.sqlJs.Database(savedBinary);
        } else {
          this.db = new this.sqlJs.Database();
          // Initialize schema
          this.db.run(SCHEMA_SQL);
          await this.saveToIndexedDB();
        }

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON;');

        this.isInitialized = true;
      } catch (error) {
        console.error('Failed to initialize SQLite Database:', error);
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<Database> {
    if (!this.isInitialized || !this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database is not initialized.');
    }
    return this.db;
  }

  /**
   * Execute a SELECT query and return strongly-typed results.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.ensureInitialized();
    const stmt = db.prepare(sql);
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as unknown as T;
        results.push(row);
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  private transactionDepth = 0;

  /**
   * Execute INSERT, UPDATE, DELETE statements and persist to IndexedDB.
   */
  async run(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const db = await this.ensureInitialized();
    db.run(sql, params);
    const changesRes = db.exec('SELECT changes() as changes;');
    const changes = (changesRes[0]?.values[0]?.[0] as number) || 0;
    if (this.transactionDepth === 0) {
      await this.saveToIndexedDB();
    }
    return { changes };
  }

  /**
   * Execute multiple operations within an atomic SQLite transaction.
   */
  async executeTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const db = await this.ensureInitialized();
    const isRoot = this.transactionDepth === 0;
    if (isRoot) {
      db.run('BEGIN TRANSACTION;');
    }
    this.transactionDepth++;
    try {
      const result = await operation();
      this.transactionDepth--;
      if (isRoot) {
        db.run('COMMIT;');
        await this.saveToIndexedDB();
      }
      return result;
    } catch (error) {
      if (isRoot) {
        try {
          db.run('ROLLBACK;');
        } catch {
          // Transaction may have already been rolled back by SQLite on error
        }
      }
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      throw error;
    }
  }

  /**
   * Export the complete SQLite database as a binary Uint8Array.
   */
  async exportBinary(): Promise<Uint8Array> {
    const db = await this.ensureInitialized();
    return db.export();
  }

  /**
   * Import and overwrite the current database with a binary Uint8Array.
   */
  async importBinary(data: Uint8Array): Promise<void> {
    if (!this.sqlJs) {
      this.sqlJs = await initSqlJs({
        locateFile: (file: string) => `assets/${file}`,
      });
    }
    if (this.db) {
      this.db.close();
    }
    this.db = new this.sqlJs.Database(data);
    this.db.run('PRAGMA foreign_keys = ON;');
    this.isInitialized = true;
    await this.saveToIndexedDB();
  }

  /**
   * Dump all table rows as a clean JSON representation for backup and inspectability.
   */
  async dumpAllJson(): Promise<Record<string, any[]>> {
    const tables = [
      'people',
      'obligations',
      'money_transactions',
      'payments',
      'items',
      'commitments',
      'settlements',
      'reminders',
      'activities',
      'settings',
    ];

    const dump: Record<string, any[]> = {};
    for (const table of tables) {
      dump[table] = await this.query(`SELECT * FROM ${table}`);
    }
    return dump;
  }

  /**
   * Restore all tables from a JSON dump.
   */
  async restoreAllJson(dump: Record<string, any[]>): Promise<void> {
    const db = await this.ensureInitialized();
    await this.executeTransaction(async () => {
      // Clear existing records in reverse dependency order
      const tables = [
        'activities',
        'reminders',
        'settlements',
        'commitments',
        'items',
        'payments',
        'money_transactions',
        'obligations',
        'people',
        'settings',
      ];
      for (const table of tables) {
        db.run(`DELETE FROM ${table};`);
      }

      // Insert restored data
      for (const [table, rows] of Object.entries(dump)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        for (const row of rows) {
          const keys = Object.keys(row);
          const placeholders = keys.map(() => '?').join(',');
          const values = keys.map((k) => row[k]);
          db.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders});`, values);
        }
      }
    });
  }

  // --- IndexedDB Persistence Helpers ---

  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const idb = request.result;
        if (!idb.objectStoreNames.contains(IDB_STORE)) {
          idb.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async loadFromIndexedDB(): Promise<Uint8Array | null> {
    if (typeof indexedDB === 'undefined') return null;
    try {
      const idb = await this.openIndexedDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  private async saveToIndexedDB(): Promise<void> {
    if (!this.db || typeof indexedDB === 'undefined') return;
    try {
      const data = this.db.export();
      const idb = await this.openIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(data, IDB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Could not persist to IndexedDB:', e);
    }
  }
}
