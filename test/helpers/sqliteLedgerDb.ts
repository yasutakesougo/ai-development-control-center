import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
} from "../../src/worker/ledger/ledgerStore";

/**
 * Test double for the legacy staging Approval Ledger only.
 * Record != Authority: AC7 production Authority stores are tested separately.
 */
class SqlitePreparedStatement implements D1PreparedStatementLike {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    return new SqlitePreparedStatement(this.db, this.sql, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row ?? null) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows as T[] };
  }

  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...(this.params as never[]));
  }
}

export interface SqliteLedgerTestDb extends D1DatabaseLike {
  raw: DatabaseSync;
}

export function createLedgerTestDb(): SqliteLedgerTestDb {
  const db = new DatabaseSync(":memory:");
  const migration = readFileSync(
    fileURLToPath(new URL("../../migrations/0001_approval_ledger.sql", import.meta.url)),
    "utf8",
  );
  db.exec(migration);

  return {
    raw: db,
    prepare(query: string): D1PreparedStatementLike {
      return new SqlitePreparedStatement(db, query);
    },
  };
}
