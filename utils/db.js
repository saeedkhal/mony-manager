import { Platform } from "react-native";

const IS_WEB = Platform.OS === "web";
const DB_NAME = "mall_v4.db";
const WEB_STORAGE_KEY = "mall_v4";
let db = null;

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

async function getDb() {
  if (IS_WEB) return null;
  if (db) return db;
  const SQLite = require("expo-sqlite");
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await initSchema(db);
    return db;
  } catch (e) {
    db = null;
    throw e;
  }
}

function isNativeDbInvalidError(e) {
  const msg = e?.message ?? "";
  return (
    msg.includes("Native module is null") ||
    msg.includes("NullPointerException") ||
    msg.includes("prepareAsync") ||
    msg.includes("has been rejected")
  );
}

/** Run a DB operation; on native-invalid error, clear cache and retry once. */
async function withDbRetry(fn) {
  let database = await getDb();
  if (!database) return null;
  try {
    return await fn(database);
  } catch (e) {
    if (isNativeDbInvalidError(e)) {
      db = null;
      database = await getDb();
      if (!database) throw e;
      return await fn(database);
    }
    throw e;
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
  `);
}

function rowToClient(c, txRows) {
  return {
    id: c.id,
    name: c.name,
    project: c.project || "",
    status: c.status || "active",
    note: c.note || "",
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
    const database = await getDb();
    if (!database) return getWebState();

    const clientsRows = await database.getAllAsync(
      "SELECT id, name, project, status, note, created_at FROM clients ORDER BY id"
    );
    const txRows = await database.getAllAsync(
      "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions ORDER BY client_id, id"
    );
    const generalRows = await database.getAllAsync("SELECT id, amount, cat, note, date FROM general ORDER BY id");
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

    const clients = clientsRows.map((c) => rowToClient(c, txRows));
    const generalTxs = generalRows.map((r) => ({
      id: r.id,
      amount: r.amount,
      cat: r.cat,
      note: r.note || "",
      date: r.date,
    }));
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

    return {
      clients,
      generalTxs,
      workers,
      suppliers,
      activeFY: settings.activeFY || null,
      customFYs: settings.customFYs ? JSON.parse(settings.customFYs) : [],
      nissabPrice: settings.nissabPrice != null ? Number(settings.nissabPrice) : null,
    };
  } catch (e) {
    console.warn("DB getFullState error:", e?.message || e);
    return null;
  }
}

// ---------- Targeted getters (fetch only what you need) ----------

/** Get all clients with their txs. Returns [] on error. On web reads from AsyncStorage. */
export async function getClients() {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      return state ? state.clients : [];
    }

    const clientsRows = await database.getAllAsync(
      "SELECT id, name, project, status, note, created_at FROM clients ORDER BY id"
    );
    const txRows = await database.getAllAsync(
      "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions ORDER BY client_id, id"
    );
    return clientsRows.map((c) => rowToClient(c, txRows));
  } catch (e) {
    console.warn("DB getClients error:", e?.message || e);
    return [];
  }
}

/** Get one client with txs by id. Returns null if not found or error. On web reads from AsyncStorage. */
export async function getClientWithTxs(clientId) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      if (!state) return null;
      const c = state.clients.find((x) => String(x.id) === String(clientId));
      return c || null;
    }

    const clientRows = await database.getAllAsync(
      "SELECT id, name, project, status, note, created_at FROM clients WHERE id = ?",
      clientId
    );
    if (clientRows.length === 0) return null;
    const txRows = await database.getAllAsync(
      "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_transactions WHERE client_id = ? ORDER BY id",
      clientId
    );
    return rowToClient(clientRows[0], txRows);
  } catch (e) {
    console.warn("DB getClientWithTxs error:", e?.message || e);
    return null;
  }
}

/** Get all general txs. Returns [] on error. On web reads from AsyncStorage. */
export async function getGeneralTxs() {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      return state ? state.generalTxs : [];
    }

    const rows = await database.getAllAsync("SELECT id, amount, cat, note, date FROM general ORDER BY id");
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      cat: r.cat,
      note: r.note || "",
      date: r.date,
    }));
  } catch (e) {
    console.warn("DB getGeneralTxs error:", e?.message || e);
    return [];
  }
}

/** Get all workers. Returns [] on error. On web reads from AsyncStorage. */
export async function getWorkers() {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      return state ? state.workers : [];
    }

    const rows = await database.getAllAsync("SELECT id, name, phone FROM workers ORDER BY id");
    return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone || "" }));
  } catch (e) {
    console.warn("DB getWorkers error:", e?.message || e);
    return [];
  }
}

/** Get all suppliers. Returns [] on error. On web reads from AsyncStorage. */
export async function getSuppliers() {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      return state ? state.suppliers : [];
    }

    const rows = await database.getAllAsync("SELECT id, name, phone, category FROM suppliers ORDER BY id");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone || "",
      category: r.category || "",
    }));
  } catch (e) {
    console.warn("DB getSuppliers error:", e?.message || e);
    return [];
  }
}

/** Get settings only. Returns { activeFY, customFYs, nissabPrice } with defaults on error. On web reads from AsyncStorage. */
export async function getSettings() {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      return state
        ? { activeFY: state.activeFY, customFYs: state.customFYs || [], nissabPrice: state.nissabPrice ?? 85000 }
        : { activeFY: null, customFYs: [], nissabPrice: 85000 };
    }

    const rows = await database.getAllAsync("SELECT key, value FROM settings");
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return {
      activeFY: settings.activeFY || null,
      customFYs: settings.customFYs ? JSON.parse(settings.customFYs) : [],
      nissabPrice: settings.nissabPrice != null ? Number(settings.nissabPrice) : 85000,
    };
  } catch (e) {
    console.warn("DB getSettings error:", e?.message || e);
    return { activeFY: null, customFYs: [], nissabPrice: 85000 };
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
    const database = await getDb();
    if (!database) {
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

    for (const c of data.clients || []) {
      await database.runAsync(
        "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        c.id,
        c.name || "",
        c.project || "",
        c.status || "active",
        c.note || "",
        c.createdAt || ""
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
      await database.runAsync(
        "INSERT OR REPLACE INTO general (id, amount, cat, note, date) VALUES (?, ?, ?, ?, ?)",
        t.id,
        t.amount,
        t.cat || "",
        t.note || "",
        t.date || ""
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
    await database.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      "activeFY",
      data.activeFY != null ? String(data.activeFY) : ""
    );
    await database.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      "customFYs",
      JSON.stringify(data.customFYs || [])
    );
    await database.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      "nissabPrice",
      data.nissabPrice != null ? String(data.nissabPrice) : "85000"
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB saveState error:", e.message);
    }
  }
}

// ---------- Incremental writes (set data, no full delete) ----------

export async function upsertClient(client) {
  if (client == null || client.id == null) return;
  try {
    const ran = await withDbRetry(async (database) => {
      await database.runAsync(
        "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        client.id,
        client.name || "",
        client.project || "",
        client.status || "active",
        client.note || "",
        client.createdAt || ""
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
    if (ran === null) {
      const state = await getWebState();
      if (!state) return;
      const idx = state.clients.findIndex((c) => String(c.id) === String(client.id));
      const next = { ...client, txs: client.txs || [] };
      const clients = [...state.clients];
      if (idx >= 0) clients[idx] = next;
      else clients.push(next);
      await setWebState({ ...state, clients });
    }
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertClient error:", e.message);
    }
    throw e;
  }
}

export async function deleteClient(id) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      if (!state) return;
      const clients = state.clients.filter((c) => String(c.id) !== String(id));
      await setWebState({ ...state, clients });
      return;
    }

    await database.runAsync("DELETE FROM client_transactions WHERE client_id = ?", id);
    await database.runAsync("DELETE FROM clients WHERE id = ?", id);
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteClient error:", e.message);
    }
    throw e;
  }
}

export async function upsertClientTx(clientId, tx) {
  try {
    const database = await getDb();
    if (!database) {
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

    await database.runAsync(
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
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertClientTx error:", e.message);
    }
    throw e;
  }
}

export async function deleteClientTx(clientId, txId) {
  try {
    const database = await getDb();
    if (!database) {
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

    await database.runAsync("DELETE FROM client_transactions WHERE client_id = ? AND id = ?", clientId, txId);
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteClientTx error:", e.message);
    }
    throw e;
  }
}

export async function upsertGeneralTx(tx) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      if (!state) return;
      const generalTxs = [...(state.generalTxs || [])];
      const row = { id: tx.id, amount: tx.amount, cat: tx.cat || "", note: tx.note || "", date: tx.date || "" };
      const i = generalTxs.findIndex((t) => String(t.id) === String(tx.id));
      if (i >= 0) generalTxs[i] = row;
      else generalTxs.push(row);
      await setWebState({ ...state, generalTxs });
      return;
    }

    await database.runAsync(
      "INSERT OR REPLACE INTO general (id, amount, cat, note, date) VALUES (?, ?, ?, ?, ?)",
      tx.id,
      tx.amount,
      tx.cat || "",
      tx.note || "",
      tx.date || ""
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertGeneralTx error:", e.message);
    }
    throw e;
  }
}

export async function deleteGeneralTx(id) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      if (!state) return;
      const generalTxs = (state.generalTxs || []).filter((t) => String(t.id) !== String(id));
      await setWebState({ ...state, generalTxs });
      return;
    }

    await database.runAsync("DELETE FROM general WHERE id = ?", id);
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteGeneralTx error:", e.message);
    }
    throw e;
  }
}

export async function upsertWorker(worker) {
  try {
    const database = await getDb();
    if (!database) {
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

    await database.runAsync(
      "INSERT OR REPLACE INTO workers (id, name, phone) VALUES (?, ?, ?)",
      worker.id,
      worker.name,
      worker.phone || ""
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertWorker error:", e.message);
    }
    throw e;
  }
}

export async function deleteWorker(id) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      if (!state) return;
      const workers = (state.workers || []).filter((w) => String(w.id) !== String(id));
      await setWebState({ ...state, workers });
      return;
    }

    await database.runAsync("DELETE FROM workers WHERE id = ?", id);
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteWorker error:", e.message);
    }
    throw e;
  }
}

export async function upsertSupplier(supplier) {
  try {
    const database = await getDb();
    if (!database) {
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

    await database.runAsync(
      "INSERT OR REPLACE INTO suppliers (id, name, phone, category) VALUES (?, ?, ?, ?)",
      supplier.id,
      supplier.name,
      supplier.phone || "",
      supplier.category || ""
    );
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB upsertSupplier error:", e.message);
    }
    throw e;
  }
}

export async function deleteSupplier(id) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      if (!state) return;
      const suppliers = (state.suppliers || []).filter((s) => String(s.id) !== String(id));
      await setWebState({ ...state, suppliers });
      return;
    }

    await database.runAsync("DELETE FROM suppliers WHERE id = ?", id);
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB deleteSupplier error:", e.message);
    }
    throw e;
  }
}

export async function setSettings(settings) {
  try {
    const database = await getDb();
    if (!database) {
      const state = await getWebState();
      const next = {
        activeFY: settings.activeFY !== undefined ? settings.activeFY : (state && state.activeFY) ?? null,
        customFYs: settings.customFYs !== undefined ? settings.customFYs : (state && state.customFYs) ?? [],
        nissabPrice: settings.nissabPrice !== undefined ? settings.nissabPrice : (state && state.nissabPrice) ?? 85000,
      };
      await setWebState({
        clients: (state && state.clients) || [],
        generalTxs: (state && state.generalTxs) || [],
        workers: (state && state.workers) || [],
        suppliers: (state && state.suppliers) || [],
        ...next,
      });
      return;
    }

    if (settings.activeFY !== undefined) {
      await database.runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        "activeFY",
        String(settings.activeFY)
      );
    }
    if (settings.customFYs !== undefined) {
      await database.runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        "customFYs",
        JSON.stringify(settings.customFYs)
      );
    }
    if (settings.nissabPrice !== undefined) {
      await database.runAsync(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        "nissabPrice",
        String(settings.nissabPrice)
      );
    }
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB setSettings error:", e.message);
    }
    throw e;
  }
}
