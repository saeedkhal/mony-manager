/**
 * Web stub for db – avoids loading expo-sqlite (and its WASM worker) on web.
 * Storage.initState() will fall back to AsyncStorage; AppContext must persist via storage.saveState when on web.
 */

export async function getFullState() {
  return null;
}

export async function loadState() {
  return null;
}

export async function saveState() {}

export async function upsertClient() {}

export async function deleteClient() {}

export async function upsertClientTx() {}

export async function deleteClientTx() {}

export async function upsertGeneralTx() {}

export async function deleteGeneralTx() {}

export async function upsertWorker() {}

export async function deleteWorker() {}

export async function upsertSupplier() {}

export async function deleteSupplier() {}

export async function setSettings() {}
