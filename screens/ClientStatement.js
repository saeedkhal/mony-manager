import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useApp } from "../context/AppContext";
import { getClientWithTxs } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import {
  buildClientPaymentStatement,
  clientStatementHtml,
  toWhatsAppPhone,
} from "../utils/clientStatement";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

export default function ClientStatement() {
  const navigation = useNavigation();
  const route = useRoute();
  const { activeFiscalYearLabel } = useApp();
  const clientId = route.params?.clientId;
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (clientId == null) {
      setClient(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    getClientWithTxs(clientId)
      .then((row) => {
        if (!cancelled) setClient(row || null);
      })
      .catch(() => {
        if (!cancelled) setClient(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const statement = useMemo(() => buildClientPaymentStatement(client), [client]);

  const remainingColor =
    statement.remaining == null
      ? "#94a3b8"
      : statement.remaining > 0
        ? "#fb923c"
        : statement.remaining < 0
          ? "#818cf8"
          : "#10b981";

  const sendWhatsApp = async () => {
    setSendError("");
    if (!client) return;
    if (!toWhatsAppPhone(client.phone)) {
      setSendError("أضف رقم تليفون العميل أولاً من تعديل البيانات.");
      return;
    }
    setSending(true);
    try {
      const html = clientStatementHtml(client, statement, activeFiscalYearLabel);
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setSendError("المشاركة غير متاحة على هذا الجهاز.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "إرسال كشف الحساب عبر واتساب",
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      setSendError(e?.message || "تعذر إنشاء أو إرسال الملف.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <ScreenLayout>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </ScreenLayout>
    );
  }

  if (!client) {
    return (
      <ScreenLayout>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.emptyText}>العميل غير موجود.</Text>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <View style={styles.clientDetailBackRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
          <Text style={styles.backBtnText}>رجوع</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.cardTitle, { marginBottom: 6 }]}>كشف حساب</Text>
      <Text style={styles.clientDetailName} numberOfLines={2}>
        {client.name}
      </Text>
      {client.phone ? (
        <Text style={styles.clientDetailMeta}>📞 {client.phone}</Text>
      ) : (
        <Text style={styles.clientDetailMeta}>لا يوجد رقم تليفون</Text>
      )}
      <Text style={[styles.clientDetailMeta, { marginBottom: 14 }]}>
        {client.project ? `${client.project} — ` : ""}
        السنة المالية {activeFiscalYearLabel}
      </Text>

      <View style={styles.clientDetailStats}>
        {[
          ["قيمة الطلبية", "#e2e8f0", statement.orderAmount > 0 ? statement.orderAmount : null],
          ["المدفوع", "#818cf8", statement.totalPaid],
          ["المتبقي", remainingColor, statement.remaining],
        ].map(([l, col, v]) => (
          <View
            key={l}
            style={[styles.clientDetailStatCard, { borderColor: col + "40" }]}
          >
            <Text style={styles.clientDetailStatLabel} numberOfLines={1}>
              {l}
            </Text>
            <Text style={[styles.clientDetailStatValue, { color: col }]} numberOfLines={1}>
              {v == null ? "—" : `${fmt(v)} ${CURRENCY}`}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.stockTableCard}>
        <View style={styles.stockTableHeader}>
          <View style={[styles.stockTableCol, styles.stockTableColName]}>
            <Text style={styles.stockTableHeaderText}>التاريخ</Text>
          </View>
          <View style={[styles.stockTableCol, styles.stockTableColCost]}>
            <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]}>البيان</Text>
          </View>
          <View style={[styles.stockTableCol, styles.stockTableColValue]}>
            <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]}>المدفوع</Text>
          </View>
          <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
            <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]}>المتبقي</Text>
          </View>
        </View>
        {statement.rows.length === 0 ? (
          <View style={[styles.stockTableRow, styles.stockTableRowLast]}>
            <Text style={[styles.stockTableCellMuted, { width: "100%", textAlign: "center" }]}>
              لا توجد دفعات بعد
            </Text>
          </View>
        ) : (
          statement.rows.map((r, index) => {
            const isLast = index === statement.rows.length - 1;
            const remainColor =
              statement.orderAmount <= 0
                ? "#94a3b8"
                : r.remaining > 0
                  ? "#fb923c"
                  : r.remaining < 0
                    ? "#818cf8"
                    : "#10b981";
            return (
              <View
                key={`${r.kind}-${r.date}-${index}`}
                style={[
                  styles.stockTableRow,
                  index % 2 === 1 && styles.stockTableRowAlt,
                  isLast && styles.stockTableRowLast,
                ]}
              >
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableCellName} numberOfLines={1}>
                    {r.date}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColCost]}>
                  <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={2}>
                    {r.label}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColValue]}>
                  <Text
                    style={[styles.stockTableCell, styles.stockTableCellCenter, { color: "#818cf8" }]}
                    numberOfLines={1}
                  >
                    {r.kind === "order" ? "—" : fmt(r.paid)}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
                  <Text
                    style={[styles.stockTableCell, styles.stockTableCellCenter, { color: remainColor }]}
                    numberOfLines={1}
                  >
                    {statement.orderAmount > 0 ? fmt(r.remaining) : "—"}
                  </Text>
                </View>
              </View>
            );
          })
        )}
        <View style={styles.stockTableFooter}>
          <View style={[styles.stockTableCol, styles.stockTableColName]}>
            <Text style={styles.stockTableFooterText}>المتبقي</Text>
          </View>
          <View style={[styles.stockTableCol, styles.stockTableColCost]} />
          <View style={[styles.stockTableCol, styles.stockTableColValue]} />
          <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
            <Text
              style={[
                styles.stockTableCell,
                styles.stockTableCellCenter,
                { color: remainingColor, fontWeight: "800" },
              ]}
              numberOfLines={1}
            >
              {statement.remaining == null ? "—" : `${fmt(statement.remaining)} ${CURRENCY}`}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnWhatsapp, { marginTop: 18 }]}
        onPress={sendWhatsApp}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>إرسال إلى واتساب</Text>
        )}
      </TouchableOpacity>
      {sendError ? (
        <Text style={[styles.fieldErrorText, { marginTop: 8 }]}>{sendError}</Text>
      ) : (
        <Text style={[styles.clientDetailMeta, { marginTop: 8 }]}>
          يفتح المشاركة لاختيار واتساب. الملف يُنشأ مؤقتاً ولا يُحفظ في التطبيق.
        </Text>
      )}
    </ScreenLayout>
  );
}
