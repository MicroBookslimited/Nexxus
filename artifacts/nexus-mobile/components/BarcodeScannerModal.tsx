import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef } from "react";
import { Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, LoadingState, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  hint = "Point at a barcode to add it",
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  hint?: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const onBarcode = (code: string) => {
    const now = Date.now();
    // Debounce duplicate reads of the same code within 1.2s.
    if (lastScan.current.code === code && now - lastScan.current.at < 1200) return;
    lastScan.current = { code, at: now };
    onScan(code);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={{ flex: 1 }}>
          {!permission ? (
            <LoadingState />
          ) : !permission.granted ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
              <Feather name="camera-off" size={36} color={c.mutedForeground} />
              <Text style={{ color: "#fff", textAlign: "center", fontFamily: fontFamily("medium") }}>
                Camera access is needed to scan barcodes.
              </Text>
              <Button label="Grant Access" icon="camera" onPress={requestPermission} />
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
              }}
              onBarcodeScanned={({ data }) => onBarcode(data)}
            >
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: "70%",
                    height: 160,
                    borderWidth: 3,
                    borderColor: c.accent,
                    borderRadius: 16,
                    backgroundColor: "transparent",
                  }}
                />
                <Text style={{ color: "#fff", marginTop: 16, fontFamily: fontFamily("medium") }}>{hint}</Text>
              </View>
            </CameraView>
          )}
        </View>
        <View style={{ padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: "#000" }}>
          <Button label="Done" icon="check" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
