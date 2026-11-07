// A synthetic Hermes store on disk, read through the real script: the columns Chat names, the way
// Hermes's own schema types them, and text no conversation ever held.

import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatHostFiles } from '../model/host-files';
import { storeQueryRunner } from '../store/host-query';
import type { StoreScriptOptions } from '../store/query';

export const SESSION = 'local-0a1b2c3d';

const SCHEMA = `
CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_session_id TEXT, title TEXT, display_name TEXT,
  model TEXT, transcript_revision INTEGER NOT NULL DEFAULT 0, end_reason TEXT,
  source TEXT, model_config TEXT);
CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT, tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL,
  finish_reason TEXT, reasoning TEXT, reasoning_content TEXT,
  _compressed_summary INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  compacted INTEGER NOT NULL DEFAULT 0, display_kind TEXT, display_metadata TEXT,
  display_order INTEGER, message_uid TEXT);
`;

export const hasSqlite3 = (): boolean => spawnSync('sqlite3', ['-version']).status === 0;

/** A SQL literal for `text`. */
export const quoted = (text: string | null): string =>
  text === null ? 'NULL' : `'${text.replaceAll("'", "''")}'`;

/** The way Hermes stores content made of parts: its NUL prefix, then JSON. */
export function partsLiteral(parts: unknown): string {
  const bytes = Buffer.concat([Buffer.from('\0json:'), Buffer.from(JSON.stringify(parts))]);
  return `CAST(X'${bytes.toString('hex')}' AS TEXT)`;
}

export interface MessageFields {
  role: string;
  /** A SQL expression. */
  content?: string;
  toolCallID?: string;
  toolCalls?: unknown;
  toolName?: string;
  timestamp?: number;
  finishReason?: string;
  reasoning?: string;
  summary?: boolean;
  active?: boolean;
  compacted?: boolean;
  displayKind?: string;
  displayMetadata?: unknown;
  displayOrder?: number;
  uid?: string;
}

export function insertMessage(fields: MessageFields, session = SESSION): string {
  const values = [
    quoted(session),
    quoted(fields.role),
    fields.content ?? 'NULL',
    quoted(fields.toolCallID ?? null),
    fields.toolCalls === undefined ? 'NULL' : quoted(JSON.stringify(fields.toolCalls)),
    quoted(fields.toolName ?? null),
    String(fields.timestamp ?? 1_800_000_000.5),
    quoted(fields.finishReason ?? null),
    quoted(fields.reasoning ?? null),
    fields.summary ? '1' : '0',
    fields.active === false ? '0' : '1',
    fields.compacted ? '1' : '0',
    quoted(fields.displayKind ?? null),
    fields.displayMetadata === undefined ? 'NULL' : quoted(JSON.stringify(fields.displayMetadata)),
    fields.displayOrder === undefined ? 'NULL' : String(fields.displayOrder),
    quoted(fields.uid ?? null),
  ];
  return `INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, tool_name,
    timestamp, finish_reason, reasoning, _compressed_summary, active, compacted, display_kind,
    display_metadata, display_order, message_uid) VALUES (${values.join(', ')});`;
}

/** A temporary home whose `~/.hermes/state.db` Chat reads as a Host would. */
export class HermesHome {
  readonly home = mkdtempSync(join(tmpdir(), 'hermes-store-'));
  readonly directory = join(this.home, '.hermes');
  readonly database = join(this.directory, 'state.db');

  /** A Hermes still running on a profile's store, so its side files stay. */
  private holder: ChildProcess | null = null;

  /** Null leaves the folder empty. */
  constructor(sql: string | null = '') {
    mkdirSync(this.directory);
    if (sql === null) return;
    this.run(`${SCHEMA}
      INSERT INTO sessions (id, title) VALUES (${quoted(SESSION)}, 'Synthetic title');
      ${sql}`);
  }

  run(sql: string, database = this.database): void {
    execFileSync('sqlite3', [database], { input: sql });
  }

  /** Moves the session to a profile's WAL store, held open as a running Hermes holds it. */
  async moveToOpenProfile(name: string, sql: string): Promise<void> {
    const directory = join(this.directory, 'profiles', name);
    mkdirSync(directory, { recursive: true });
    const database = join(directory, 'state.db');
    this.run(
      `PRAGMA journal_mode = WAL;
      ${SCHEMA}
      INSERT INTO sessions (id, title) VALUES (${quoted(SESSION)}, 'Profile title');
      ${sql}`,
      database,
    );
    rmSync(this.database);
    const holder = spawn('sqlite3', [database], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.holder = holder;
    holder.stdin.write('BEGIN IMMEDIATE; COMMIT; SELECT 1;\n');
    await once(holder.stdout, 'data');
  }

  /** The port an app gives Chat, its scripts run by `sh` with this home. */
  files(options: StoreScriptOptions = {}): ChatHostFiles {
    const refuse = async () => {
      throw new Error('a store read touches no file');
    };
    const query = storeQueryRunner(async (script) => {
      const result = spawnSync('sh', [], {
        input: script,
        env: { PATH: process.env.PATH, HOME: this.home },
      });
      return { stdout: result.stdout, stderr: result.stderr, exitStatus: result.status ?? -1 };
    }, options);
    return { status: refuse, list: refuse, read: refuse, home: refuse, queryStore: query };
  }

  remove(): void {
    this.holder?.kill();
    rmSync(this.home, { recursive: true, force: true });
  }
}
