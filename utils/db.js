import { Platform } from "react-native";
import { getCurrentFiscalYear } from "../utils/helpers";
import { DEFAULT_STOCK_ITEMS } from "../constants";
import {
  computeStockBalance,
  canIssueQuantity,
  issueCostAmount,
  getStockUnitLabel,
  displayUnitCost,
} from "./stockHelpers";
import { normalizeDeliveryDate, normalizeReminderDays } from "./deliveryReminders";

const IS_WEB = Platform.OS === "web";
const DB_NAME = "mall_v4.db";
const WEB_STORAGE_KEY = "mall_v4";

export const DELETE_BLOCKED = "DELETE_BLOCKED";
const CLIENT_DELETE_BLOCKED_MSG =
  "لا يمكن حذف العميل لوجود عمليات مسجّلة عليه. امسح العمليات أولاً ثم حاول مرة أخرى.";
const WORKER_DELETE_BLOCKED_MSG =
  "لا يمكن حذف الصنايعي لوجود عمليات مسجّلة عليه. امسح العمليات أولاً ثم حاول مرة أخرى.";
const SUPPLIER_DELETE_BLOCKED_MSG =
  "لا يمكن حذف المورد لوجود عمليات مسجّلة عليه. امسح العمليات أولاً ثم حاول مرة أخرى.";

function throwIfBlocked(blocked, message) {
  if (!blocked) return;
  const err = new Error(message);
  err.code = DELETE_BLOCKED;
  throw err;
}

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
      stockItems: data.stockItems || [],
      stockMovements: data.stockMovements || [],
      workerTxs: data.workerTxs || [],
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
      fiscal_year_id INTEGER REFERENCES fiscal_years(id),
      order_amount REAL,
      phone TEXT,
      delivery_date TEXT,
      reminder_days INTEGER
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
  await migrateStockSchema(database);
  await migrateClientsSchema(database);
  await migrateWorkerLedgerSchema(database);
}

async function migrateWorkerLedgerSchema(database) {
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS worker_transactions (
        id INTEGER PRIMARY KEY NOT NULL,
        worker_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        cat TEXT,
        note TEXT,
        date TEXT,
        fiscal_year_id INTEGER REFERENCES fiscal_years(id),
        client_id INTEGER,
        FOREIGN KEY (worker_id) REFERENCES workers(id)
      );
    `);
  } catch (e) {
    console.warn("migrateWorkerLedgerSchema:", e?.message || e);
  }
}

async function migrateClientsSchema(database) {
  try {
    const cols = await database.getAllAsync("PRAGMA table_info(clients)");
    const names = new Set((cols || []).map((c) => c.name));
    if (!names.has("order_amount")) {
      await database.execAsync("ALTER TABLE clients ADD COLUMN order_amount REAL");
    }
    if (!names.has("phone")) {
      await database.execAsync("ALTER TABLE clients ADD COLUMN phone TEXT");
    }
    if (!names.has("delivery_date")) {
      await database.execAsync("ALTER TABLE clients ADD COLUMN delivery_date TEXT");
    }
    if (!names.has("reminder_days")) {
      await database.execAsync("ALTER TABLE clients ADD COLUMN reminder_days INTEGER");
    }
  } catch (e) {
    console.warn("migrateClientsSchema:", e?.message || e);
  }
}

async function migrateStockSchema(database) {
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS stock_items (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        expense_cat TEXT NOT NULL DEFAULT 'أخرى',
        unit_price REAL
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY NOT NULL,
        item_id INTEGER NOT NULL,
        direction TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        supplier_id INTEGER,
        client_id INTEGER,
        client_tx_id INTEGER,
        note TEXT,
        date TEXT NOT NULL,
        fiscal_year_id INTEGER,
        FOREIGN KEY (item_id) REFERENCES stock_items(id)
      );
    `);
    const txCols = await database.getAllAsync("PRAGMA table_info(client_transactions)");
    const txNames = new Set((txCols || []).map((c) => c.name));
    if (!txNames.has("stock_item_id")) {
      await database.execAsync("ALTER TABLE client_transactions ADD COLUMN stock_item_id INTEGER");
    }
    if (!txNames.has("stock_quantity")) {
      await database.execAsync("ALTER TABLE client_transactions ADD COLUMN stock_quantity REAL");
    }
    if (!txNames.has("stock_movement_id")) {
      await database.execAsync("ALTER TABLE client_transactions ADD COLUMN stock_movement_id INTEGER");
    }
    const itemCols = await database.getAllAsync("PRAGMA table_info(stock_items)");
    const itemColNames = new Set((itemCols || []).map((c) => c.name));
    if (!itemColNames.has("unit_price")) {
      try {
        await database.execAsync("ALTER TABLE stock_items ADD COLUMN unit_price REAL");
      } catch (alterErr) {
        console.warn("migrateStockSchema unit_price:", alterErr?.message || alterErr);
      }
    }
    const countRow = await database.getFirstAsync("SELECT COUNT(*) AS c FROM stock_items");
    if ((countRow?.c ?? 0) === 0) {
      const now = Date.now();
      for (let i = 0; i < DEFAULT_STOCK_ITEMS.length; i++) {
        const it = DEFAULT_STOCK_ITEMS[i];
        await database.runAsync(
          "INSERT INTO stock_items (id, name, unit, expense_cat) VALUES (?, ?, ?, ?)",
          now + i,
          it.name,
          it.unit,
          it.expenseCat
        );
      }
    }
  } catch (e) {
    console.warn("migrateStockSchema:", e?.message || e);
  }
}

const CLIENT_TX_SELECT =
  "id, client_id, type, amount, cat, note, date, worker_id, supplier_id, stock_item_id, stock_quantity, stock_movement_id";

function mapStockItemRow(r) {
  const price = r.unit_price != null ? r.unit_price : r.unitPrice;
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    expenseCat: r.expense_cat || r.expenseCat || "أخرى",
    unitPrice: price != null && price !== "" ? Number(price) : null,
  };
}

function mapStockMovementRow(r) {
  return {
    id: r.id,
    itemId: r.item_id,
    direction: r.direction === "out" ? "out" : "in",
    quantity: r.quantity,
    unitPrice: r.unit_price,
    supplierId: r.supplier_id ?? null,
    clientId: r.client_id ?? null,
    clientTxId: r.client_tx_id ?? null,
    note: r.note || "",
    date: r.date || "",
    fiscalYearId: r.fiscal_year_id != null ? r.fiscal_year_id : null,
  };
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

const CLIENT_ROW_SELECT =
  "id, name, project, status, note, created_at, fiscal_year_id, order_amount, phone, delivery_date, reminder_days";

function clientWriteValues(c) {
  const deliveryDate = normalizeDeliveryDate(c.deliveryDate);
  return [
    c.id,
    c.name || "",
    c.project || "",
    c.status || "active",
    c.note || "",
    c.createdAt || "",
    c.fiscalYearId ?? null,
    c.orderAmount != null && Number(c.orderAmount) > 0 ? Number(c.orderAmount) : null,
    c.phone || "",
    deliveryDate,
    normalizeReminderDays(c.reminderDays, deliveryDate),
  ];
}

function rowToClient(c, txRows) {
  const orderRaw = c.order_amount != null ? c.order_amount : c.orderAmount;
  const deliveryDate = normalizeDeliveryDate(c.delivery_date != null ? c.delivery_date : c.deliveryDate);
  const reminderRaw = c.reminder_days != null ? c.reminder_days : c.reminderDays;
  return {
    id: c.id,
    name: c.name,
    project: c.project || "",
    status: c.status || "active",
    note: c.note || "",
    fiscalYearId: c.fiscal_year_id != null ? c.fiscal_year_id : c.fiscalYearId != null ? c.fiscalYearId : null,
    createdAt: c.created_at || c.createdAt || "",
    phone: c.phone || "",
    orderAmount: orderRaw != null && orderRaw !== "" ? Number(orderRaw) : null,
    deliveryDate,
    reminderDays: normalizeReminderDays(reminderRaw, deliveryDate),
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
        ...(t.stock_item_id != null && { stockItemId: t.stock_item_id }),
        ...(t.stock_quantity != null && { stockQuantity: t.stock_quantity }),
        ...(t.stock_movement_id != null && { stockMovementId: t.stock_movement_id }),
      })),
  };
}

function mapClientTxToDb(tx) {
  return [
    tx.id,
    tx.type || "income",
    tx.amount,
    tx.cat || "",
    tx.note || "",
    tx.date || "",
    tx.workerId ?? null,
    tx.supplierId ?? null,
    tx.stockItemId ?? null,
    tx.stockQuantity ?? null,
    tx.stockMovementId ?? null,
  ];
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
        `SELECT ${CLIENT_ROW_SELECT} FROM clients ORDER BY id DESC`
      );
      const txRows = await database.getAllAsync(
        `SELECT ${CLIENT_TX_SELECT} FROM client_transactions ORDER BY client_id, id`
      );
      const generalRows = await database.getAllAsync(
        "SELECT id, amount, cat, note, date, fiscal_year_id, tx_kind FROM general ORDER BY id"
      );
      const workersRows = await database.getAllAsync("SELECT id, name, phone FROM workers ORDER BY id");
      const workerTxRows = await database.getAllAsync(
        "SELECT id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id FROM worker_transactions ORDER BY id"
      );
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
        workerTxRows.length > 0 ||
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
      const workerTxs = (workerTxRows || []).map(mapWorkerTxRow);
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
        workerTxs,
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
          ? `SELECT ${CLIENT_ROW_SELECT} FROM clients WHERE fiscal_year_id = ? ORDER BY id DESC`
          : `SELECT ${CLIENT_ROW_SELECT} FROM clients ORDER BY id DESC`;
      const clientsRows =
        fyId != null
          ? await database.getAllAsync(sql, fyId)
          : await database.getAllAsync(sql);
      const txRows = await database.getAllAsync(
        `SELECT ${CLIENT_TX_SELECT} FROM client_transactions ORDER BY client_id, id`
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
const CLIENT_SEARCH_NAME_OR_PHONE =
  "(instr(lower(name), lower(?)) > 0 OR instr(lower(ifnull(phone, '')), lower(?)) > 0)";

function clientMatchesNameOrPhone(c, q) {
  const low = String(q || "").toLowerCase();
  if (!low) return true;
  return (
    (c.name || "").toLowerCase().includes(low) || (c.phone || "").toLowerCase().includes(low)
  );
}

/**
 * Paginated clients (same fiscal filter as getClients), with txs only for returned rows.
 * @param {number} [limit=5] — page size (capped 1–50)
 * @param {number} [offset=0]
 * @param {{ nameContains?: string }} [options] — optional substring match on name or phone
 * @returns {Promise<{ clients: [], hasMore: boolean, total: number }>}
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
        all = all.filter((c) => clientMatchesNameOrPhone(c, nameQ));
      }
      all.sort((a, b) => Number(b.id) - Number(a.id));
      const slice = all.slice(off, off + take);
      const hasMore = slice.length > lim;
      const rows = hasMore ? slice.slice(0, lim) : slice;
      const clients = rows.map((c) => ({
        ...c,
        txs: Array.isArray(c.txs) ? c.txs : [],
      }));
      return { clients, hasMore, total: all.length };
    }
    return await runDb(async (database) => {
      const fyId = await getActiveFiscalYearIdWithDb(database);
      const nameClause = useNameFilter ? ` AND ${CLIENT_SEARCH_NAME_OR_PHONE}` : "";
      let sqlBase;
      let countSql;
      let baseParams;
      if (fyId != null) {
        sqlBase = `SELECT ${CLIENT_ROW_SELECT} FROM clients WHERE fiscal_year_id = ?${nameClause} ORDER BY id DESC`;
        countSql = `SELECT COUNT(*) AS n FROM clients WHERE fiscal_year_id = ?${nameClause}`;
        baseParams = useNameFilter ? [fyId, nameQ, nameQ] : [fyId];
      } else {
        sqlBase = useNameFilter
          ? `SELECT ${CLIENT_ROW_SELECT} FROM clients WHERE ${CLIENT_SEARCH_NAME_OR_PHONE} ORDER BY id DESC`
          : `SELECT ${CLIENT_ROW_SELECT} FROM clients ORDER BY id DESC`;
        countSql = useNameFilter
          ? `SELECT COUNT(*) AS n FROM clients WHERE ${CLIENT_SEARCH_NAME_OR_PHONE}`
          : "SELECT COUNT(*) AS n FROM clients";
        baseParams = useNameFilter ? [nameQ, nameQ] : [];
      }
      const [countRow, clientsRows] = await Promise.all([
        database.getFirstAsync(countSql, ...baseParams),
        database.getAllAsync(`${sqlBase} LIMIT ? OFFSET ?`, ...baseParams, lim, off),
      ]);
      const total = Number(countRow?.n) || 0;
      const ids = (clientsRows || []).map((c) => c.id);
      let txRows = [];
      if (ids.length > 0) {
        const ph = ids.map(() => "?").join(",");
        txRows = await database.getAllAsync(
          `SELECT ${CLIENT_TX_SELECT} FROM client_transactions WHERE client_id IN (${ph}) ORDER BY client_id, id`,
          ...ids
        );
      }
      const clients = (clientsRows || []).map((c) => rowToClient(c, txRows));
      const hasMore = off + clients.length < total;
      return { clients, hasMore, total };
    });
  } catch (e) {
    console.warn("DB getClientsPage error:", e?.message || e);
    clearDbOnError(e);
    return { clients: [], hasMore: false, total: 0 };
  }
}

const DELIVERIES_PAGE_DEFAULT = 5;

function clientHasDeliveryDate(c) {
  return !!normalizeDeliveryDate(c.deliveryDate || c.delivery_date);
}

function sortClientsByDeliveryDate(a, b) {
  const da = normalizeDeliveryDate(a.deliveryDate || a.delivery_date) || "";
  const db = normalizeDeliveryDate(b.deliveryDate || b.delivery_date) || "";
  const cmp = da.localeCompare(db);
  if (cmp !== 0) return cmp;
  return Number(a.id) - Number(b.id);
}

/**
 * Paginated clients that have a delivery date, soonest first.
 * @returns {Promise<{ clients: Array<object>, total: number }>}
 */
export async function getDeliveryDatesPage(limit = DELIVERIES_PAGE_DEFAULT, offset = 0, fiscalYearId = null) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || DELIVERIES_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const fyId = fiscalYearId != null && fiscalYearId !== "" ? Number(fiscalYearId) : null;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let all = (state?.clients || []).filter(clientHasDeliveryDate);
      if (fyId != null && !Number.isNaN(fyId)) {
        all = all.filter((c) => Number(c.fiscalYearId) === fyId);
      }
      all.sort(sortClientsByDeliveryDate);
      const rows = all.slice(off, off + lim);
      return {
        clients: rows.map((c) => ({
          ...c,
          deliveryDate: normalizeDeliveryDate(c.deliveryDate),
          txs: [],
        })),
        total: all.length,
      };
    }
    return await runDb(async (database) => {
      const fy = fyId != null && !Number.isNaN(fyId) ? fyId : await getActiveFiscalYearIdWithDb(database);
      const fyClause = fy != null ? " AND fiscal_year_id = ?" : "";
      const where = `WHERE delivery_date IS NOT NULL AND delivery_date != ''${fyClause}`;
      const params = fy != null ? [fy] : [];
      const [countRow, rows] = await Promise.all([
        database.getFirstAsync(`SELECT COUNT(*) AS n FROM clients ${where}`, ...params),
        database.getAllAsync(
          `SELECT ${CLIENT_ROW_SELECT} FROM clients ${where} ORDER BY delivery_date ASC, id ASC LIMIT ? OFFSET ?`,
          ...params,
          lim,
          off
        ),
      ]);
      return {
        clients: (rows || []).map((c) => rowToClient(c, [])),
        total: Number(countRow?.n) || 0,
      };
    });
  } catch (e) {
    console.warn("DB getDeliveryDatesPage error:", e?.message || e);
    clearDbOnError(e);
    return { clients: [], total: 0 };
  }
}

export const CLIENT_SELECT_DEFAULT_LIMIT = 5;
export const CLIENT_SELECT_MIN_CHARS = 3;

/**
 * Lightweight client picker rows (id + name + phone, no transactions).
 * Empty query → newest `limit` clients. Query of 3+ chars → name or phone contains match.
 */
export async function searchClientsForSelect(query = "", limit = CLIENT_SELECT_DEFAULT_LIMIT) {
  const lim = Math.min(20, Math.max(1, Math.floor(Number(limit)) || CLIENT_SELECT_DEFAULT_LIMIT));
  const q = typeof query === "string" ? String(query).trim() : "";
  const useSearch = q.length >= CLIENT_SELECT_MIN_CHARS;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let all = state ? [...(state.clients || [])] : [];
      if (useSearch) {
        all = all.filter((c) => clientMatchesNameOrPhone(c, q));
      }
      all.sort((a, b) => Number(b.id) - Number(a.id));
      return all.slice(0, lim).map((c) => ({ id: c.id, name: c.name || "", phone: c.phone || "" }));
    }
    return await runDb(async (database) => {
      const fyId = await getActiveFiscalYearIdWithDb(database);
      const nameClause = useSearch ? ` AND ${CLIENT_SEARCH_NAME_OR_PHONE}` : "";
      let sql;
      let params;
      if (fyId != null) {
        sql = `SELECT id, name, phone FROM clients WHERE fiscal_year_id = ?${nameClause} ORDER BY id DESC LIMIT ?`;
        params = useSearch ? [fyId, q, q, lim] : [fyId, lim];
      } else {
        sql = useSearch
          ? `SELECT id, name, phone FROM clients WHERE ${CLIENT_SEARCH_NAME_OR_PHONE} ORDER BY id DESC LIMIT ?`
          : "SELECT id, name, phone FROM clients ORDER BY id DESC LIMIT ?";
        params = useSearch ? [q, q, lim] : [lim];
      }
      const rows = await database.getAllAsync(sql, ...params);
      return (rows || []).map((r) => ({ id: r.id, name: r.name || "", phone: r.phone || "" }));
    });
  } catch (e) {
    console.warn("DB searchClientsForSelect error:", e?.message || e);
    return [];
  }
}

/** Map of client id → name for the given ids. */
export async function getClientNamesByIds(ids) {
  const unique = [
    ...new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))),
  ];
  if (!unique.length) return {};
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const map = {};
      for (const c of state?.clients || []) {
        if (unique.includes(Number(c.id))) map[c.id] = c.name || "";
      }
      return map;
    }
    return await runDb(async (database) => {
      const ph = unique.map(() => "?").join(",");
      const rows = await database.getAllAsync(
        `SELECT id, name FROM clients WHERE id IN (${ph})`,
        ...unique
      );
      const map = {};
      for (const r of rows || []) map[r.id] = r.name || "";
      return map;
    });
  } catch (e) {
    console.warn("DB getClientNamesByIds error:", e?.message || e);
    return {};
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
        `SELECT ${CLIENT_ROW_SELECT} FROM clients WHERE id = ?`,
        clientId
      );
      if (clientRows.length === 0) return null;
      const txRows = await database.getAllAsync(
        `SELECT ${CLIENT_TX_SELECT} FROM client_transactions WHERE client_id = ? ORDER BY id`,
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

const WORKERS_PAGE_DEFAULT = 5;

function mapWorkerRow(r) {
  return { id: r.id, name: r.name, phone: r.phone || "" };
}

/**
 * Paginated workers, newest first (`ORDER BY id DESC`).
 * @param {{ nameContains?: string }} [options] — optional substring match on name or phone
 * @returns {Promise<{ workers: Array<object>, hasMore: boolean, total: number }>}
 */
export async function getWorkersPage(limit = WORKERS_PAGE_DEFAULT, offset = 0, options = {}) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || WORKERS_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const nameQ =
    typeof options.nameContains === "string" ? String(options.nameContains).trim() : "";
  const useNameFilter = nameQ.length > 0;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let all = [...(state?.workers || [])];
      if (useNameFilter) {
        all = all.filter((w) => clientMatchesNameOrPhone(w, nameQ));
      }
      all.sort((a, b) => Number(b.id) - Number(a.id));
      const rows = all.slice(off, off + lim);
      return {
        workers: rows.map((w) => ({
          id: w.id,
          name: w.name || "",
          phone: w.phone || "",
        })),
        hasMore: off + rows.length < all.length,
        total: all.length,
      };
    }
    return await runDb(async (database) => {
      const searchClause = useNameFilter ? ` WHERE ${CLIENT_SEARCH_NAME_OR_PHONE}` : "";
      const sqlBase = `SELECT id, name, phone FROM workers${searchClause} ORDER BY id DESC`;
      const countSql = `SELECT COUNT(*) AS n FROM workers${searchClause}`;
      const baseParams = useNameFilter ? [nameQ, nameQ] : [];
      const [countRow, rows] = await Promise.all([
        database.getFirstAsync(countSql, ...baseParams),
        database.getAllAsync(`${sqlBase} LIMIT ? OFFSET ?`, ...baseParams, lim, off),
      ]);
      const total = Number(countRow?.n) || 0;
      return {
        workers: (rows || []).map((r) => mapWorkerRow(r)),
        hasMore: off + (rows || []).length < total,
        total,
      };
    });
  } catch (e) {
    console.warn("DB getWorkersPage error:", e?.message || e);
    clearDbOnError(e);
    return { workers: [], hasMore: false, total: 0 };
  }
}

function emptyWorkerLedgerStats() {
  return { total: 0, count: 0, dueTotal: 0, payoutTotal: 0, paidTotal: 0, balance: 0 };
}

function mapWorkerTxRow(r) {
  return {
    id: r.id,
    workerId: r.worker_id != null ? r.worker_id : r.workerId,
    kind: r.kind === "due" ? "due" : "payout",
    amount: Number(r.amount) || 0,
    cat: r.cat || "",
    note: r.note || "",
    date: r.date || "",
    fiscalYearId: r.fiscal_year_id != null ? r.fiscal_year_id : r.fiscalYearId ?? null,
    clientId: r.client_id != null ? r.client_id : r.clientId ?? null,
  };
}

function applyWorkerTxToStats(out, tx) {
  const wid = String(tx.workerId);
  if (!out[wid]) out[wid] = emptyWorkerLedgerStats();
  const amt = Number(tx.amount) || 0;
  if (tx.kind === "due") out[wid].dueTotal += amt;
  else {
    out[wid].payoutTotal += amt;
    out[wid].paidTotal += amt;
    out[wid].count += 1;
  }
}

function finalizeWorkerLedgerStats(out) {
  for (const key of Object.keys(out)) {
    const s = out[key];
    s.total = s.paidTotal;
    s.balance = s.dueTotal - s.paidTotal;
  }
  return out;
}

/**
 * Ledger + client-expense stats per worker.
 * Keys are stringified worker ids.
 * Values: { total, count, dueTotal, payoutTotal, paidTotal, balance }.
 * `total` = paidTotal (سلفة + باقي راتب + مصنعية العملاء).
 */
export async function getWorkerExpenseStatsMap(fiscalYearId = null) {
  const fyId = fiscalYearId != null && fiscalYearId !== "" ? Number(fiscalYearId) : null;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const out = {};
      for (const t of state?.workerTxs || []) {
        if (fyId != null && Number(t.fiscalYearId) !== fyId) continue;
        applyWorkerTxToStats(out, mapWorkerTxRow(t));
      }
      for (const c of state?.clients || []) {
        if (fyId != null && Number(c.fiscalYearId) !== fyId) continue;
        for (const t of c.txs || []) {
          if (t.type !== "expense" || t.workerId == null) continue;
          const wid = String(t.workerId);
          if (!out[wid]) out[wid] = emptyWorkerLedgerStats();
          const amt = Number(t.amount) || 0;
          out[wid].paidTotal += amt;
          out[wid].count += 1;
        }
      }
      return finalizeWorkerLedgerStats(out);
    }
    return await runDb(async (database) => {
      const fy = fyId != null && !Number.isNaN(fyId) ? fyId : await getActiveFiscalYearIdWithDb(database);
      const out = {};
      const dueSql =
        fy != null
          ? "SELECT worker_id AS wid, kind, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt FROM worker_transactions WHERE fiscal_year_id = ? GROUP BY worker_id, kind"
          : "SELECT worker_id AS wid, kind, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt FROM worker_transactions GROUP BY worker_id, kind";
      const clientSql =
        fy != null
          ? `SELECT ct.worker_id AS wid, COALESCE(SUM(ct.amount), 0) AS total, COUNT(*) AS cnt
             FROM client_transactions ct
             INNER JOIN clients c ON c.id = ct.client_id
             WHERE ct.type = 'expense' AND ct.worker_id IS NOT NULL AND c.fiscal_year_id = ?
             GROUP BY ct.worker_id`
          : `SELECT worker_id AS wid, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
             FROM client_transactions
             WHERE type = 'expense' AND worker_id IS NOT NULL
             GROUP BY worker_id`;
      const [ledgerRows, clientRows] = await Promise.all([
        fy != null ? database.getAllAsync(dueSql, fy) : database.getAllAsync(dueSql),
        fy != null ? database.getAllAsync(clientSql, fy) : database.getAllAsync(clientSql),
      ]);
      for (const r of ledgerRows || []) {
        if (r.wid == null) continue;
        const wid = String(r.wid);
        if (!out[wid]) out[wid] = emptyWorkerLedgerStats();
        const amt = Number(r.total) || 0;
        if (r.kind === "due") out[wid].dueTotal += amt;
        else {
          out[wid].payoutTotal += amt;
          out[wid].paidTotal += amt;
          out[wid].count += Number(r.cnt) || 0;
        }
      }
      for (const r of clientRows || []) {
        if (r.wid == null) continue;
        const wid = String(r.wid);
        if (!out[wid]) out[wid] = emptyWorkerLedgerStats();
        out[wid].paidTotal += Number(r.total) || 0;
        out[wid].count += Number(r.cnt) || 0;
      }
      return finalizeWorkerLedgerStats(out);
    });
  } catch (e) {
    console.warn("DB getWorkerExpenseStatsMap error:", e?.message || e);
    clearDbOnError(e);
    return {};
  }
}

/** Sum of worker payouts (سلفة / باقي راتب / مصنعية بدون عميل) for the fiscal year. */
export async function getWorkerPayoutsForFiscalYear(fiscalYearId = null) {
  const fyId = fiscalYearId != null && fiscalYearId !== "" ? Number(fiscalYearId) : null;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return (state?.workerTxs || [])
        .filter((t) => t.kind !== "due" && (fyId == null || Number(t.fiscalYearId) === fyId))
        .map((t) => mapWorkerTxRow(t));
    }
    return await runDb(async (database) => {
      const fy = fyId != null && !Number.isNaN(fyId) ? fyId : await getActiveFiscalYearIdWithDb(database);
      const sql =
        fy != null
          ? "SELECT id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id FROM worker_transactions WHERE kind = 'payout' AND fiscal_year_id = ? ORDER BY date, id"
          : "SELECT id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id FROM worker_transactions WHERE kind = 'payout' ORDER BY date, id";
      const rows = fy != null ? await database.getAllAsync(sql, fy) : await database.getAllAsync(sql);
      return (rows || []).map(mapWorkerTxRow);
    });
  } catch (e) {
    console.warn("DB getWorkerPayoutsForFiscalYear error:", e?.message || e);
    return [];
  }
}

export async function getWorkerLedger(workerId, fiscalYearId = null) {
  const wid = Number(workerId);
  const fyId = fiscalYearId != null && fiscalYearId !== "" ? Number(fiscalYearId) : null;
  const empty = {
    dueTotal: 0,
    payoutTotal: 0,
    clientPaidTotal: 0,
    paidTotal: 0,
    balance: 0,
    entries: [],
  };
  if (!Number.isFinite(wid)) return empty;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const ledgerTxs = (state?.workerTxs || [])
        .map(mapWorkerTxRow)
        .filter((t) => Number(t.workerId) === wid && (fyId == null || Number(t.fiscalYearId) === fyId));
      const nameById = {};
      for (const c of state?.clients || []) nameById[c.id] = c.name || "";
      const clientEntries = [];
      for (const c of state?.clients || []) {
        if (fyId != null && Number(c.fiscalYearId) !== fyId) continue;
        for (const t of c.txs || []) {
          if (t.type !== "expense" || Number(t.workerId) !== wid) continue;
          clientEntries.push({
            id: `client-${c.id}-${t.id}`,
            source: "client",
            clientTxId: t.id,
            clientId: c.id,
            clientName: c.name || "",
            kind: "payout",
            cat: t.cat || "مصنعية",
            amount: Number(t.amount) || 0,
            note: t.note || "",
            date: t.date || "",
          });
        }
      }
      const ledgerEntries = ledgerTxs.map((t) => ({
        ...t,
        source: "ledger",
        clientName: t.clientId != null ? nameById[t.clientId] || "" : "",
      }));
      const dueTotal = ledgerTxs.filter((t) => t.kind === "due").reduce((s, t) => s + t.amount, 0);
      const payoutTotal = ledgerTxs.filter((t) => t.kind !== "due").reduce((s, t) => s + t.amount, 0);
      const clientPaidTotal = clientEntries.reduce((s, t) => s + t.amount, 0);
      const paidTotal = payoutTotal + clientPaidTotal;
      const entries = [...ledgerEntries, ...clientEntries].sort((a, b) => {
        const d = String(a.date || "").localeCompare(String(b.date || ""));
        if (d !== 0) return d;
        return String(a.id).localeCompare(String(b.id));
      });
      return { dueTotal, payoutTotal, clientPaidTotal, paidTotal, balance: dueTotal - paidTotal, entries };
    }
    return await runDb(async (database) => {
      const fy = fyId != null && !Number.isNaN(fyId) ? fyId : await getActiveFiscalYearIdWithDb(database);
      const ledgerSql =
        fy != null
          ? "SELECT id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id FROM worker_transactions WHERE worker_id = ? AND fiscal_year_id = ? ORDER BY date, id"
          : "SELECT id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id FROM worker_transactions WHERE worker_id = ? ORDER BY date, id";
      const clientSql =
        fy != null
          ? `SELECT ct.id, ct.client_id, ct.amount, ct.cat, ct.note, ct.date, c.name AS client_name
             FROM client_transactions ct
             INNER JOIN clients c ON c.id = ct.client_id
             WHERE ct.type = 'expense' AND ct.worker_id = ? AND c.fiscal_year_id = ?
             ORDER BY ct.date, ct.id`
          : `SELECT ct.id, ct.client_id, ct.amount, ct.cat, ct.note, ct.date, c.name AS client_name
             FROM client_transactions ct
             INNER JOIN clients c ON c.id = ct.client_id
             WHERE ct.type = 'expense' AND ct.worker_id = ?
             ORDER BY ct.date, ct.id`;
      const [ledgerRows, clientRows] = await Promise.all([
        fy != null ? database.getAllAsync(ledgerSql, wid, fy) : database.getAllAsync(ledgerSql, wid),
        fy != null ? database.getAllAsync(clientSql, wid, fy) : database.getAllAsync(clientSql, wid),
      ]);
      const ledgerTxs = (ledgerRows || []).map(mapWorkerTxRow);
      const clientIds = ledgerTxs.map((t) => t.clientId).filter((id) => id != null);
      const nameById = {};
      if (clientIds.length) {
        const unique = [...new Set(clientIds.map(Number))];
        const ph = unique.map(() => "?").join(",");
        const nameRows = await database.getAllAsync(`SELECT id, name FROM clients WHERE id IN (${ph})`, ...unique);
        for (const r of nameRows || []) nameById[r.id] = r.name || "";
      }
      const ledgerEntries = ledgerTxs.map((t) => ({
        ...t,
        source: "ledger",
        clientName: t.clientId != null ? nameById[t.clientId] || "" : "",
      }));
      const clientEntries = (clientRows || []).map((t) => ({
        id: `client-${t.client_id}-${t.id}`,
        source: "client",
        clientTxId: t.id,
        clientId: t.client_id,
        clientName: t.client_name || "",
        kind: "payout",
        cat: t.cat || "مصنعية",
        amount: Number(t.amount) || 0,
        note: t.note || "",
        date: t.date || "",
      }));
      const dueTotal = ledgerTxs.filter((t) => t.kind === "due").reduce((s, t) => s + t.amount, 0);
      const payoutTotal = ledgerTxs.filter((t) => t.kind !== "due").reduce((s, t) => s + t.amount, 0);
      const clientPaidTotal = clientEntries.reduce((s, t) => s + t.amount, 0);
      const paidTotal = payoutTotal + clientPaidTotal;
      const entries = [...ledgerEntries, ...clientEntries].sort((a, b) => {
        const d = String(a.date || "").localeCompare(String(b.date || ""));
        if (d !== 0) return d;
        return String(a.id).localeCompare(String(b.id));
      });
      return { dueTotal, payoutTotal, clientPaidTotal, paidTotal, balance: dueTotal - paidTotal, entries };
    });
  } catch (e) {
    console.warn("DB getWorkerLedger error:", e?.message || e);
    return empty;
  }
}

export async function upsertWorkerTx(tx) {
  if (tx == null || tx.id == null || tx.workerId == null) return;
  const row = mapWorkerTxRow(tx);
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const workerTxs = [...(state.workerTxs || [])];
      const i = workerTxs.findIndex((t) => String(t.id) === String(row.id));
      if (i >= 0) workerTxs[i] = row;
      else workerTxs.push(row);
      await setWebState({ ...state, workerTxs });
      return;
    }
    await runDb((database) =>
      database.runAsync(
        "INSERT OR REPLACE INTO worker_transactions (id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        row.id,
        row.workerId,
        row.kind,
        row.amount,
        row.cat || "",
        row.note || "",
        row.date || "",
        row.fiscalYearId ?? null,
        row.clientId ?? null
      )
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertWorkerTx error:", e.message);
    }
    clearDbOnError(e);
    throw e;
  }
}

export async function deleteWorkerTx(id) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const workerTxs = (state.workerTxs || []).filter((t) => String(t.id) !== String(id));
      await setWebState({ ...state, workerTxs });
      return;
    }
    await runDb((database) => database.runAsync("DELETE FROM worker_transactions WHERE id = ?", id));
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteWorkerTx error:", e.message);
    }
    clearDbOnError(e);
    throw e;
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
 * @param {{ nameContains?: string }} [options] — optional substring match on name or phone
 * @returns {Promise<{ suppliers: Array<object>, hasMore: boolean, total: number }>}
 */
export async function getSuppliersPage(limit = SUPPLIERS_PAGE_DEFAULT, offset = 0, options = {}) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || SUPPLIERS_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const nameQ =
    typeof options.nameContains === "string" ? String(options.nameContains).trim() : "";
  const useNameFilter = nameQ.length > 0;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let all = [...(state?.suppliers || [])];
      if (useNameFilter) {
        all = all.filter((s) => clientMatchesNameOrPhone(s, nameQ));
      }
      all.sort((a, b) => Number(b.id) - Number(a.id));
      const rows = all.slice(off, off + lim);
      return {
        suppliers: rows.map((s) => ({
          id: s.id,
          name: s.name || "",
          phone: s.phone || "",
          category: s.category || "",
        })),
        hasMore: off + rows.length < all.length,
        total: all.length,
      };
    }
    return await runDb(async (database) => {
      const searchClause = useNameFilter ? ` WHERE ${CLIENT_SEARCH_NAME_OR_PHONE}` : "";
      const sqlBase = `SELECT id, name, phone, category FROM suppliers${searchClause} ORDER BY id DESC`;
      const countSql = `SELECT COUNT(*) AS n FROM suppliers${searchClause}`;
      const baseParams = useNameFilter ? [nameQ, nameQ] : [];
      const [countRow, rows] = await Promise.all([
        database.getFirstAsync(countSql, ...baseParams),
        database.getAllAsync(`${sqlBase} LIMIT ? OFFSET ?`, ...baseParams, lim, off),
      ]);
      const total = Number(countRow?.n) || 0;
      return {
        suppliers: (rows || []).map((r) => mapSupplierRow(r)),
        hasMore: off + (rows || []).length < total,
        total,
      };
    });
  } catch (e) {
    console.warn("DB getSuppliersPage error:", e?.message || e);
    clearDbOnError(e);
    return { suppliers: [], hasMore: false, total: 0 };
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
      const add = (sid, amount) => {
        if (sid == null) return;
        const key = String(sid);
        if (!out[key]) out[key] = { total: 0, count: 0 };
        out[key].total += Number(amount) || 0;
        out[key].count += 1;
      };
      for (const c of state?.clients || []) {
        for (const t of c.txs || []) {
          if (t.type !== "expense" || t.supplierId == null) continue;
          add(t.supplierId, t.amount);
        }
      }
      for (const m of state?.stockMovements || []) {
        if (m.direction === "out" || m.supplierId == null) continue;
        const qty = Number(m.quantity) || 0;
        const price = Number(m.unitPrice) || 0;
        add(m.supplierId, qty * price);
      }
      return out;
    }
    return await runDb(async (database) => {
      const [txRows, stockRows] = await Promise.all([
        database.getAllAsync(
          `SELECT supplier_id AS sid, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
           FROM client_transactions
           WHERE type = 'expense' AND supplier_id IS NOT NULL
           GROUP BY supplier_id`
        ),
        database.getAllAsync(
          `SELECT supplier_id AS sid, COUNT(*) AS cnt,
                  COALESCE(SUM(quantity * unit_price), 0) AS total
           FROM stock_movements
           WHERE direction = 'in' AND supplier_id IS NOT NULL
           GROUP BY supplier_id`
        ),
      ]);
      const out = {};
      const add = (r) => {
        if (r?.sid == null) return;
        const key = String(r.sid);
        if (!out[key]) out[key] = { total: 0, count: 0 };
        out[key].total += Number(r.total) || 0;
        out[key].count += Number(r.cnt) || 0;
      };
      for (const r of txRows || []) add(r);
      for (const r of stockRows || []) add(r);
      return out;
    });
  } catch (e) {
    console.warn("DB getSupplierPurchaseStatsMap error:", e?.message || e);
    clearDbOnError(e);
    return {};
  }
}

function sortSupplierPurchaseRows(a, b) {
  const d = String(b.date || "").localeCompare(String(a.date || ""));
  if (d !== 0) return d;
  return String(b.id).localeCompare(String(a.id));
}

/**
 * Purchase history for one supplier: warehouse inbound movements + client expenses.
 * @returns {Promise<Array<{ id: string, source: 'stock'|'client', date: string, material: string, unit: string, quantity: number, amount: number, detail: string }>>}
 */
export async function getSupplierPurchaseHistory(supplierId, options = {}) {
  if (supplierId == null) return [];
  const sid = supplierId;
  const fyId =
    options.fiscalYearId != null && options.fiscalYearId !== ""
      ? Number(options.fiscalYearId)
      : null;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      const items = {};
      for (const it of state?.stockItems || []) items[String(it.id)] = it;
      const rows = [];
      for (const m of state?.stockMovements || []) {
        if (String(m.supplierId) !== String(sid)) continue;
        if (m.direction === "out") continue;
        if (fyId != null && Number(m.fiscalYearId) !== fyId) continue;
        const item = items[String(m.itemId)] || {};
        const qty = Number(m.quantity) || 0;
        const price = Number(m.unitPrice) || 0;
        rows.push({
          id: `stock-${m.id}`,
          source: "stock",
          date: m.date || "",
          material: item.name || "صنف",
          unit: item.unit || "",
          quantity: qty,
          amount: qty * price,
          detail: "",
        });
      }
      for (const c of state?.clients || []) {
        if (fyId != null && Number(c.fiscalYearId) !== fyId) continue;
        for (const t of c.txs || []) {
          if (t.type !== "expense" || String(t.supplierId) !== String(sid)) continue;
          rows.push({
            id: `client-${c.id}-${t.id}`,
            source: "client",
            date: t.date || "",
            material: t.cat || "مشتريات",
            unit: "",
            quantity: 0,
            amount: Number(t.amount) || 0,
            detail: c.name || "",
          });
        }
      }
      return rows.sort(sortSupplierPurchaseRows);
    }
    return await runDb(async (database) => {
      const fyStock = fyId != null ? " AND m.fiscal_year_id = ?" : "";
      const fyClient = fyId != null ? " AND c.fiscal_year_id = ?" : "";
      const stockParams = fyId != null ? [sid, fyId] : [sid];
      const clientParams = fyId != null ? [sid, fyId] : [sid];
      const [stockRows, clientRows] = await Promise.all([
        database.getAllAsync(
          `SELECT m.id, m.date, m.quantity, m.unit_price, i.name AS item_name, i.unit
           FROM stock_movements m
           LEFT JOIN stock_items i ON i.id = m.item_id
           WHERE m.supplier_id = ? AND m.direction = 'in'${fyStock}
           ORDER BY m.date DESC, m.id DESC`,
          ...stockParams
        ),
        database.getAllAsync(
          `SELECT ct.id, ct.client_id, ct.date, ct.amount, ct.cat, c.name AS client_name
           FROM client_transactions ct
           INNER JOIN clients c ON c.id = ct.client_id
           WHERE ct.supplier_id = ? AND ct.type = 'expense'${fyClient}
           ORDER BY ct.date DESC, ct.id DESC`,
          ...clientParams
        ),
      ]);
      const rows = [];
      for (const r of stockRows || []) {
        const qty = Number(r.quantity) || 0;
        rows.push({
          id: `stock-${r.id}`,
          source: "stock",
          date: r.date || "",
          material: r.item_name || "صنف",
          unit: r.unit || "",
          quantity: qty,
          amount: qty * (Number(r.unit_price) || 0),
          detail: "",
        });
      }
      for (const r of clientRows || []) {
        rows.push({
          id: `client-${r.client_id}-${r.id}`,
          source: "client",
          date: r.date || "",
          material: r.cat || "مشتريات",
          unit: "",
          quantity: 0,
          amount: Number(r.amount) || 0,
          detail: r.client_name || "",
        });
      }
      return rows.sort(sortSupplierPurchaseRows);
    });
  } catch (e) {
    console.warn("DB getSupplierPurchaseHistory error:", e?.message || e);
    clearDbOnError(e);
    return [];
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
        workerTxs: data.workerTxs || [],
      });
      return;
    }
    await runDb(async (database) => {
      for (const c of data.clients || []) {
        await database.runAsync(
          "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at, fiscal_year_id, order_amount, phone, delivery_date, reminder_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ...clientWriteValues(c)
        );
        await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", c.id);
        for (const t of c.txs || []) {
          await database.runAsync(
            "INSERT INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id, stock_item_id, stock_quantity, stock_movement_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            t.id,
            c.id,
            ...mapClientTxToDb(t).slice(1)
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
      for (const t of data.workerTxs || []) {
        await database.runAsync(
          "INSERT OR REPLACE INTO worker_transactions (id, worker_id, kind, amount, cat, note, date, fiscal_year_id, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          t.id,
          t.workerId,
          t.kind === "due" ? "due" : "payout",
          t.amount,
          t.cat || "",
          t.note || "",
          t.date || "",
          t.fiscalYearId ?? null,
          t.clientId ?? null
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
      const deliveryDate = normalizeDeliveryDate(client.deliveryDate);
      const next = {
        ...client,
        txs: client.txs || [],
        deliveryDate,
        reminderDays: normalizeReminderDays(client.reminderDays, deliveryDate),
      };
      const clients = [...state.clients];
      if (idx >= 0) clients[idx] = next;
      else clients.push(next);
      await setWebState({ ...state, clients });
      return;
    }
    await runDb(async (database) => {
      await database.runAsync(
        "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at, fiscal_year_id, order_amount, phone, delivery_date, reminder_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ...clientWriteValues(client)
      );
      await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", client.id);
      for (const t of client.txs || []) {
        await database.runAsync(
          "INSERT INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id, stock_item_id, stock_quantity, stock_movement_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          t.id,
          client.id,
          ...mapClientTxToDb(t).slice(1)
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
      const client = (state.clients || []).find((c) => String(c.id) === String(id));
      const hasTxs = (client?.txs || []).length > 0;
      const hasStock = (state.stockMovements || []).some((m) => String(m.clientId) === String(id));
      throwIfBlocked(hasTxs || hasStock, CLIENT_DELETE_BLOCKED_MSG);
      const clients = state.clients.filter((c) => String(c.id) !== String(id));
      await setWebState({ ...state, clients });
      return;
    }
    await runDb(async (database) => {
      const tx = await database.getFirstAsync(
        "SELECT id FROM client_transactions WHERE client_id = ? LIMIT 1",
        id
      );
      const mov = tx
        ? null
        : await database.getFirstAsync(
            "SELECT id FROM stock_movements WHERE client_id = ? LIMIT 1",
            id
          );
      throwIfBlocked(!!tx || !!mov, CLIENT_DELETE_BLOCKED_MSG);
      await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", id);
      await database.runAsync("DELETE FROM clients WHERE id = ?", id);
    });
  } catch (e) {
    if (e?.code === DELETE_BLOCKED) throw e;
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
          stockItemId: tx.stockItemId,
          stockQuantity: tx.stockQuantity,
          stockMovementId: tx.stockMovementId,
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
        "INSERT OR REPLACE INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id, stock_item_id, stock_quantity, stock_movement_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        tx.id,
        clientId,
        ...mapClientTxToDb(tx).slice(1)
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
      let movementId = null;
      const clients = state.clients.map((c) => {
        if (String(c.id) !== String(clientId)) return c;
        const tx = (c.txs || []).find((t) => String(t.id) === String(txId));
        if (tx?.stockMovementId != null) movementId = tx.stockMovementId;
        const txs = (c.txs || []).filter((t) => String(t.id) !== String(txId));
        return { ...c, txs };
      });
      let stockMovements = state.stockMovements || [];
      if (movementId != null) {
        stockMovements = stockMovements.filter((m) => String(m.id) !== String(movementId));
      }
      await setWebState({ ...state, clients, stockMovements });
      return;
    }
    await runDb(async (database) => {
      const row = await database.getFirstAsync(
        "SELECT stock_movement_id FROM client_transactions WHERE client_id = ? AND id = ?",
        clientId,
        txId
      );
      if (row?.stock_movement_id != null) {
        await database.runAsync("DELETE FROM stock_movements WHERE id = ?", row.stock_movement_id);
      }
      await database.runAsync("DELETE FROM client_transactions WHERE client_id = ? AND id = ?", clientId, txId);
    });
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
      const hasLedger = (state.workerTxs || []).some((t) => String(t.workerId) === String(id));
      const hasClientTx = (state.clients || []).some((c) =>
        (c.txs || []).some((t) => String(t.workerId) === String(id))
      );
      throwIfBlocked(hasLedger || hasClientTx, WORKER_DELETE_BLOCKED_MSG);
      const workers = (state.workers || []).filter((w) => String(w.id) !== String(id));
      const workerTxs = (state.workerTxs || []).filter((t) => String(t.workerId) !== String(id));
      await setWebState({ ...state, workers, workerTxs });
      return;
    }
    await runDb(async (database) => {
      const ledger = await database.getFirstAsync(
        "SELECT id FROM worker_transactions WHERE worker_id = ? LIMIT 1",
        id
      );
      const clientTx = ledger
        ? null
        : await database.getFirstAsync(
            "SELECT id FROM client_transactions WHERE worker_id = ? LIMIT 1",
            id
          );
      throwIfBlocked(!!ledger || !!clientTx, WORKER_DELETE_BLOCKED_MSG);
      await database.runAsync("DELETE FROM worker_transactions WHERE worker_id = ?", id);
      await database.runAsync("DELETE FROM workers WHERE id = ?", id);
    });
  } catch (e) {
    if (e?.code === DELETE_BLOCKED) throw e;
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
      const hasStock = (state.stockMovements || []).some((m) => String(m.supplierId) === String(id));
      const hasClientTx = (state.clients || []).some((c) =>
        (c.txs || []).some((t) => String(t.supplierId) === String(id))
      );
      throwIfBlocked(hasStock || hasClientTx, SUPPLIER_DELETE_BLOCKED_MSG);
      const suppliers = (state.suppliers || []).filter((s) => String(s.id) !== String(id));
      await setWebState({ ...state, suppliers });
      return;
    }
    await runDb(async (database) => {
      const mov = await database.getFirstAsync(
        "SELECT id FROM stock_movements WHERE supplier_id = ? LIMIT 1",
        id
      );
      const clientTx = mov
        ? null
        : await database.getFirstAsync(
            "SELECT id FROM client_transactions WHERE supplier_id = ? LIMIT 1",
            id
          );
      throwIfBlocked(!!mov || !!clientTx, SUPPLIER_DELETE_BLOCKED_MSG);
      await database.runAsync("DELETE FROM suppliers WHERE id = ?", id);
    });
  } catch (e) {
    if (e?.code === DELETE_BLOCKED) throw e;
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
        stockItems: (state && state.stockItems) || [],
        stockMovements: (state && state.stockMovements) || [],
        workerTxs: (state && state.workerTxs) || [],
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

// ---------- Stock / warehouse ----------

async function getStockItemsWithDb(database) {
  try {
    const rows = await database.getAllAsync(
      "SELECT id, name, unit, expense_cat, unit_price FROM stock_items ORDER BY name"
    );
    return rows.map(mapStockItemRow);
  } catch (_) {
    const rows = await database.getAllAsync(
      "SELECT id, name, unit, expense_cat FROM stock_items ORDER BY name"
    );
    return rows.map(mapStockItemRow);
  }
}

async function getStockMovementsWithDb(database, itemId = null) {
  const sql =
    itemId != null
      ? "SELECT id, item_id, direction, quantity, unit_price, supplier_id, client_id, client_tx_id, note, date, fiscal_year_id FROM stock_movements WHERE item_id = ? ORDER BY date, id"
      : "SELECT id, item_id, direction, quantity, unit_price, supplier_id, client_id, client_tx_id, note, date, fiscal_year_id FROM stock_movements ORDER BY date DESC, id DESC";
  const rows =
    itemId != null
      ? await database.getAllAsync(sql, itemId)
      : await database.getAllAsync(sql);
  return rows.map(mapStockMovementRow);
}

export async function getStockItems() {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      return (state?.stockItems || []).map(mapStockItemRow);
    }
    return await runDb(getStockItemsWithDb);
  } catch (e) {
    console.warn("getStockItems:", e?.message || e);
    return [];
  }
}

/** @returns {Promise<Array<{ item: object, quantity: number, avgCost: number, totalValue: number, received: number }>>} */
export async function getStockItemsWithBalance() {
  try {
    const items = await getStockItems();
    if (IS_WEB) {
      const state = await getWebState();
      const movements = state?.stockMovements || [];
      return items.map((item) => {
        const itemMovs = movements.filter((m) => Number(m.itemId) === Number(item.id));
        const bal = computeStockBalance(itemMovs);
        const avgCost = displayUnitCost(item, bal.avgCost);
        return {
          item,
          quantity: bal.quantity,
          avgCost,
          avgPurchase: Number(bal.avgPurchase) || 0,
          totalValue: bal.quantity * avgCost,
          received: bal.receivedQty || 0,
        };
      });
    }
    return await runDb(async (database) => {
      const allMovs = await getStockMovementsWithDb(database);
      return items.map((item) => {
        const itemMovs = allMovs.filter((m) => Number(m.itemId) === Number(item.id));
        const bal = computeStockBalance(itemMovs);
        const avgCost = displayUnitCost(item, bal.avgCost);
        return {
          item,
          quantity: bal.quantity,
          avgCost,
          avgPurchase: Number(bal.avgPurchase) || 0,
          totalValue: bal.quantity * avgCost,
          received: bal.receivedQty || 0,
        };
      });
    });
  } catch (e) {
    console.warn("getStockItemsWithBalance:", e?.message || e);
    return [];
  }
}

function sortStockMovementsDesc(a, b) {
  const d = String(b.date || "").localeCompare(String(a.date || ""));
  if (d !== 0) return d;
  return Number(b.id) - Number(a.id);
}

export async function getStockMovements(itemId = null, fiscalYearId = null) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let list = state?.stockMovements || [];
      if (itemId != null) list = list.filter((m) => Number(m.itemId) === Number(itemId));
      if (fiscalYearId != null) {
        const fy = Number(fiscalYearId);
        list = list.filter((m) => Number(m.fiscalYearId) === fy);
      }
      return [...list].sort(sortStockMovementsDesc);
    }
    return await runDb(async (database) => {
      let list = await getStockMovementsWithDb(database, itemId);
      if (fiscalYearId != null) {
        const fy = Number(fiscalYearId);
        list = list.filter((m) => Number(m.fiscalYearId) === fy);
      }
      return list.sort(sortStockMovementsDesc);
    });
  } catch (e) {
    console.warn("getStockMovements:", e?.message || e);
    return [];
  }
}

const STOCK_MOVEMENTS_PAGE_DEFAULT = 15;

/**
 * Paginated stock movements (newest first) for warehouse activity list.
 * @returns {Promise<{ movements: object[], hasMore: boolean }>}
 */
export async function getStockMovementsPage(
  fiscalYearId = null,
  limit = STOCK_MOVEMENTS_PAGE_DEFAULT,
  offset = 0,
  itemId = null
) {
  const lim = Math.min(50, Math.max(1, Math.floor(Number(limit)) || STOCK_MOVEMENTS_PAGE_DEFAULT));
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  const take = lim + 1;
  try {
    if (IS_WEB) {
      const state = await getWebState();
      let list = state?.stockMovements || [];
      if (itemId != null) list = list.filter((m) => Number(m.itemId) === Number(itemId));
      if (fiscalYearId != null) {
        const fy = Number(fiscalYearId);
        list = list.filter((m) => Number(m.fiscalYearId) === fy);
      }
      list = [...list].sort(sortStockMovementsDesc);
      const slice = list.slice(off, off + take);
      const hasMore = slice.length > lim;
      const movements = hasMore ? slice.slice(0, lim) : slice;
      return { movements, hasMore };
    }
    return await runDb(async (database) => {
      const clauses = [];
      const params = [];
      if (itemId != null) {
        clauses.push("item_id = ?");
        params.push(itemId);
      }
      if (fiscalYearId != null) {
        clauses.push("fiscal_year_id = ?");
        params.push(Number(fiscalYearId));
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = await database.getAllAsync(
        `SELECT id, item_id, direction, quantity, unit_price, supplier_id, client_id, client_tx_id, note, date, fiscal_year_id
         FROM stock_movements ${where}
         ORDER BY date DESC, id DESC
         LIMIT ? OFFSET ?`,
        ...params,
        take,
        off
      );
      const hasMore = rows.length > lim;
      const pageRows = hasMore ? rows.slice(0, lim) : rows;
      return { movements: pageRows.map(mapStockMovementRow), hasMore };
    });
  } catch (e) {
    console.warn("getStockMovementsPage:", e?.message || e);
    return { movements: [], hasMore: false };
  }
}

export async function upsertStockItem(item) {
  if (!item?.name) return null;
  const id = item.id != null ? item.id : Date.now();
  const row = {
    id,
    name: String(item.name).trim(),
    unit: item.unit || "count",
    expenseCat: item.expenseCat || "أخرى",
    unitPrice: item.unitPrice != null && Number(item.unitPrice) > 0 ? Number(item.unitPrice) : null,
  };
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return null;
      const stockItems = [...(state.stockItems || [])];
      const i = stockItems.findIndex((x) => String(x.id) === String(id));
      if (i >= 0) stockItems[i] = row;
      else stockItems.push(row);
      await setWebState({ ...state, stockItems });
      return row;
    }
    await runDb((database) =>
      database.runAsync(
        "INSERT OR REPLACE INTO stock_items (id, name, unit, expense_cat, unit_price) VALUES (?, ?, ?, ?, ?)",
        row.id,
        row.name,
        row.unit,
        row.expenseCat,
        row.unitPrice
      )
    );
    return row;
  } catch (e) {
    console.warn("upsertStockItem:", e?.message || e);
    throw e;
  }
}

export async function deleteStockItem(itemId) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const hasMov = (state.stockMovements || []).some((m) => Number(m.itemId) === Number(itemId));
      if (hasMov) throw new Error("HAS_MOVEMENTS");
      const stockItems = (state.stockItems || []).filter((x) => String(x.id) !== String(itemId));
      await setWebState({ ...state, stockItems });
      return;
    }
    await runDb(async (database) => {
      const c = await database.getFirstAsync(
        "SELECT COUNT(*) AS n FROM stock_movements WHERE item_id = ?",
        itemId
      );
      if ((c?.n ?? 0) > 0) throw new Error("HAS_MOVEMENTS");
      await database.runAsync("DELETE FROM stock_items WHERE id = ?", itemId);
    });
  } catch (e) {
    if (e?.message === "HAS_MOVEMENTS") throw e;
    console.warn("deleteStockItem:", e?.message || e);
    throw e;
  }
}

/**
 * @returns {Promise<{ movementId: number, totalCost: number }>}
 */
export async function recordStockPurchase({
  itemId,
  supplierId,
  quantity,
  unitPrice,
  date,
  note,
  fiscalYearId,
}) {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  if (!(qty > 0) || !(price >= 0)) throw new Error("INVALID_INPUT");
  const movementId = Date.now();
  const mov = {
    id: movementId,
    itemId,
    direction: "in",
    quantity: qty,
    unitPrice: price,
    supplierId: supplierId ?? null,
    clientId: null,
    clientTxId: null,
    note: note || "",
    date: date || new Date().toISOString().split("T")[0],
    fiscalYearId: fiscalYearId ?? null,
  };
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) throw new Error("NO_STATE");
      await setWebState({
        ...state,
        stockMovements: [...(state.stockMovements || []), mov],
      });
      return { movementId, totalCost: qty * price };
    }
    await runDb((database) =>
      database.runAsync(
        `INSERT INTO stock_movements (id, item_id, direction, quantity, unit_price, supplier_id, client_id, client_tx_id, note, date, fiscal_year_id)
         VALUES (?, ?, 'in', ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        mov.id,
        mov.itemId,
        mov.quantity,
        mov.unitPrice,
        mov.supplierId,
        mov.note,
        mov.date,
        mov.fiscalYearId
      )
    );
    return { movementId, totalCost: qty * price };
  } catch (e) {
    console.warn("recordStockPurchase:", e?.message || e);
    throw e;
  }
}

/**
 * Issue stock to client: creates stock movement + client expense tx.
 * @returns {Promise<{ movementId: number, clientTxId: number, amount: number }>}
 */
export async function recordStockIssue({
  itemId,
  clientId,
  quantity,
  date,
  note,
  fiscalYearId,
  supplierId,
}) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw new Error("INVALID_INPUT");
  const items = await getStockItems();
  const item = items.find((x) => Number(x.id) === Number(itemId));
  if (!item) throw new Error("ITEM_NOT_FOUND");

  let itemMovements;
  if (IS_WEB) {
    const state = await getWebState();
    itemMovements = (state?.stockMovements || []).filter((m) => Number(m.itemId) === Number(itemId));
  } else {
    itemMovements = await runDb((db) => getStockMovementsWithDb(db, itemId));
  }
  if (!canIssueQuantity(itemMovements, qty)) throw new Error("INSUFFICIENT_STOCK");
  const amount =
    Number(item.unitPrice) > 0 ? qty * Number(item.unitPrice) : issueCostAmount(itemMovements, qty);
  const movementId = Date.now();
  const clientTxId = movementId + 1;
  const issueDate = date || new Date().toISOString().split("T")[0];
  const unitLabel = getStockUnitLabel(item.unit);
  const noteText =
    (note ? `${note} — ` : "") +
    `من المخزن: ${qty} ${unitLabel} — ${item.name}`;

  const mov = {
    id: movementId,
    itemId,
    direction: "out",
    quantity: qty,
    unitPrice: amount / qty,
    supplierId: supplierId ?? null,
    clientId,
    clientTxId,
    note: note || "",
    date: issueDate,
    fiscalYearId: fiscalYearId ?? null,
  };

  const tx = {
    id: clientTxId,
    type: "expense",
    amount,
    cat: item.expenseCat || "أخرى",
    note: noteText,
    date: issueDate,
    supplierId: supplierId ?? null,
    stockItemId: itemId,
    stockQuantity: qty,
    stockMovementId: movementId,
  };

  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) throw new Error("NO_STATE");
      const clients = state.clients.map((c) => {
        if (String(c.id) !== String(clientId)) return c;
        return { ...c, txs: [...(c.txs || []), tx] };
      });
      await setWebState({
        ...state,
        clients,
        stockMovements: [...(state.stockMovements || []), mov],
      });
      return { movementId, clientTxId, amount };
    }
    await runDb(async (database) => {
      await database.runAsync(
        `INSERT INTO stock_movements (id, item_id, direction, quantity, unit_price, supplier_id, client_id, client_tx_id, note, date, fiscal_year_id)
         VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?)`,
        mov.id,
        mov.itemId,
        mov.quantity,
        mov.unitPrice,
        mov.supplierId,
        mov.clientId,
        mov.clientTxId,
        mov.note,
        mov.date,
        mov.fiscalYearId
      );
      await database.runAsync(
        `INSERT INTO client_transactions (id, client_id, type, amount, cat, note, date, worker_id, supplier_id, stock_item_id, stock_quantity, stock_movement_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        tx.id,
        clientId,
        tx.type,
        tx.amount,
        tx.cat,
        tx.note,
        tx.date,
        tx.supplierId,
        tx.stockItemId,
        tx.stockQuantity,
        tx.stockMovementId
      );
    });
    return { movementId, clientTxId, amount };
  } catch (e) {
    console.warn("recordStockIssue:", e?.message || e);
    throw e;
  }
}

/**
 * Update an existing stock movement. Purchase: quantity/price/supplier/date/note.
 * Issue: quantity/client/date/note (unit price recomputed) and linked client tx.
 */
export async function updateStockMovement({
  movementId,
  quantity,
  unitPrice,
  supplierId,
  clientId,
  date,
  note,
}) {
  const qty = Number(quantity);
  if (!(qty > 0) || movementId == null) throw new Error("INVALID_INPUT");
  const nextDate = date || new Date().toISOString().split("T")[0];
  const nextNote = note || "";

  const loadNative = async (database) => {
    const row = await database.getFirstAsync(
      "SELECT id, item_id, direction, quantity, unit_price, supplier_id, client_id, client_tx_id, note, date, fiscal_year_id FROM stock_movements WHERE id = ?",
      movementId
    );
    return row ? mapStockMovementRow(row) : null;
  };

  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) throw new Error("NO_STATE");
      const mov = (state.stockMovements || []).find((m) => String(m.id) === String(movementId));
      if (!mov) throw new Error("NOT_FOUND");
      const itemMovements = (state.stockMovements || []).filter(
        (m) => Number(m.itemId) === Number(mov.itemId)
      );
      const item = (state.stockItems || []).find((x) => Number(x.id) === Number(mov.itemId));
      const patched = patchStockMovement(mov, itemMovements, item, {
        qty,
        unitPrice,
        supplierId,
        clientId,
        nextDate,
        nextNote,
      });
      const stockMovements = (state.stockMovements || []).map((m) =>
        String(m.id) === String(movementId) ? patched.mov : m
      );
      let clients = state.clients;
      if (patched.clientTx) {
        clients = (state.clients || []).map((c) => {
          const txs = (c.txs || []).filter(
            (t) => String(t.id) !== String(patched.clientTx.id)
          );
          if (String(c.id) === String(patched.clientTx.clientId)) {
            return { ...c, txs: [...txs, patched.clientTx.tx] };
          }
          return { ...c, txs };
        });
      }
      await setWebState({ ...state, stockMovements, clients });
      return patched.mov;
    }

    return await runDb(async (database) => {
      const mov = await loadNative(database);
      if (!mov) throw new Error("NOT_FOUND");
      const itemMovements = await getStockMovementsWithDb(database, mov.itemId);
      const items = await getStockItemsWithDb(database);
      const item = items.find((x) => Number(x.id) === Number(mov.itemId));
      const patched = patchStockMovement(mov, itemMovements, item, {
        qty,
        unitPrice,
        supplierId,
        clientId,
        nextDate,
        nextNote,
      });
      await database.runAsync(
        `UPDATE stock_movements
         SET quantity = ?, unit_price = ?, supplier_id = ?, client_id = ?, note = ?, date = ?
         WHERE id = ?`,
        patched.mov.quantity,
        patched.mov.unitPrice,
        patched.mov.supplierId,
        patched.mov.clientId,
        patched.mov.note,
        patched.mov.date,
        movementId
      );
      if (patched.clientTx) {
        const t = patched.clientTx.tx;
        await database.runAsync(
          `UPDATE client_transactions
           SET client_id = ?, amount = ?, cat = ?, note = ?, date = ?, stock_quantity = ?
           WHERE id = ?`,
          patched.clientTx.clientId,
          t.amount,
          t.cat,
          t.note,
          t.date,
          t.stockQuantity,
          t.id
        );
      }
      return patched.mov;
    });
  } catch (e) {
    console.warn("updateStockMovement:", e?.message || e);
    throw e;
  }
}

function patchStockMovement(mov, itemMovements, item, { qty, unitPrice, supplierId, clientId, nextDate, nextNote }) {
  if (mov.direction === "in") {
    const price = Number(unitPrice);
    if (!(price >= 0)) throw new Error("INVALID_INPUT");
    const remaining = computeStockBalance(itemMovements).quantity - Number(mov.quantity) + qty;
    if (remaining < -1e-9) throw new Error("WOULD_GO_NEGATIVE");
    return {
      mov: {
        ...mov,
        quantity: qty,
        unitPrice: price,
        supplierId: supplierId ?? null,
        date: nextDate,
        note: nextNote,
      },
      clientTx: null,
    };
  }

  if (clientId == null) throw new Error("INVALID_INPUT");
  const others = (itemMovements || []).filter((m) => String(m.id) !== String(mov.id));
  if (!canIssueQuantity(others, qty)) throw new Error("INSUFFICIENT_STOCK");
  const amount =
    Number(item?.unitPrice) > 0 ? qty * Number(item.unitPrice) : issueCostAmount(others, qty);
  const nextUnit = qty > 0 ? amount / qty : 0;
  const unitLabel = getStockUnitLabel(item?.unit);
  const noteText =
    (nextNote ? `${nextNote} — ` : "") +
    `من المخزن: ${qty} ${unitLabel} — ${item?.name || "صنف"}`;
  const tx = {
    id: mov.clientTxId,
    type: "expense",
    amount,
    cat: item?.expenseCat || "أخرى",
    note: noteText,
    date: nextDate,
    supplierId: mov.supplierId ?? null,
    stockItemId: mov.itemId,
    stockQuantity: qty,
    stockMovementId: mov.id,
  };
  return {
    mov: {
      ...mov,
      quantity: qty,
      unitPrice: nextUnit,
      clientId,
      date: nextDate,
      note: nextNote,
    },
    clientTx: mov.clientTxId != null ? { clientId, tx } : null,
  };
}

export async function deleteStockMovement(movementId) {
  try {
    if (IS_WEB) {
      const state = await getWebState();
      if (!state) return;
      const mov = (state.stockMovements || []).find((m) => String(m.id) === String(movementId));
      if (!mov) return;
      let clients = state.clients;
      if (mov.direction === "out" && mov.clientTxId != null && mov.clientId != null) {
        clients = clients.map((c) => {
          if (String(c.id) !== String(mov.clientId)) return c;
          return {
            ...c,
            txs: (c.txs || []).filter((t) => String(t.id) !== String(mov.clientTxId)),
          };
        });
      }
      const stockMovements = (state.stockMovements || []).filter(
        (m) => String(m.id) !== String(movementId)
      );
      await setWebState({ ...state, clients, stockMovements });
      return;
    }
    await runDb(async (database) => {
      const mov = await database.getFirstAsync(
        "SELECT direction, client_id, client_tx_id FROM stock_movements WHERE id = ?",
        movementId
      );
      if (!mov) return;
      if (mov.direction === "out" && mov.client_tx_id != null) {
        await database.runAsync(
          "DELETE FROM client_transactions WHERE client_id = ? AND id = ?",
          mov.client_id,
          mov.client_tx_id
        );
      }
      await database.runAsync("DELETE FROM stock_movements WHERE id = ?", movementId);
    });
  } catch (e) {
    console.warn("deleteStockMovement:", e?.message || e);
    throw e;
  }
}

/**
 * @returns {Promise<{ inventoryValue: number, fyPurchases: number, fyIssued: number, fyIssuedQty: number }>}
 */
export async function getStockDashboardStats(fiscalYearId) {
  try {
    const balances = await getStockItemsWithBalance();
    const inventoryValue = balances.reduce((s, b) => s + (b.totalValue || 0), 0);
    const fyId = fiscalYearId != null ? Number(fiscalYearId) : null;
    const movs = await getStockMovements(null, fyId);
    let fyPurchases = 0;
    let fyIssued = 0;
    for (const m of movs) {
      const q = Number(m.quantity) || 0;
      const p = Number(m.unitPrice) || 0;
      if (m.direction === "in") fyPurchases += q * p;
      else fyIssued += q * p;
    }
    return { inventoryValue, fyPurchases, fyIssued };
  } catch (e) {
    console.warn("getStockDashboardStats:", e?.message || e);
    return { inventoryValue: 0, fyPurchases: 0, fyIssued: 0 };
  }
}

/**
 * Serialized payload for cloud backup: SQLite bytes on native; JSON snapshot on web.
 * @returns {Promise<{ bytes: Uint8Array, extension: string } | null>}
 */
const SQLITE_HEADER = "SQLite format 3\u0000";

function isSqliteBackupBytes(bytes) {
  if (!bytes || bytes.length < 16) return false;
  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

function isJsonBackupBytes(bytes) {
  if (!bytes || bytes.length < 2) return false;
  const c = bytes[0];
  return c === 0x7b || c === 0x5b; // { or [
}

async function restoreWebStateFromJsonBackup(bytes) {
  const text = new TextDecoder().decode(bytes);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("ملف النسخة غير صالح (JSON).");
  }
  if (payload?.v !== 1) {
    throw new Error("إصدار النسخة الاحتياطية غير مدعوم.");
  }
  await setWebState({
    clients: payload.clients || [],
    generalTxs: payload.generalTxs || [],
    workers: payload.workers || [],
    suppliers: payload.suppliers || [],
    activeFY: payload.activeFY ?? null,
    activeFiscalYearId:
      payload.activeFiscalYearId != null ? Number(payload.activeFiscalYearId) : null,
    customFYs: payload.customFYs || [],
    nissabPrice: payload.nissabPrice != null ? Number(payload.nissabPrice) : 85000,
    stockItems: payload.stockItems || [],
    stockMovements: payload.stockMovements || [],
    workerTxs: payload.workerTxs || [],
  });
}

async function restoreNativeDatabaseFromBytes(bytes) {
  if (!isSqliteBackupBytes(bytes)) {
    throw new Error("ملف قاعدة البيانات غير صالح (.db).");
  }
  const SQLite = require("expo-sqlite");
  if (rawDb) {
    try {
      await rawDb.closeAsync();
    } catch (_) {
      /* ignore */
    }
    rawDb = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch (_) {
    /* ignore */
  }

  const memDb = await SQLite.deserializeDatabaseAsync(bytes);
  const fileDb = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    await SQLite.backupDatabaseAsync({
      sourceDatabase: memDb,
      sourceDatabaseName: "main",
      destDatabase: fileDb,
      destDatabaseName: "main",
    });
  } finally {
    await memDb.closeAsync();
    await fileDb.closeAsync();
    rawDb = null;
  }
}

/**
 * Replace local app data with a backup downloaded from Drive.
 * @param {Uint8Array} bytes
 * @param {string} [fileName] Used to detect .db vs .json
 */
export async function restoreDatabaseFromBackup(bytes, fileName = "") {
  const name = String(fileName || "").toLowerCase();
  const work = dbQueue.then(async () => {
    if (IS_WEB) {
      if (!name.endsWith(".json") && !isJsonBackupBytes(bytes)) {
        throw new Error("على الويب استعد ملفات .json فقط.");
      }
      await restoreWebStateFromJsonBackup(bytes);
      return;
    }
    if (name.endsWith(".json") || (!name.endsWith(".db") && isJsonBackupBytes(bytes))) {
      throw new Error("ملف JSON للويب — استعده من متصفح التطبيق.");
    }
    await restoreNativeDatabaseFromBytes(bytes);
  });
  dbQueue = work.catch(() => {});
  return work;
}

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
        stockItems: state.stockItems || [],
        stockMovements: state.stockMovements || [],
        workerTxs: state.workerTxs || [],
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
