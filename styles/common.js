import { StyleSheet } from "react-native";

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    color: "#c4b5fd",
    fontSize: 15,
    marginBottom: 16,
    fontWeight: "700",
  },
  btn: {
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  btnPrimary: {
    backgroundColor: "#6366f1",
  },
  btnWorker: {
    backgroundColor: "#f59e0b",
  },
  btnSupplier: {
    backgroundColor: "#8b5cf6",
  },
  btnGeneral: {
    backgroundColor: "#f43f5e",
  },
  btnIncome: {
    backgroundColor: "#6366f1",
  },
  btnExpense: {
    backgroundColor: "#f43f5e",
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: "#f1f5f9",
    fontSize: 15,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 6,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyText: {
    color: "#475569",
    marginTop: 10,
  },
});
