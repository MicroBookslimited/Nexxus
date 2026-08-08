/**
 * End of Day Report — mobile counterpart of the web app's EOD modal.
 *
 * Pick a cash shift, review the summary, then PRINT it on the configured
 * thermal printer and/or EMAIL it (the server renders + sends the email via
 * the same endpoint the web app uses).
 */
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useGetSettings } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";

import {
  AppHeader,
  Button,
  Card,
  Divider,
  ErrorState,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { usePrinter } from "@/context/PrinterContext";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { buildEodReportText } from "@/lib/eod-report-text";
import { printRawText } from "@/lib/escpos";
import { formatMoney } from "@/lib/format";
import {
  emailEodReport,
  getCashSessionDetail,
  listAdminUsers,
  listCashSessions,
  type CashSession,
} from "@/lib/nexus-api";

function shiftLabel(s: CashSession): string {
  const d = new Date(s.openedAt);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const who = s.staffName ? ` · ${s.staffName}` : "";
  const state = s.closedAt ? "" : " · OPEN";
  return `${date} ${time}${who}${state}`;
}

/** Same manager/admin gate as the Reports tab — this screen exposes shift
 *  financials and can email them, so direct navigation must be blocked too. */
function canViewReports(role: string | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r.includes("admin") || r.includes("manager");
}

export default function EodReportScreen() {
  const c = useColors();
  const router = useRouter();
  const { staff } = useStaff();
  const allowed = canViewReports(staff?.role);
  const pad = useScreenPadding();
  const { config: printerConfig } = usePrinter();
  const settingsQ = useGetSettings();
  const businessName = (settingsQ.data as Record<string, string> | undefined)?.business_name;

  const sessionsQ = useQuery({
    queryKey: ["cash", "sessions", staff?.id ?? null],
    queryFn: () => listCashSessions(staff?.id),
    enabled: allowed,
  });
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Default to the most recent shift once loaded.
  const sessions = sessionsQ.data ?? [];
  const activeId = sessionId ?? sessions[0]?.id ?? null;
  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  const detailQ = useQuery({
    queryKey: ["cash", "session", activeId, staff?.id ?? null],
    queryFn: () => getCashSessionDetail(activeId!, staff?.id),
    enabled: allowed && activeId != null,
  });

  // ── Print ────────────────────────────────────────────────────────────────
  const [printing, setPrinting] = useState<"summary" | "detailed" | null>(null);
  async function handlePrint(includeTransactions: boolean) {
    if (!detailQ.data) return;
    if (!printerConfig?.enabled) {
      Alert.alert("Printer off", "Enable the printer in Printer Settings first.");
      return;
    }
    setPrinting(includeTransactions ? "detailed" : "summary");
    try {
      const text = buildEodReportText(detailQ.data, {
        businessName,
        width: printerConfig.paperWidth ?? 32,
        includeTransactions,
      });
      await printRawText(printerConfig, text);
    } catch (err) {
      Alert.alert("Print failed", err instanceof Error ? err.message : "Could not print.");
    } finally {
      setPrinting(null);
    }
  }

  // ── Email ────────────────────────────────────────────────────────────────
  const [emailOpen, setEmailOpen] = useState(false);
  const adminsQ = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers, enabled: emailOpen });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [reportType, setReportType] = useState<"summary" | "detailed">("summary");
  const [includeProducts, setIncludeProducts] = useState(true);
  const [sending, setSending] = useState(false);

  async function handleSendEmails() {
    if (!activeId || checked.size === 0) return;
    setSending(true);
    let sent = 0;
    const failed: string[] = [];
    for (const to of checked) {
      try {
        await emailEodReport({
          sessionId: activeId,
          to,
          reportType,
          includeProducts,
          includeBrands: false,
          includeCategories: false,
        }, staff?.id);
        sent++;
      } catch {
        failed.push(to);
      }
    }
    setSending(false);
    if (failed.length === 0) {
      setEmailOpen(false);
      Alert.alert("Report sent", `Emailed to ${sent} recipient${sent === 1 ? "" : "s"}.`);
    } else {
      Alert.alert("Partly sent", `Sent ${sent}, failed for: ${failed.join(", ")}`);
    }
  }

  const d = detailQ.data;
  const s = d?.salesSummary;

  const row = (label: string, value: string, strong = false) => (
    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: strong ? c.foreground : c.mutedForeground, fontSize: 13, fontFamily: fontFamily(strong ? "semibold" : "regular") }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 13, fontFamily: fontFamily(strong ? "bold" : "regular") }}>{value}</Text>
    </View>
  );

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="End of Day Report" subtitle="Restricted" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Card style={{ width: "100%", maxWidth: 420, alignItems: "center", gap: 12, padding: 24 }}>
            <Feather name="lock" size={32} color={c.mutedForeground} />
            <Text style={{ color: c.foreground, fontSize: 16, fontFamily: fontFamily("bold") }}>
              Managers and admins only
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13, textAlign: "center" }}>
              Sign in with a manager or admin PIN on the Reports tab to view shift reports.
            </Text>
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="End of Day Report" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: pad.bottom + 24, gap: 12 }}>
        {/* Shift picker */}
        <Card>
          <Text style={{ color: c.mutedForeground, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: fontFamily("semibold"), marginBottom: 6 }}>
            Shift
          </Text>
          {sessionsQ.isLoading ? (
            <LoadingState label="Loading shifts…" />
          ) : sessionsQ.isError ? (
            <ErrorState message="Could not load shifts" onRetry={() => sessionsQ.refetch()} />
          ) : sessions.length === 0 ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>No shifts recorded yet.</Text>
          ) : (
            <>
              <Pressable
                onPress={() => setPickerOpen((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}
              >
                <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                  {activeSession ? shiftLabel(activeSession) : "Select a shift"}
                </Text>
                <Feather name={pickerOpen ? "chevron-up" : "chevron-down"} size={18} color={c.mutedForeground} />
              </Pressable>
              {pickerOpen && (
                <View style={{ marginTop: 4 }}>
                  <Divider />
                  {sessions.slice(0, 15).map((sess) => (
                    <Pressable
                      key={sess.id}
                      onPress={() => { setSessionId(sess.id); setPickerOpen(false); }}
                      style={{ paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Text style={{ color: sess.id === activeId ? c.primary : c.foreground, fontSize: 14, fontFamily: fontFamily(sess.id === activeId ? "semibold" : "regular") }}>
                        {shiftLabel(sess)}
                      </Text>
                      {sess.id === activeId && <Feather name="check" size={16} color={c.primary} />}
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </Card>

        {/* Summary */}
        {activeId != null && (
          detailQ.isLoading ? (
            <LoadingState label="Loading report…" />
          ) : detailQ.isError ? (
            <ErrorState message="Could not load the report" onRetry={() => detailQ.refetch()} />
          ) : d && s ? (
            <>
              <Card>
                <Text style={{ color: c.mutedForeground, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: fontFamily("semibold"), marginBottom: 6 }}>
                  Sales
                </Text>
                {row("Total sales", formatMoney(s.totalSales ?? 0), true)}
                {row("Orders", String(d.orders.filter((o) => o.status !== "voided").length))}
                {row("Cash", formatMoney(s.cashSales ?? 0))}
                {row("Card", formatMoney(s.cardSales ?? 0))}
                {(s.splitSales ?? 0) !== 0 && row("Split", formatMoney(s.splitSales))}
                {(s.creditSales ?? 0) !== 0 && row("On account", formatMoney(s.creditSales))}
                {(s.totalRefunds ?? 0) !== 0 && row("Refunds", `-${formatMoney(s.totalRefunds)}`)}
              </Card>
              <Card>
                <Text style={{ color: c.mutedForeground, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: fontFamily("semibold"), marginBottom: 6 }}>
                  Cash reconciliation
                </Text>
                {row("Opening float", formatMoney(d.session.openingCash ?? 0))}
                {row("Payouts", `-${formatMoney(d.totalPayouts ?? 0)}`)}
                {row("Expected cash", formatMoney(d.expectedCash ?? 0), true)}
                {d.session.actualCash != null && row("Counted cash", formatMoney(d.session.actualCash))}
                {d.session.actualCash != null &&
                  row(
                    d.session.actualCash - (d.expectedCash ?? 0) >= 0 ? "Over" : "Short",
                    formatMoney(Math.abs(d.session.actualCash - (d.expectedCash ?? 0))),
                    true,
                  )}
              </Card>

              {/* Actions */}
              <Button
                label="Print Summary"
                icon="printer"
                onPress={() => handlePrint(false)}
                loading={printing === "summary"}
                disabled={printing !== null}
              />
              <Button
                label="Print with Sales Detail"
                icon="printer"
                variant="secondary"
                onPress={() => handlePrint(true)}
                loading={printing === "detailed"}
                disabled={printing !== null}
              />
              <Button
                label="Email Report"
                icon="mail"
                variant="secondary"
                onPress={() => setEmailOpen(true)}
              />

              {/* Email panel */}
              {emailOpen && (
                <Card>
                  <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("bold"), marginBottom: 8 }}>
                    Email Report
                  </Text>
                  {adminsQ.isLoading ? (
                    <LoadingState label="Loading recipients…" />
                  ) : adminsQ.isError ? (
                    <ErrorState message="Could not load recipients" onRetry={() => adminsQ.refetch()} />
                  ) : (
                    <>
                      {(adminsQ.data ?? []).map((u) => {
                        const on = checked.has(u.email);
                        return (
                          <Pressable
                            key={u.id}
                            onPress={() =>
                              setChecked((prev) => {
                                const next = new Set(prev);
                                if (on) next.delete(u.email);
                                else next.add(u.email);
                                return next;
                              })
                            }
                            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
                          >
                            <Feather name={on ? "check-square" : "square"} size={20} color={on ? c.primary : c.mutedForeground} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("semibold") }}>{u.name}</Text>
                              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{u.email}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                      <Divider />
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
                        <Text style={{ color: c.foreground, fontSize: 14 }}>Include transaction detail</Text>
                        <Switch
                          value={reportType === "detailed"}
                          onValueChange={(v) => setReportType(v ? "detailed" : "summary")}
                        />
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
                        <Text style={{ color: c.foreground, fontSize: 14 }}>Include product summary</Text>
                        <Switch value={includeProducts} onValueChange={setIncludeProducts} />
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <Button label="Cancel" variant="ghost" onPress={() => setEmailOpen(false)} style={{ flex: 1 }} />
                        <Button
                          label={sending ? "Sending…" : `Send (${checked.size})`}
                          onPress={handleSendEmails}
                          loading={sending}
                          disabled={checked.size === 0}
                          style={{ flex: 2 }}
                        />
                      </View>
                    </>
                  )}
                </Card>
              )}
            </>
          ) : null
        )}
      </ScrollView>
    </View>
  );
}
