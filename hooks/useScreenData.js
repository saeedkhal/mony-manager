import { useState, useEffect } from "react";
import { getClients, getGeneralTxs, getWorkers, getSuppliers } from "../utils/db";
import { useApp } from "../context/AppContext";

/**
 * Fetches clients, generalTxs, workers, suppliers from DB and refetches when version counters change.
 * Use this in screens that need list data; each screen gets its own data from the DB.
 * Bumps global loading count so GlobalSpinner shows while fetching.
 */
export function useScreenData(clientsVersion, generalTxsVersion, workersVersion, suppliersVersion, loaded) {
  const { addDataLoading, removeDataLoading } = useApp();
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    let settled = false;
    setLoading(true);
    addDataLoading();
    Promise.all([
      getClients(),
      getGeneralTxs(),
      getWorkers(),
      getSuppliers(),
    ])
      .then(([c, g, w, s]) => {
        if (!cancelled) {
          setClients(c || []);
          setGeneralTxs(g || []);
          setWorkers(w || []);
          setSuppliers(s || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
          setGeneralTxs([]);
          setWorkers([]);
          setSuppliers([]);
        }
      })
      .finally(() => {
        settled = true;
        if (!cancelled) {
          removeDataLoading();
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (!settled) removeDataLoading();
    };
  }, [loaded, clientsVersion, generalTxsVersion, workersVersion, suppliersVersion]);

  return { clients, generalTxs, workers, suppliers, loading };
}
