import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
} from "../../src/worker/ledger/ledgerStore";

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
    return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
  }

  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...(this.params as never[]));
  }
}

export interface SqliteAuthorityDb extends D1DatabaseLike {
  raw: DatabaseSync;
}

function createDb(relativeMigrationUrl: string): SqliteAuthorityDb {
  const db = new DatabaseSync(":memory:");
  const migration = readFileSync(
    fileURLToPath(new URL(relativeMigrationUrl, import.meta.url)),
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

export function createApprovalAuthorityTestDb(): SqliteAuthorityDb {
  return createDb(
    "../../infrastructure/authority-recorder/migrations/0001_authority_approval.sql",
  );
}

export function createReceiptConsumptionTestDb(): SqliteAuthorityDb {
  return createDb(
    "../../infrastructure/authority-execution-enforcer/migrations/0001_receipt_consumption.sql",
  );
}
