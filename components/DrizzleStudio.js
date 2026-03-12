import { useEffect } from "react";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import * as SQLite from "expo-sqlite";

const DB_NAME = "mall_v4.db";

const SCHEMA_SQL = `
  DROP TABLE IF EXISTS client_transactions;
  DROP TABLE IF EXISTS clients;
  DROP TABLE IF EXISTS general;
  DROP TABLE IF EXISTS workers;
  DROP TABLE IF EXISTS suppliers;
  DROP TABLE IF EXISTS settings;
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    project TEXT,
    status TEXT DEFAULT 'active',
    note TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS client_transactions (
    id INTEGER PRIMARY KEY NOT NULL,
    client_id INTEGER NOT NULL,
    type TEXT,
    amount REAL NOT NULL,
    cat TEXT,
    note TEXT,
    date TEXT,
    worker_id INTEGER,
    supplier_id INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS general (
    id INTEGER PRIMARY KEY NOT NULL,
    amount REAL NOT NULL,
    cat TEXT,
    note TEXT,
    date TEXT
  );
  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    category TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
`;

// Same DB name as utils/db.js so we open the same file.
let db = null;
function getDb() {
  if (!db) db = SQLite.openDatabaseSync(DB_NAME);
  return db;
}

/**
 * Registers the app's SQLite database with Drizzle Studio so the dev plugin can show data.
 * Ensures schema exists so Studio always sees tables (even if app hasn't loaded data yet).
 */
export default function DrizzleStudio() {
  const database = getDb();
  useDrizzleStudio(database);

  useEffect(() => {
    database.execAsync(SCHEMA_SQL).catch((e) => {
      console.warn("DrizzleStudio schema init:", e?.message);
    });
  }, [database]);

  return null;
}
