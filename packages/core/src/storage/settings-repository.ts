import type Database from "better-sqlite3";
import type { SettingsRepository } from "../ports/index.js";
import { type Setting, SettingSchema } from "../domain/models.js";

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get(key: string): string | null {
    if (!key || key.trim().length === 0) return null;
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key.trim()) as { value: string } | undefined;
    return row ? row.value : null;
  }

  getWithMetadata(key: string): Setting | null {
    if (!key || key.trim().length === 0) return null;
    const row = this.db.prepare("SELECT key, value, updated_at as updatedAt FROM app_settings WHERE key = ?").get(key.trim()) as {
      key: string;
      value: string;
      updatedAt?: string;
    } | undefined;
    return row ? SettingSchema.parse(row) : null;
  }

  set(key: string, value: string): void {
    const trimmedKey = (key || "").trim();
    if (trimmedKey.length === 0) {
      throw new Error("Setting key cannot be empty");
    }
    const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(trimmedKey, value);
  }

  delete(key: string): boolean {
    const result = this.db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
    return result.changes > 0;
  }

  list(): Record<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM app_settings ORDER BY key ASC").all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  getAll(): Setting[] {
    const rows = this.db.prepare("SELECT key, value, updated_at as updatedAt FROM app_settings ORDER BY key ASC").all() as Array<{
      key: string;
      value: string;
      updatedAt?: string;
    }>;
    return rows.map((r) => SettingSchema.parse(r));
  }
}