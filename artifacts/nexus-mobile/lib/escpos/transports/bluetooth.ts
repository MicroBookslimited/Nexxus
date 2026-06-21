/**
 * Bluetooth Low Energy (BLE) ESC/POS transport.
 *
 * Uses `react-native-ble-plx`, lazily required so the app still loads in
 * Expo Go (the native module only resolves in a development build). Works with
 * BLE receipt printers on both iOS and Android. Classic Bluetooth (SPP-only)
 * printers are not supported by BLE — use the network or USB transport for
 * those.
 */
import { Platform } from "react-native";

import { bytesToBase64 } from "../base64";

export interface BleDevice {
  id: string;
  name: string;
}

let _manager: any = null;

function getManager(): any {
  if (_manager) return _manager;
  let mod: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require("react-native-ble-plx");
  } catch {
    throw new Error("Bluetooth printing requires a development build (react-native-ble-plx is not available in Expo Go).");
  }
  if (typeof mod?.BleManager !== "function") {
    throw new Error(
      "Bluetooth printing isn't available in this app. Direct printing needs a native development build — it doesn't work in Expo Go or the web preview.",
    );
  }
  _manager = new mod.BleManager();
  return _manager;
}

async function ensureAndroidPermissions(): Promise<void> {
  if (Platform.OS !== "android") return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PermissionsAndroid } = require("react-native");
  const perms = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ].filter(Boolean);
  if (!perms.length) return;
  const res = await PermissionsAndroid.requestMultiple(perms);
  const denied = Object.values(res).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied) throw new Error("Bluetooth permission denied.");
}

/** Scan for nearby BLE devices for `durationMs`, returning named devices. */
export async function scanBleDevices(durationMs = 6000): Promise<BleDevice[]> {
  await ensureAndroidPermissions();
  const manager = getManager();
  const found = new Map<string, BleDevice>();

  return new Promise<BleDevice[]>((resolve, reject) => {
    manager.startDeviceScan(null, null, (error: any, device: any) => {
      if (error) {
        manager.stopDeviceScan();
        reject(error instanceof Error ? error : new Error("Bluetooth scan failed."));
        return;
      }
      if (device?.id) {
        const name = device.name ?? device.localName ?? "";
        if (name) found.set(device.id, { id: device.id, name });
      }
    });
    setTimeout(() => {
      manager.stopDeviceScan();
      resolve([...found.values()]);
    }, durationMs);
  });
}

async function findWritableCharacteristic(device: any): Promise<{ serviceUUID: string; charUUID: string; withResponse: boolean }> {
  const services = await device.services();
  for (const svc of services) {
    const chars = await svc.characteristics();
    for (const ch of chars) {
      if (ch.isWritableWithoutResponse) {
        return { serviceUUID: svc.uuid, charUUID: ch.uuid, withResponse: false };
      }
    }
    for (const ch of chars) {
      if (ch.isWritableWithResponse) {
        return { serviceUUID: svc.uuid, charUUID: ch.uuid, withResponse: true };
      }
    }
  }
  throw new Error("No writable characteristic found on this Bluetooth printer.");
}

export async function printBluetooth(bytes: Uint8Array, opts: { deviceId?: string }): Promise<void> {
  if (!opts.deviceId) throw new Error("No Bluetooth printer selected.");
  await ensureAndroidPermissions();
  const manager = getManager();

  const device = await manager.connectToDevice(opts.deviceId, { requestMTU: 247 }).catch((e: any) => {
    throw e instanceof Error ? e : new Error("Could not connect to the Bluetooth printer.");
  });
  try {
    await device.discoverAllServicesAndCharacteristics();
    const { serviceUUID, charUUID, withResponse } = await findWritableCharacteristic(device);

    // BLE writes are limited by the negotiated ATT MTU (usable payload = MTU − 3).
    // Generic 58mm printers often ignore the MTU request and stay at the 23-byte
    // BLE default, where large writes silently drop bytes. Derive the chunk size
    // from the negotiated MTU and floor it at 20 bytes so low-MTU hardware prints
    // reliably while capable printers still get larger, faster writes.
    const negotiatedMtu = typeof device.mtu === "number" && device.mtu > 0 ? device.mtu : 23;
    const chunkSize = Math.max(20, negotiatedMtu - 3);
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      const b64 = bytesToBase64(chunk);
      if (withResponse) {
        await device.writeCharacteristicWithResponseForService(serviceUUID, charUUID, b64);
      } else {
        await device.writeCharacteristicWithoutResponseForService(serviceUUID, charUUID, b64);
      }
    }
  } finally {
    try {
      await manager.cancelDeviceConnection(opts.deviceId);
    } catch {
      /* ignore */
    }
  }
}
