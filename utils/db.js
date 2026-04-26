import { Platform } from "react-native";
import { getCurrentFiscalYear } from "../utils/helpers";

const IS_WEB = Platform.OS === "web";
const DB_NAME = "mall_v4.db";
const WEB_STORAGE_KEY = "mall_v4";

// Web: read full state from AsyncStorage (same shape as getFullState)
async function getWebState() {
  if (!IS_WEB) return null;
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const raw = await AsyncStorage.getItem(WEB_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      clients: data.clients || [],
      generalTxs: data.generalTxs || [],
      workers: data.workers || [],
      suppliers: data.suppliers || [],
      activeFY: data.activeFY || null,
      activeFiscalYearId:
        data.activeFiscalYearId != null ? Number(data.activeFiscalYearId) : null,
      customFYs: data.customFYs || [],
      nissabPrice: data.nissabPrice != null ? Number(data.nissabPrice) : 85000,
    };
  } catch (e) {
    return null;
  }
}

async function setWebState(data) {
  if (!IS_WEB) return;
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    await AsyncStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("setWebState error:", e?.message);
  }
}

let dbQueue = Promise.resolve();
let rawDb = null;

/** Open DB once (with retries). Called only from runDb. */
async function openDb() {
  if (rawDb) return rawDb;
  const SQLite = require("expo-sqlite");
  const connection = await SQLite.openDatabaseAsync(DB_NAME);
  await connection.execAsync("PRAGMA busy_timeout = 30000; PRAGMA journal_mode = WAL;");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await initSchema(connection);
      break;
    } catch (e) {
      const isLocked =
        e?.message?.includes("database is locked") ||
        (e?.message?.includes("has been rejected") && e?.message?.includes("execAsync"));
      if (isLocked && attempt < 4) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      } else {
        throw e;
      }
    }
  }
  rawDb = connection;
  return rawDb;
}

/**
 * Run a single DB job. Only one job runs at a time — no interleaving.
 * Use this for all native DB access. Pass a callback that receives the raw database.
 * On Android, Fast Refresh / native NPE can invalidate the cached connection; we drop it and retry once.
 */
async function runDb(fn) {
  const work = dbQueue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const database = await openDb();
        return await fn(database);
      } catch (e) {
        if (isNativeDbInvalidError(e)) {
          rawDb = null;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
        }
        clearDbOnError(e);
        throw e;
      }
    }
  });
  dbQueue = work.catch(() => {});
  return work;
}

/** Clear DB handle on lock/invalid so next runDb reopens. */
function clearDbOnError(e) {
  if (isNativeDbInvalidError(e)) {
    rawDb = null;
  }
}

function isNativeDbInvalidError(e) {
  const msg = e?.message ?? "";
  return (
    msg.includes("Native module is null") ||
    msg.includes("NullPointerException") ||
    msg.includes("prepareAsync") ||
    msg.includes("finalizeAsync") ||
    msg.includes("has been rejected") ||
    msg.includes("database is locked")
  );
}


function mapGeneralRow(r) {
  const kind = r.tx_kind === "income" ? "income" : "expense";
  return {
    id: r.id,
    amount: r.amount,
    cat: r.cat,
    note: r.note || "",
    date: r.date,
    fiscalYearId: r.fiscal_year_id != null ? r.fiscal_year_id : null,
    txKind: kind,
  };
}

async function migrateGeneralTxKind(database) {
  try {
    const cols = await database.getAllAsync("PRAGMA table_info(general)");
    const names = new Set((cols || []).map((c) => c.name));
    if (!names.has("tx_kind")) {
      await database.execAsync("ALTER TABLE general ADD COLUMN tx_kind TEXT DEFAULT 'expense'");
    }
    await database.runAsync("UPDATE general SET tx_kind = 'expense' WHERE tx_kind IS NULL OR tx_kind = ''");
  } catch (e) {
    console.warn("migrateGeneralTxKind:", e?.message || e);
  }
}

async function initSchema(database) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      project TEXT,
      status TEXT DEFAULT 'active',
      note TEXT,
      created_at TEXT,
      fiscal_year_id INTEGER REFERENCES fiscal_years(id)
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
      date TEXT,
      fiscal_year_id INTEGER REFERENCES fiscal_years(id),
      tx_kind TEXT DEFAULT 'expense'
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
    CREATE TABLE IF NOT EXISTS fiscal_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 0
    );
  `);
  await migrateGeneralTxKind(database);
}

/** Get the active fiscal year label from fiscal_years table. On web uses AsyncStorage activeFY. If none set, returns current FY and ensures a row exists. */
async function getActiveFiscalYearWithDb(database) {
  const rows = await database.getAllAsync("SELECT label FROM fiscal_years WHERE is_active = 1 LIMIT 1");
  if (rows.length > 0) return rows[0].label;
  const current = getCurrentFiscalYear();
  await database.runAsync("INSERT OR IGNORE INTO fiscal_years (label, is_active) VALUES (?, 1)", current);
  await database.runAsync("UPDATE fiscal_years SET is_active = 1 WHERE label = ?", current);
  return current;
}

async function getFiscalYearsWithDb(database) {
  const current = getCurrentFiscalYear();
  await database.runAsync("INSERT OR IGNORE INTO fiscal_years (label, is_active) VALUES (?, 0)", current);
  const rows = await database.getAllAsync(
    "SELECT id, label, is_active FROM fiscal_years ORDER BY label DESC"
  );
  return rows.map((r) => ({ id: r.id, label: r.label, isActive: r.is_active === 1 }));
}

async function getActiveFiscalYearIdWithDb(database) {
  const row = await database.getFirstAsync("SELECT id FROM fiscal_years WHERE is_active = 1 LIMIT 1");
  return row?.id ?? null;
}

export async function getActiveFiscalYear() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return (state && state.activeFY) ? state.activeFY : getCurrentFiscalYear();
    }
    return await runDb(getActiveFiscalYearWithDb);
  } catch (e) {
    console.warn("DB getActiveFiscalYear error:", e?.message || e);
    return getCurrentFiscalYear();
  }
}

/** @returns {Promise<Array<{ id: number, label: string, isActive: boolean }>>} */
export async function getFiscalYears() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const id = state && state.activeFiscalYearId != null ? Number(state.activeFiscalYearId) : 1;
      const label = (state && state.activeFY) ? state.activeFY : getCurrentFiscalYear();
      return [{ id, label, isActive: true }];
    }
    return await runDb(getFiscalYearsWithDb);
  } catch (e) {
    console.warn("DB getFiscalYears error:", e?.message || e);
    return [];
  }
}

export async function setActiveFiscalYearById(fiscalYearId, labelForWeb = null) {
  if (fiscalYearId == null || fiscalYearId === "") return;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (state) {
        await setWebState({
          ...state,
          activeFiscalYearId: Number(fiscalYearId),
          ...(labelForWeb != null ? { activeFY: labelForWeb } : {}),
        });
      }
      return;
    }
    await runDb(async (database) => {
      await database.runAsync("UPDATE fiscal_years SET is_active = 0");
      await database.runAsync("UPDATE fiscal_years SET is_active = 1 WHERE id = ?", fiscalYearId);
    });
  } catch (e) {
    console.warn("DB setActiveFiscalYearById error:", e?.message || e);
  }
}

/** @returns {Promise<number | null>} row id */
export async function ensureFiscalYearLabel(label) {
  try {
    if (IS_WEB) {
      return 1;
    }
    return await runDb(async (database) => {
      await database.runAsync("INSERT OR IGNORE INTO fiscal_years (label, is_active) VALUES (?, 0)", label);
      const row = await database.getFirstAsync("SELECT id FROM fiscal_years WHERE label = ?", label);
      return row?.id ?? null;
    });
  } catch (e) {
    console.warn("DB ensureFiscalYearLabel error:", e?.message || e);
    return null;
  }
}

export async function getFiscalYearRowById(id) {
  try {
    if (IS_WEB) return null;
    return await runDb(async (database) => {
      const row = await database.getFirstAsync("SELECT id, label FROM fiscal_years WHERE id = ?", id);
      return row ? { id: row.id, label: row.label } : null;
    });
  } catch (e) {
    console.warn("DB getFiscalYearRowById error:", e?.message || e);
    return null;
  }
}

export async function getCurrentFiscalYearId() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return state && state.activeFiscalYearId != null ? Number(state.activeFiscalYearId) : null;
    }
    return await runDb(async (database) => {
      const label = getCurrentFiscalYear();
      await database.runAsync("INSERT OR IGNORE INTO fiscal_years (label, is_active) VALUES (?, 0)", label);
      const row = await database.getFirstAsync("SELECT id FROM fiscal_years WHERE label = ?", label);
      return row?.id ?? null;
    });
  } catch (e) {
    console.warn("DB getCurrentFiscalYearId error:", e?.message || e);
    return null;
  }
}

/** @returns {Promise<number | null>} new or existing row id */
export async function addFiscalYearLabel(label) {
  try {
    return await ensureFiscalYearLabel(label);
  } catch (e) {
    console.warn("DB addFiscalYearLabel error:", e?.message || e);
    return null;
  }
}

export async function removeFiscalYearById(fiscalYearId) {
  try {
    if (IS_WEB) return;
    await runDb((database) =>
      database.runAsync("DELETE FROM fiscal_years WHERE id = ? AND is_active = 0", fiscalYearId)
    );
  } catch (e) {
    console.warn("DB removeFiscalYearById error:", e?.message || e);
  }
}

export async function getActiveFiscalYearId() {
  try {
    if (IS_WEB) return null;
    return await runDb(getActiveFiscalYearIdWithDb);
  } catch (e) {
    console.warn("DB getActiveFiscalYearId error:", e?.message || e);
    return null;
  }
}

function rowToClient(c, txRows) {
  return {
    id: c.id,
    name: c.name,
    project: c.project || "",
    status: c.status || "active",
    note: c.note || "",
    fiscalYearId: c.fiscal_year_id != null ? c.fiscal_year_id : null,
    createdAt: c.created_at || "",
    txs: (txRows || [])
      .filter((t) => t.client_id === c.id)
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        cat: t.cat,
        note: t.note || "",
        date: t.date,
        ...(t.worker_id != null && { workerId: t.worker_id }),
        ...(t.supplier_id != null && { supplierId: t.supplier_id }),
      })),
  };
}

/**
 * Load full app state from SQLite (for initial load and resync). Returns same shape as before.
 * On web, reads from AsyncStorage.
 */
export async function getFullState() {
  try {
    if (IS_WEB) return getWebState();
    return await runDb(async (database) => {
      const clientsRows = await database.getAllAsync(
        "SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients ORDER BY id DESC"
      );
      const txRows = await database.getAllAsync(
        "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions ORDER BY client_id, id"
      );
      const generalRows = await database.getAllAsync(
        "SELECT id, amount, cat, note, date, fiscal_year_id, tx_kind FROM general ORDER BY id"
      );
      const workersRows = await database.getAllAsync("SELECT id, name, phone FROM workers ORDER BY id");
      const suppliersRows = await database.getAllAsync("SELECT id, name, phone, category FROM suppliers ORDER BY id");
      const settingsRows = await database.getAllAsync("SELECT key, value FROM settings");

      const settings = {};
      for (const row of settingsRows) {
        settings[row.key] = row.value;
      }

      const hasData =
        clientsRows.length > 0 ||
        generalRows.length > 0 ||
        workersRows.length > 0 ||
        suppliersRows.length > 0 ||
        settingsRows.length > 0;
      if (!hasData) return null;

      const [activeFY, fyRows] = await Promise.all([getActiveFiscalYearWithDb(database), getFiscalYearsWithDb(database)]);
      const clients = clientsRows.map((c) => rowToClient(c, txRows));
      const generalTxs = generalRows.map((r) => mapGeneralRow(r));
      const workers = workersRows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone || "",
      }));
      const suppliers = suppliersRows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone || "",
        category: r.category || "",
      }));
      const nissabPrice = settings.nissabPrice != null ? Number(settings.nissabPrice) : 85000;

      return {
        clients,
        generalTxs,
        workers,
        suppliers,
        activeFY: activeFY || null,
        customFYs: Array.isArray(fyRows) ? fyRows.map((r) => r.label) : [],
        nissabPrice,
      };
    });
  } catch (e) {
    console.warn("DB getFullState error:", e?.message || e);
    clearDbOnError(e);
    return null;
  }
}

// ---------- Targeted getters (fetch only what you need) ----------

/** Get all clients for the active fiscal year (is_active = 1), with their txs. Returns [] on error. On web reads from AsyncStorage. */
export async function getClients() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return state ? state.clients : [];
    }
    return await runDb(async (database) => {
      const fyId = await getActiveFiscalYearIdWithDb(database);
      const sql =
        fyId != null
          ? "SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients WHERE fiscal_year_id = ? ORDER BY id DESC"
          : "SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients ORDER BY id DESC";
      const clientsRows =
        fyId != null
          ? await database.getAllAsync(sql, fyId)
          : await database.getAllAsync(sql);
      const txRows = await database.getAllAsync(
        "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions ORDER BY client_id, id"
      );
      return clientsRows.map((c) => rowToClient(c, txRows));
    });
  } catch (e) {
    console.warn("DB getClients error:", e?.message || e);
    clearDbOnError(e);
    return [];
  }
}

const CLIENTS_PAGE_DEFAULT = 5;

/**
 * Paginated clients (same fiscal filter as getClients), with txs only for returned rows.
 * Requests `limit + 1` rows internally to set `hasMore` without a separate COUNT.
 * @param {number} [limit=5] — page size (capped 1–50)
 * @param {number} [offset=0]
 * @param {{ nameContains?: string }} [options] — optional case-insensitive substring match on `name`
 * @returns {Promise<{ clients: [], hasMore: boolean }>}
 */
export async function getClientsPage(limit = CLIENTS_PAGE_DEFAULT, offset = 0, options = {}) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || CLIENTS_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const take = lim + 1;
  const nameQ =
    typeof options.nameContains === "string" ? String(options.nameContains).trim() : "";
  const useNameFilter = nameQ.length > 0;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let all = state ? [...(state.clients || [])] : [];
      if (useNameFilter) {
        const low = nameQ.toLowerCase();
        all = all.filter((c) => (c.name || "").toLowerCase().includes(low));
      }
      all.sort((a, b) => Number(b.id) - Number(a.id));
      const slice = all.slice(off, off + take);
      const hasMore = slice.length > lim;
      const rows = hasMore ? slice.slice(0, lim) : slice;
      const clients = rows.map((c) => ({
        ...c,
        txs: Array.isArray(c.txs) ? c.txs : [],
      }));
      return { clients, hasMore };
    }
    return await runDb(async (database) => {
      const fyId = await getActiveFiscalYearIdWithDb(database);
      const nameClause = useNameFilter ? " AND instr(lower(name), lower(?)) > 0" : "";
      let sqlBase;
      let baseParams;
      if (fyId != null) {
        sqlBase = `SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients WHERE fiscal_year_id = ?${nameClause} ORDER BY id DESC`;
        baseParams = useNameFilter ? [fyId, nameQ] : [fyId];
      } else {
        sqlBase = useNameFilter
          ? `SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients WHERE instr(lower(name), lower(?)) > 0 ORDER BY id DESC`
          : "SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients ORDER BY id DESC";
        baseParams = useNameFilter ? [nameQ] : [];
      }
      const clientsRows = await database.getAllAsync(
        `${sqlBase} LIMIT ? OFFSET ?`,
        ...baseParams,
        take,
        off
      );
      const hasMore = clientsRows.length > lim;
      const pageRows = hasMore ? clientsRows.slice(0, lim) : clientsRows;
      const ids = pageRows.map((c) => c.id);
      let txRows = [];
      if (ids.length > 0) {
        const ph = ids.map(() => "?").join(",");
        txRows = await database.getAllAsync(
          `SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions WHERE client_id IN (${ph}) ORDER BY client_id, id`,
          ...ids
        );
      }
      const clients = pageRows.map((c) => rowToClient(c, txRows));
      return { clients, hasMore };
    });
  } catch (e) {
    console.warn("DB getClientsPage error:", e?.message || e);
    clearDbOnError(e);
    return { clients: [], hasMore: false };
  }
}

/** Get one client with txs by id. Returns null if not found or error. On web reads from AsyncStorage. */
export async function getClientWithTxs(clientId) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return null;
      const c = state.clients.find((x) => String(x.id) === String(clientId));
      return c || null;
    }
    return await runDb(async (database) => {
      const clientRows = await database.getAllAsync(
        "SELECT id, name, project, status, note, created_at, fiscal_year_id FROM clients WHERE id = ?",
        clientId
      );
      if (clientRows.length === 0) return null;
      const txRows = await database.getAllAsync(
        "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions WHERE client_id = ? ORDER BY id",
        clientId
      );
      return rowToClient(clientRows[0], txRows);
    });
  } catch (e) {
    console.warn("DB getClientWithTxs error:", e?.message || e);
    clearDbOnError(e);
    return null;
  }
}

/**
 * All general ledger rows (expense + income) for optional fiscal year filter.
 * Each item has `txKind`: 'expense' | 'income'.
 */
export async function getGeneralTxs(fiscalYearId = null) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let list = state ? state.generalTxs : [];
      list = (list || []).map((t) => ({
        ...t,
        txKind: t.txKind === "income" ? "income" : "expense",
      }));
      if (fiscalYearId != null && fiscalYearId !== "") {
        const fyId = Number(fiscalYearId);
        list = list.filter((t) => Number(t.fiscalYearId) === fyId);
      }
      return list;
    }
    return await runDb(async (database) => {
      let sql = "SELECT id, amount, cat, note, date, fiscal_year_id, tx_kind FROM general";
      const params = [];
      if (fiscalYearId != null && fiscalYearId !== "") {
        sql += " WHERE fiscal_year_id = ?";
        params.push(fiscalYearId);
      }
      sql += " ORDER BY id";
      const rows = params.length
        ? await database.getAllAsync(sql, ...params)
        : await database.getAllAsync(sql);
      return rows.map((r) => mapGeneralRow(r));
    });
  } catch (e) {
    console.warn("DB getGeneralTxs error:", e?.message || e);
    clearDbOnError(e);
    return [];
  }
}

const GENERAL_INCOME_PAGE_DEFAULT = 5;

/**
 * Paginated general-ledger income rows for a fiscal year (`tx_kind = 'income'`).
 * @returns {Promise<{ txs: Array<object>, hasMore: boolean }>}
 */
export async function getGeneralIncomeTxsPage(fiscalYearId, limit = GENERAL_INCOME_PAGE_DEFAULT, offset = 0) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || GENERAL_INCOME_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const take = lim + 1;
  if (fiscalYearId == null || fiscalYearId === "") {
    return { txs: [], hasMore: false };
  }
  const fy = Number(fiscalYearId);
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let list = (state?.generalTxs || []).map((t) => ({
        ...t,
        txKind: t.txKind === "income" ? "income" : "expense",
      }));
      list = list.filter((t) => Number(t.fiscalYearId) === fy && t.txKind === "income");
      list.sort((a, b) => {
        const c = String(b.date || "").localeCompare(String(a.date || ""));
        if (c !== 0) return c;
        return Number(b.id) - Number(a.id);
      });
      const slice = list.slice(off, off + take);
      const hasMore = slice.length > lim;
      const rows = hasMore ? slice.slice(0, lim) : slice;
      return { txs: rows, hasMore };
    }
    return await runDb(async (database) => {
      const sql =
        "SELECT id, amount, cat, note, date, fiscal_year_id, tx_kind FROM general WHERE fiscal_year_id = ? AND tx_kind = 'income' ORDER BY date DESC, id DESC LIMIT ? OFFSET ?";
      const rows = await database.getAllAsync(sql, fy, take, off);
      const hasMore = rows.length > lim;
      const pageRows = hasMore ? rows.slice(0, lim) : rows;
      return { txs: pageRows.map((r) => mapGeneralRow(r)), hasMore };
    });
  } catch (e) {
    console.warn("DB getGeneralIncomeTxsPage error:", e?.message || e);
    clearDbOnError(e);
    return { txs: [], hasMore: false };
  }
}

/** Sum of all general income amounts for the fiscal year (for header total). */
export async function getGeneralIncomeTotalAmount(fiscalYearId) {
  if (fiscalYearId == null || fiscalYearId === "") return 0;
  const fy = Number(fiscalYearId);
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const list = (state?.generalTxs || []).map((t) => ({
        ...t,
        txKind: t.txKind === "income" ? "income" : "expense",
      }));
      return list
        .filter((t) => Number(t.fiscalYearId) === fy && t.txKind === "income")
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    }
    return await runDb(async (database) => {
      const row = await database.getFirstAsync(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM general WHERE fiscal_year_id = ? AND tx_kind = 'income'",
        fy
      );
      return Number(row?.s) || 0;
    });
  } catch (e) {
    console.warn("DB getGeneralIncomeTotalAmount error:", e?.message || e);
    clearDbOnError(e);
    return 0;
  }
}

/** @param {string|null|undefined} d */
function _ymdExpenseDate(d) {
  if (d == null) return null;
  const s = String(d).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/**
 * Paginated general-ledger expense rows (same filter as General screen: not income).
 * @param {string|null|undefined} catFilter Exact category label; omit or null for all categories.
 * @param {string|null|undefined} dateFrom Inclusive YYYY-MM-DD.
 * @param {string|null|undefined} dateTo Inclusive YYYY-MM-DD.
 * @returns {Promise<{ txs: Array<object>, hasMore: boolean }>}
 */
export async function getGeneralExpenseTxsPage(
  fiscalYearId,
  limit = GENERAL_INCOME_PAGE_DEFAULT,
  offset = 0,
  catFilter = null,
  dateFrom = null,
  dateTo = null
) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || GENERAL_INCOME_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const take = lim + 1;
  if (fiscalYearId == null || fiscalYearId === "") {
    return { txs: [], hasMore: false };
  }
  const fy = Number(fiscalYearId);
  const expenseClause = "IFNULL(tx_kind, 'expense') != 'income'";
  const cat =
    catFilter != null && String(catFilter).trim() !== "" ? String(catFilter).trim() : null;
  const df = _ymdExpenseDate(dateFrom);
  const dt = _ymdExpenseDate(dateTo);
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let list = (state?.generalTxs || []).map((t) => ({
        ...t,
        txKind: t.txKind === "income" ? "income" : "expense",
      }));
      list = list.filter((t) => Number(t.fiscalYearId) === fy && t.txKind !== "income");
      if (cat != null) {
        list = list.filter((t) => String(t.cat || "") === cat);
      }
      if (df != null) {
        list = list.filter((t) => String(t.date || "") >= df);
      }
      if (dt != null) {
        list = list.filter((t) => String(t.date || "") <= dt);
      }
      list.sort((a, b) => {
        const c = String(b.date || "").localeCompare(String(a.date || ""));
        if (c !== 0) return c;
        return Number(b.id) - Number(a.id);
      });
      const slice = list.slice(off, off + take);
      const hasMore = slice.length > lim;
      const rows = hasMore ? slice.slice(0, lim) : slice;
      return { txs: rows, hasMore };
    }
    return await runDb(async (database) => {
      const whereParts = [`fiscal_year_id = ?`, expenseClause];
      const params = [fy];
      if (cat != null) {
        whereParts.push("cat = ?");
        params.push(cat);
      }
      if (df != null) {
        whereParts.push("date >= ?");
        params.push(df);
      }
      if (dt != null) {
        whereParts.push("date <= ?");
        params.push(dt);
      }
      const whereSql = whereParts.join(" AND ");
      const sql = `SELECT id, amount, cat, note, date, fiscal_year_id, tx_kind FROM general WHERE ${whereSql} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`;
      params.push(take, off);
      const rows = await database.getAllAsync(sql, ...params);
      const hasMore = rows.length > lim;
      const pageRows = hasMore ? rows.slice(0, lim) : rows;
      return { txs: pageRows.map((r) => mapGeneralRow(r)), hasMore };
    });
  } catch (e) {
    console.warn("DB getGeneralExpenseTxsPage error:", e?.message || e);
    clearDbOnError(e);
    return { txs: [], hasMore: false };
  }
}

/**
 * Per-category sum of general expenses for the fiscal year (stats cards).
 * @param {{ dateFrom?: string|null, dateTo?: string|null }} [range] Optional inclusive YYYY-MM-DD bounds.
 */
export async function getGeneralExpenseCategoryTotals(fiscalYearId, range = null) {
  if (fiscalYearId == null || fiscalYearId === "") return {};
  const fy = Number(fiscalYearId);
  const expenseClause = "IFNULL(tx_kind, 'expense') != 'income'";
  const df = range != null ? _ymdExpenseDate(range.dateFrom) : null;
  const dt = range != null ? _ymdExpenseDate(range.dateTo) : null;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const list = (state?.generalTxs || []).map((t) => ({
        ...t,
        txKind: t.txKind === "income" ? "income" : "expense",
      }));
      const out = {};
      for (const t of list) {
        if (Number(t.fiscalYearId) !== fy || t.txKind === "income") continue;
        const d = String(t.date || "");
        if (df != null && d < df) continue;
        if (dt != null && d > dt) continue;
        const c = t.cat != null ? String(t.cat) : "";
        out[c] = (out[c] || 0) + (Number(t.amount) || 0);
      }
      return out;
    }
    return await runDb(async (database) => {
      const whereParts = [`fiscal_year_id = ?`, expenseClause];
      const params = [fy];
      if (df != null) {
        whereParts.push("date >= ?");
        params.push(df);
      }
      if (dt != null) {
        whereParts.push("date <= ?");
        params.push(dt);
      }
      const whereSql = whereParts.join(" AND ");
      const rows = await database.getAllAsync(
        `SELECT cat, COALESCE(SUM(amount), 0) AS s FROM general WHERE ${whereSql} GROUP BY cat`,
        ...params
      );
      const out = {};
      for (const r of rows || []) {
        const c = r.cat != null ? String(r.cat) : "";
        out[c] = Number(r.s) || 0;
      }
      return out;
    });
  } catch (e) {
    console.warn("DB getGeneralExpenseCategoryTotals error:", e?.message || e);
    clearDbOnError(e);
    return {};
  }
}

/** Get all workers. Returns [] on error. On web reads from AsyncStorage. */
export async function getWorkers() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return state ? state.workers : [];
    }
    return await runDb(async (database) => {
      const rows = await database.getAllAsync("SELECT id, name, phone FROM workers ORDER BY id");
      return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone || "" }));
    });
  } catch (e) {
    console.warn("DB getWorkers error:", e?.message || e);
    clearDbOnError(e);
    return [];
  }
}

/** Get all suppliers. Returns [] on error. On web reads from AsyncStorage. */
export async function getSuppliers() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return state ? state.suppliers : [];
    }
    return await runDb(async (database) => {
      const rows = await database.getAllAsync("SELECT id, name, phone, category FROM suppliers ORDER BY id");
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone || "",
        category: r.category || "",
      }));
    });
  } catch (e) {
    console.warn("DB getSuppliers error:", e?.message || e);
    clearDbOnError(e);
    return [];
  }
}

const SUPPLIERS_PAGE_DEFAULT = 5;

function mapSupplierRow(r) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone || "",
    category: r.category || "",
  };
}

/**
 * Paginated suppliers, newest first (`ORDER BY id DESC`).
 * @param {{ nameContains?: string }} [options] — optional case-insensitive substring match on `name`
 * @returns {Promise<{ suppliers: Array<object>, hasMore: boolean }>}
 */
export async function getSuppliersPage(limit = SUPPLIERS_PAGE_DEFAULT, offset = 0, options = {}) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || SUPPLIERS_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const take = lim + 1;
  const nameQ =
    typeof options.nameContains === "string" ? String(options.nameContains).trim() : "";
  const useNameFilter = nameQ.length > 0;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let all = [...(state?.suppliers || [])];
      if (useNameFilter) {
        const low = nameQ.toLowerCase();
        all = all.filter((s) => (s.name || "").toLowerCase().includes(low));
      }
      all.sort((a, b) => Number(b.id) - Number(a.id));
      const slice = all.slice(off, off + take);
      const hasMore = slice.length > lim;
      const rows = hasMore ? slice.slice(0, lim) : slice;
      return {
        suppliers: rows.map((s) => ({
          id: s.id,
          name: s.name || "",
          phone: s.phone || "",
          category: s.category || "",
        })),
        hasMore,
      };
    }
    return await runDb(async (database) => {
      const sqlBase = useNameFilter
        ? "SELECT id, name, phone, category FROM suppliers WHERE instr(lower(name), lower(?)) > 0 ORDER BY id DESC"
        : "SELECT id, name, phone, category FROM suppliers ORDER BY id DESC";
      const baseParams = useNameFilter ? [nameQ] : [];
      const rows = await database.getAllAsync(
        `${sqlBase} LIMIT ? OFFSET ?`,
        ...baseParams,
        take,
        off
      );
      const hasMore = rows.length > lim;
      const pageRows = hasMore ? rows.slice(0, lim) : rows;
      return { suppliers: pageRows.map((r) => mapSupplierRow(r)), hasMore };
    });
  } catch (e) {
    console.warn("DB getSuppliersPage error:", e?.message || e);
    clearDbOnError(e);
    return { suppliers: [], hasMore: false };
  }
}

/**
 * Aggregate purchase stats per supplier from expense client_transactions with supplier_id.
 * Keys are stringified supplier ids. Values: { total, count }.
 */
export async function getSupplierPurchaseStatsMap() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const out = {};
      for (const c of state?.clients || []) {
        for (const t of c.txs || []) {
          if (t.type !== "expense" || t.supplierId == null) continue;
          const sid = String(t.supplierId);
          if (!out[sid]) out[sid] = { total: 0, count: 0 };
          out[sid].total += Number(t.amount) || 0;
          out[sid].count += 1;
        }
      }
      return out;
    }
    return await runDb(async (database) => {
      const rows = await database.getAllAsync(
        `SELECT supplier_id AS sid, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
         FROM client_transactions
         WHERE type = 'expense' AND supplier_id IS NOT NULL
         GROUP BY supplier_id`
      );
      const out = {};
      for (const r of rows || []) {
        if (r.sid == null) continue;
        const key = String(r.sid);
        out[key] = { total: Number(r.total) || 0, count: Number(r.cnt) || 0 };
      }
      return out;
    });
  } catch (e) {
    console.warn("DB getSupplierPurchaseStatsMap error:", e?.message || e);
    clearDbOnError(e);
    return {};
  }
}

/** Get settings only (nissabPrice). Fiscal years come from fiscal_years table. On web reads nissabPrice from AsyncStorage. */
export async function getSettings() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return { nissabPrice: 85000, customFiscalYearIds: [], activeFiscalYearId: null };
      let customFiscalYearIds = [];
      if (Array.isArray(state.customFiscalYearIds)) {
        customFiscalYearIds = state.customFiscalYearIds.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
      }
      return {
        nissabPrice: state.nissabPrice ?? 85000,
        customFiscalYearIds,
        activeFiscalYearId: state.activeFiscalYearId != null ? Number(state.activeFiscalYearId) : null,
      };
    }
    return await runDb(async (database) => {
      const rows = await database.getAllAsync("SELECT key, value FROM settings");
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      if ("activeFY" in settings || "customFYs" in settings) {
        await database.runAsync("DELETE FROM settings WHERE key IN ('activeFY', 'customFYs')");
      }
      const nissabPrice = settings.nissabPrice != null ? Number(settings.nissabPrice) : 85000;
      let customFiscalYearIds = [];
      if (settings.customFiscalYearIds) {
        try {
          const parsed = JSON.parse(settings.customFiscalYearIds);
          if (Array.isArray(parsed)) customFiscalYearIds = parsed.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
        } catch (_) {}
      }
      return { nissabPrice, customFiscalYearIds };
    });
  } catch (e) {
    console.warn("DB getSettings error:", e?.message || e);
    return { nissabPrice: 85000, customFiscalYearIds: [] };
  }
}

/** Alias for storage.js init - same as getFullState */
export async function loadState() {
  return getFullState();
}

/**
 * Persist full state (only used for migration from AsyncStorage). Prefer incremental writes.
 * On web, writes to AsyncStorage.
 */
export async function saveState(data) {
  try {
    if (IS_WEB) {
      await setWebState({
        clients: data.clients || [],
        generalTxs: data.generalTxs || [],
        workers: data.workers || [],
        suppliers: data.suppliers || [],
        activeFY: data.activeFY != null ? data.activeFY : null,
        customFYs: data.customFYs || [],
        nissabPrice: data.nissabPrice != null ? data.nissabPrice : 85000,
      });
      return;
    }
    await runDb(async (database) => {
      for (const c of data.clients || []) {
        await database.runAsync(
          "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at, fiscal_year_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          c.id,
          c.name || "",
          c.project || "",
          c.status || "active",
          c.note || "",
          c.createdAt || "",
          c.fiscalYearId ?? null
        );
        await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", c.id);
        for (const t of c.txs || []) {
          await database.runAsync(
            "INSERT INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            t.id,
            c.id,
            t.type || "income",
            t.amount,
            t.cat || "",
            t.note || "",
            t.date || "",
            t.workerId ?? null,
            t.supplierId ?? null
          );
        }
      }
      for (const t of data.generalTxs || []) {
        const kind = t.txKind === "income" ? "income" : "expense";
        await database.runAsync(
          "INSERT OR REPLACE INTO general (id, amount, cat, note, date, fiscal_year_id, tx_kind) VALUES (?, ?, ?, ?, ?, ?, ?)",
          t.id,
          t.amount,
          t.cat || "",
          t.note || "",
          t.date || "",
          t.fiscalYearId ?? null,
          kind
        );
      }
      for (const w of data.workers || []) {
        await database.runAsync(
          "INSERT OR REPLACE INTO workers (id, name, phone) VALUES (?, ?, ?)",
          w.id,
          w.name || "",
          w.phone || ""
        );
      }
      for (const s of data.suppliers || []) {
        await database.runAsync(
          "INSERT OR REPLACE INTO suppliers (id, name, phone, category) VALUES (?, ?, ?, ?)",
          s.id,
          s.name || "",
          s.phone || "",
          s.category || ""
        );
      }
      if (data.activeFY != null) {
        await database.runAsync("UPDATE fiscal_years SET is_active = 0");
        await database.runAsync("INSERT OR IGNORE INTO fiscal_years (label, is_active) VALUES (?, 1)", data.activeFY);
        await database.runAsync("UPDATE fiscal_years SET is_active = 1 WHERE label = ?", data.activeFY);
      }
      for (const label of data.customFYs || []) {
        await database.runAsync("INSERT OR IGNORE INTO fiscal_years (label, is_active) VALUES (?, 0)", label);
      }
      await database.runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        "nissabPrice",
        data.nissabPrice != null ? String(data.nissabPrice) : "85000"
      );
    });
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB saveState error:", e.message);
    }
    clearDbOnError(e);
  }
}

// ---------- Incremental writes (set data, no full delete) ----------

export async function upsertClient(client) {
  if (client == null || client.id == null) return;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const idx = state.clients.findIndex((c) => String(c.id) === String(client.id));
      const next = { ...client, txs: client.txs || [] };
      const clients = [...state.clients];
      if (idx >= 0) clients[idx] = next;
      else clients.push(next);
      await setWebState({ ...state, clients });
      return;
    }
    await runDb(async (database) => {
      await database.runAsync(
        "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at, fiscal_year_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        client.id,
        client.name || "",
        client.project || "",
        client.status || "active",
        client.note || "",
        client.createdAt || "",
        client.fiscalYearId ?? null
      );
      await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", client.id);
      for (const t of client.txs || []) {
        await database.runAsync(
          "INSERT INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          t.id,
          client.id,
          t.type || "income",
          t.amount,
          t.cat || "",
          t.note || "",
          t.date || "",
          t.workerId ?? null,
          t.supplierId ?? null
        );
      }
    });
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertClient error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function deleteClient(id) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const clients = state.clients.filter((c) => String(c.id) !== String(id));
      await setWebState({ ...state, clients });
      return;
    }
    await runDb(async (database) => {
      await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", id);
      await database.runAsync("DELETE FROM clients WHERE id = ?", id);
    });
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteClient error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function upsertClientTx(clientId, tx) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const clients = state.clients.map((c) => {
        if (String(c.id) !== String(clientId)) return c;
        const txs = [...(c.txs || [])];
        const i = txs.findIndex((t) => String(t.id) === String(tx.id));
        const row = {
          ...tx,
          id: tx.id,
          type: tx.type || "income",
          amount: tx.amount,
          cat: tx.cat || "",
          note: tx.note || "",
          date: tx.date || "",
          workerId: tx.workerId,
          supplierId: tx.supplierId,
        };
        if (i >= 0) txs[i] = row;
        else txs.push(row);
        return { ...c, txs };
      });
      await setWebState({ ...state, clients });
      return;
    }
    await runDb((database) =>
      database.runAsync(
        "INSERT OR REPLACE INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        tx.id,
        clientId,
        tx.type || "income",
        tx.amount,
        tx.cat || "",
        tx.note || "",
        tx.date || "",
        tx.workerId ?? null,
        tx.supplierId ?? null
      )
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertClientTx error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function deleteClientTx(clientId, txId) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const clients = state.clients.map((c) => {
        if (String(c.id) !== String(clientId)) return c;
        const txs = (c.txs || []).filter((t) => String(t.id) !== String(txId));
        return { ...c, txs };
      });
      await setWebState({ ...state, clients });
      return;
    }
    await runDb((database) =>
      database.runAsync("DELETE FROM client_transactions WHERE client_id = ? AND id = ?", clientId, txId)
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteClientTx error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function upsertGeneralTx(tx) {
  try {
    const kind = tx.txKind === "income" ? "income" : "expense";
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const generalTxs = [...(state.generalTxs || [])];
      const row = {
        id: tx.id,
        amount: tx.amount,
        cat: tx.cat || "",
        note: tx.note || "",
        date: tx.date || "",
        fiscalYearId: tx.fiscalYearId ?? null,
        txKind: kind,
      };
      const i = generalTxs.findIndex((t) => String(t.id) === String(tx.id));
      if (i >= 0) generalTxs[i] = row;
      else generalTxs.push(row);
      await setWebState({ ...state, generalTxs });
      return;
    }
    await runDb((database) =>
      database.runAsync(
        "INSERT OR REPLACE INTO general (id, amount, cat, note, date, fiscal_year_id, tx_kind) VALUES (?, ?, ?, ?, ?, ?, ?)",
        tx.id,
        tx.amount,
        tx.cat || "",
        tx.note || "",
        tx.date || "",
        tx.fiscalYearId ?? null,
        kind
      )
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertGeneralTx error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function deleteGeneralTx(id) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const generalTxs = (state.generalTxs || []).filter((t) => String(t.id) !== String(id));
      await setWebState({ ...state, generalTxs });
      return;
    }
    await runDb((database) => database.runAsync("DELETE FROM general WHERE id = ?", id));
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteGeneralTx error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function upsertWorker(worker) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const workers = [...(state.workers || [])];
      const row = { id: worker.id, name: worker.name, phone: worker.phone || "" };
      const i = workers.findIndex((w) => String(w.id) === String(worker.id));
      if (i >= 0) workers[i] = row;
      else workers.push(row);
      await setWebState({ ...state, workers });
      return;
    }
    await runDb((database) =>
      database.runAsync(
        "INSERT OR REPLACE INTO workers (id, name, phone) VALUES (?, ?, ?)",
        worker.id,
        worker.name,
        worker.phone || ""
      )
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertWorker error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function deleteWorker(id) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const workers = (state.workers || []).filter((w) => String(w.id) !== String(id));
      await setWebState({ ...state, workers });
      return;
    }
    await runDb((database) => database.runAsync("DELETE FROM workers WHERE id = ?", id));
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteWorker error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function upsertSupplier(supplier) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const suppliers = [...(state.suppliers || [])];
      const row = {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone || "",
        category: supplier.category || "",
      };
      const i = suppliers.findIndex((s) => String(s.id) === String(supplier.id));
      if (i >= 0) suppliers[i] = row;
      else suppliers.push(row);
      await setWebState({ ...state, suppliers });
      return;
    }
    await runDb((database) =>
      database.runAsync(
        "INSERT OR REPLACE INTO suppliers (id, name, phone, category) VALUES (?, ?, ?, ?)",
        supplier.id,
        supplier.name,
        supplier.phone || "",
        supplier.category || ""
      )
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertSupplier error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function deleteSupplier(id) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const suppliers = (state.suppliers || []).filter((s) => String(s.id) !== String(id));
      await setWebState({ ...state, suppliers });
      return;
    }
    await runDb((database) => database.runAsync("DELETE FROM suppliers WHERE id = ?", id));
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteSupplier error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

/** Only nissabPrice is stored in settings table. Fiscal years use fiscal_years table. */
export async function setSettings(settings) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const nissabPrice = settings.nissabPrice !== undefined ? settings.nissabPrice : (state && state.nissabPrice) ?? 85000;
      await setWebState({
        clients: (state && state.clients) || [],
        generalTxs: (state && state.generalTxs) || [],
        workers: (state && state.workers) || [],
        suppliers: (state && state.suppliers) || [],
        activeFY: state && state.activeFY,
        activeFiscalYearId: state && state.activeFiscalYearId,
        customFYs: state && state.customFYs,
        customFiscalYearIds:
          settings.customFiscalYearIds !== undefined
            ? settings.customFiscalYearIds
            : state && state.customFiscalYearIds,
        nissabPrice,
      });
      return;
    }
    if (settings.nissabPrice !== undefined) {
      await runDb((database) =>
        database.runAsync(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
          "nissabPrice",
          String(settings.nissabPrice)
        )
      );
    }
    if (settings.customFiscalYearIds !== undefined) {
      const json = JSON.stringify(settings.customFiscalYearIds || []);
      await runDb((database) =>
        database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "customFiscalYearIds", json)
      );
    }
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB setSettings error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

/**
 * Serialized payload for cloud backup: SQLite bytes on native; JSON snapshot on web.
 * @returns {Promise<{ bytes: Uint8Array, extension: string } | null>}
 */
export async function getDatabaseBackupPayload() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return null;
      const payload = {
        v: 1,
        exportedAt: new Date().toISOString(),
        clients: state.clients || [],
        generalTxs: state.generalTxs || [],
        workers: state.workers || [],
        suppliers: state.suppliers || [],
        activeFY: state.activeFY ?? null,
        activeFiscalYearId: state.activeFiscalYearId ?? null,
        customFYs: state.customFYs || [],
        nissabPrice: state.nissabPrice != null ? state.nissabPrice : 85000,
      };
      const json = JSON.stringify(payload);
      return { bytes: new TextEncoder().encode(json), extension: "json" };
    }
    const bytes = await runDb(async (database) => database.serializeAsync("main"));
    return { bytes, extension: "db" };
  } catch (e) {
    console.warn("getDatabaseBackupPayload error:", e?.message || e);
    clearDbOnError(e);
    throw e;
  }
}
