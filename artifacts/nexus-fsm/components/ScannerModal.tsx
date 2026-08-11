/**
 * Camera barcode/serial scanner for the FSM app.
 *
 * Reads common 1D/2D symbologies (device serial labels are usually
 * code128/code39; IMEIs and boxes often carry QR or EAN). By default it is
 * single-shot: the first successful read is returned and the modal closes.
 */
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function ScannerModal({
  visible,
  onClose,
  onScan,
  hint = 'Point at the barcode',
}: {
  visible: boolean;
  onClose: () => void;
  /** Called once per read; modal closes itself after the first read. */
  onScan: (code: string) => void;
  hint?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  // Reset the single-shot latch each time the modal opens.
  React.useEffect(() => {
    if (visible) handled.current = false;
  }, [visible]);

  const onBarcode = (code: string) => {
    if (handled.current) return;
    handled.current = true;
    onScan(code);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1 }}>
          {!permission ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : !permission.granted ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
              <Feather name="camera-off" size={36} color="#9CA3AF" />
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 14 }}>
                Camera access is needed to scan barcodes.
              </Text>
              <Pressable
                onPress={requestPermission}
                style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Grant Access</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'datamatrix', 'qr'],
              }}
              onBarcodeScanned={({ data }) => onBarcode(data)}
            >
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: '75%',
                    height: 150,
                    borderWidth: 3,
                    borderColor: colors.primary,
                    borderRadius: 16,
                  }}
                />
                <Text style={{ color: '#fff', marginTop: 16, fontSize: 14, fontWeight: '600' }}>{hint}</Text>
              </View>
            </CameraView>
          )}
        </View>
        <View style={{ padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: '#000' }}>
          <Pressable
            onPress={onClose}
            style={{ backgroundColor: '#1F2937', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Fields whose label/id suggests a scannable code (serial, IMEI, barcode…). */
export function isScannableField(...names: (string | undefined)[]): boolean {
  return /serial|imei|barcode|asset\s*tag|assettag|mac\b|mac address/i.test(names.filter(Boolean).join(' '));
}
