import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import * as SQLite from "expo-sqlite";

const DB_NAME = "mall_v4.db";

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

  return null;
}
