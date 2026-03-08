import * as SQLite from "expo-sqlite";

const DB_NAME = "mall_v4.db";
let db = null;

async function getDb() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await initSchema(db);
  return db;
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
    CREATE TABLE IF NOT EXISTS client_txs (
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
    CREATE TABLE IF NOT EXISTS general_txs (
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
 */
export async function getFullState() {
  try {
    const database = await getDb();

    const clientsRows = await database.getAllAsync(
      "SELECT id, name, project, status, note, created_at FROM clients ORDER BY id"
    );
    const txRows = await database.getAllAsync(
      "SELECT id, client_id, type, amount, cat, note, date, worker_id, supplier_id FROM client_txs ORDER BY client_id, id"
    );
    const generalRows = await database.getAllAsync("SELECT id, amount, cat, note, date FROM general_txs ORDER BY id");
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

/** Alias for storage.js init - same as getFullState */
export async function loadState() {
  return getFullState();
}

/**
 * Persist full state (only used for migration from AsyncStorage). Prefer incremental writes.
 * Does NOT delete all data – only upserts the given payload (INSERT OR REPLACE) and replaces
 * per-client txs so existing rows not in the payload are left unchanged.
 */
export async function saveState(data) {
  try {
    const database = await getDb();

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
      await database.runAsync("DELETE FROM client_txs WHERE client_id = ?", c.id);
      for (const t of c.txs || []) {
        await database.runAsync(
          "INSERT INTO client_txs (id, client_id, type, amount, cat, note, date, worker_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
        "INSERT OR REPLACE INTO general_txs (id, amount, cat, note, date) VALUES (?, ?, ?, ?, ?)",
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
    await database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "activeFY", data.activeFY != null ? String(data.activeFY) : "");
    await database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "customFYs", JSON.stringify(data.customFYs || []));
    await database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "nissabPrice", data.nissabPrice != null ? String(data.nissabPrice) : "85000");
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
    const database = await getDb();

    await database.runAsync(
      "INSERT OR REPLACE INTO clients (id, name, project, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      client.id,
      client.name || "",
      client.project || "",
      client.status || "active",
      client.note || "",
      client.createdAt || ""
    );
    await database.runAsync("DELETE FROM client_txs WHERE client_id = ?", client.id);
    for (const t of client.txs || []) {
      await database.runAsync(
        "INSERT INTO client_txs (id, client_id, type, amount, cat, note, date, worker_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    await database.runAsync("DELETE FROM client_txs WHERE client_id = ?", id);
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
    await database.runAsync(
      "INSERT OR REPLACE INTO client_txs (id, client_id, type, amount, cat, note, date, worker_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    await database.runAsync("DELETE FROM client_txs WHERE client_id = ? AND id = ?", clientId, txId);
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
    await database.runAsync(
      "INSERT OR REPLACE INTO general_txs (id, amount, cat, note, date) VALUES (?, ?, ?, ?, ?)",
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
    await database.runAsync("DELETE FROM general_txs WHERE id = ?", id);
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
    if (settings.activeFY !== undefined) {
      await database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "activeFY", String(settings.activeFY));
    }
    if (settings.customFYs !== undefined) {
      await database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "customFYs", JSON.stringify(settings.customFYs));
    }
    if (settings.nissabPrice !== undefined) {
      await database.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", "nissabPrice", String(settings.nissabPrice));
    }
  } catch (e) {
    if (e?.message && !e.message.includes("Native module is null")) {
      console.error("DB setSettings error:", e.message);
    }
    throw e;
  }
}
