import { Feather } from "@expo/vector-icons";
import {
  useAddCashPayout,
  useAuthenticateStaff,
  useCloseCashSession,
  useGetCurrentCashSession,
  useOpenCashSession,
} from "@workspace/api-client-react";
import React, { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppHeader,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatMoney } from "@/lib/format";

function toNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

export default function CashScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const lay = useResponsive();
  const { tenant } = useAuth();

  const sessionQuery = useGetCurrentCashSession({
    query: { retry: false, queryKey: ["cash", "current-session"] },
  });
  const detail = sessionQuery.data;
  const hasSession = !!detail?.session && !sessionQuery.isError;

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const refresh = () => sessionQuery.refetch();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Cash" subtitle={hasSession ? "Shift open" : "No open shift"} />

      {sessionQuery.isLoading ? (
        <LoadingState label="Checking shift…" />
      ) : !hasSession ? (
        <OpenShiftView defaultName={tenant?.businessName ?? "Manager"} onOpened={refresh} pad={pad.bottom} maxWidth={lay.contentMaxWidth} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: pad.bottom + 16,
            width: "100%",
            maxWidth: lay.contentMaxWidth,
            alignSelf: "center",
          }}
        >
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("semibold") }}>
                {detail!.session.staffName}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" }} />
                <Text style={{ color: "#4ADE80", fontSize: 13, fontFamily: fontFamily("medium") }}>Open</Text>
              </View>
            </View>
            <Divider />
            <Line label="Opening cash" value={formatMoney(detail!.session.openingCash)} />
            <Line label="Cash sales" value={formatMoney(detail!.salesSummary.cashSales)} />
            <Line label="Card sales" value={formatMoney(detail!.salesSummary.cardSales)} />
            <Line label="Payouts" value={`- ${formatMoney(detail!.totalPayouts)}`} />
            <Divider />
            <Line label="Expected cash drawer" value={formatMoney(detail!.expectedCash)} bold />
          </Card>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button label="Cash In/Out" icon="trending-down" variant="secondary" onPress={() => setPayoutOpen(true)} style={{ flex: 1 }} />
            <Button label="Close Shift" icon="lock" variant="destructive" onPress={() => setCloseOpen(true)} style={{ flex: 1 }} />
          </View>

          {detail!.payouts.length > 0 ? (
            <Card style={{ gap: 0 }}>
              <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold"), marginBottom: 8 }}>
                Payouts
              </Text>
              {detail!.payouts.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 }}>
                    <Text style={{ color: c.mutedForeground, flex: 1 }} numberOfLines={1}>
                      {p.reason}
                    </Text>
                    <Text style={{ color: c.destructive, fontFamily: fontFamily("medium") }}>
                      - {formatMoney(p.amount)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
        </ScrollView>
      )}

      {detail?.session ? (
        <>
          <PayoutModal
            visible={payoutOpen}
            sessionId={detail.session.id}
            staffName={detail.session.staffName}
            onClose={() => setPayoutOpen(false)}
            onDone={refresh}
          />
          <CloseShiftModal
            visible={closeOpen}
            sessionId={detail.session.id}
            expectedCash={detail.expectedCash}
            onClose={() => setCloseOpen(false)}
            onDone={refresh}
          />
        </>
      ) : null}
    </View>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: bold ? c.foreground : c.mutedForeground, fontSize: bold ? 16 : 14, fontFamily: fontFamily(bold ? "semibold" : "regular") }}>
        {label}
      </Text>
      <Text style={{ color: bold ? c.accent : c.foreground, fontSize: bold ? 18 : 14, fontFamily: fontFamily(bold ? "bold" : "medium") }}>
        {value}
      </Text>
    </View>
  );
}

function OpenShiftView({ defaultName, onOpened, pad, maxWidth }: { defaultName: string; onOpened: () => void; pad: number; maxWidth?: number }) {
  const c = useColors();
  const open = useOpenCashSession();
  const authStaff = useAuthenticateStaff();
  const [openingCash, setOpeningCash] = useState("");
  const [pin, setPin] = useState("");

  const submit = async () => {
    let staffName = defaultName;
    let staffId: number | undefined;
    try {
      if (pin.trim()) {
        const res = await authStaff.mutateAsync({ data: { pin: pin.trim() } });
        staffName = res.name;
        staffId = res.id;
      }
      await open.mutateAsync({
        data: { staffName, openingCash: toNum(openingCash), ...(staffId ? { staffId } : {}) },
      });
      onOpened();
    } catch (e) {
      Alert.alert("Could not open shift", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        gap: 16,
        paddingBottom: pad + 16,
        width: "100%",
        maxWidth,
        alignSelf: "center",
      }}
    >
      <EmptyState icon="dollar-sign" title="No open shift" subtitle="Open a shift to start tracking cash." />
      <Card style={{ gap: 14 }}>
        <Field
          label="Opening cash float"
          value={openingCash}
          onChangeText={setOpeningCash}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <Field
          label="Staff PIN (optional)"
          value={pin}
          onChangeText={setPin}
          placeholder="Attach a cashier"
          keyboardType="number-pad"
          secureTextEntry
        />
        <Button
          label="Open Shift"
          icon="unlock"
          onPress={submit}
          loading={open.isPending || authStaff.isPending}
        />
      </Card>
    </ScrollView>
  );
}

function PayoutModal({
  visible,
  sessionId,
  staffName,
  onClose,
  onDone,
}: {
  visible: boolean;
  sessionId: number;
  staffName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const payout = useAddCashPayout();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const submit = async () => {
    if (toNum(amount) <= 0 || !reason.trim()) {
      Alert.alert("Missing info", "Enter an amount and a reason.");
      return;
    }
    try {
      await payout.mutateAsync({ id: sessionId, data: { amount: toNum(amount), reason: reason.trim(), staffName } });
      setAmount("");
      setReason("");
      onDone();
      onClose();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <ModalShell visible={visible} title="Cash In/Out" onClose={onClose} insetTop={insets.top}>
      <View style={{ padding: 16, gap: 14 }}>
        <Field label="Amount paid out" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Supplier cash, refund" />
        <Button label="Record Payout" icon="check" onPress={submit} loading={payout.isPending} />
      </View>
    </ModalShell>
  );
}

function CloseShiftModal({
  visible,
  sessionId,
  expectedCash,
  onClose,
  onDone,
}: {
  visible: boolean;
  sessionId: number;
  expectedCash: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const close = useCloseCashSession();
  const [actualCash, setActualCash] = useState("");
  const [actualCard, setActualCard] = useState("");
  const [notes, setNotes] = useState("");

  const variance = toNum(actualCash) - expectedCash;

  const submit = async () => {
    try {
      await close.mutateAsync({
        id: sessionId,
        data: {
          actualCash: toNum(actualCash),
          actualCard: toNum(actualCard),
          ...(notes.trim() ? { closingNotes: notes.trim() } : {}),
        },
      });
      onDone();
      onClose();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Try again.");
    }
  };

  return (
    <ModalShell visible={visible} title="Close Shift" onClose={onClose} insetTop={insets.top}>
      <View style={{ padding: 16, gap: 14 }}>
        <Card style={{ gap: 6 }}>
          <Line label="Expected cash" value={formatMoney(expectedCash)} />
          <Line label="Variance" value={formatMoney(variance)} bold />
        </Card>
        <Field label="Counted cash" value={actualCash} onChangeText={setActualCash} placeholder="0.00" keyboardType="decimal-pad" />
        <Field label="Counted card" value={actualCard} onChangeText={setActualCard} placeholder="0.00" keyboardType="decimal-pad" />
        <Field label="Closing notes (optional)" value={notes} onChangeText={setNotes} placeholder="Any discrepancies?" multiline />
        <Button label="Close Shift" icon="lock" variant="destructive" onPress={submit} loading={close.isPending} />
      </View>
    </ModalShell>
  );
}

function ModalShell({
  visible,
  title,
  onClose,
  insetTop,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  insetTop: number;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insetTop }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={26} color={c.foreground} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}
