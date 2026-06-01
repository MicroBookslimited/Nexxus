/**
 * USB ESC/POS transport — Android only.
 *
 * Uses `react-native-thermal-printer`, which prints plain text to the attached
 * USB printer (it emits its own ESC/POS init/cut), so this transport takes the
 * receipt TEXT rather than raw bytes. Lazily required so the app still loads in
 * Expo Go.
 */
import { Platform } from "react-native";

function loadThermal(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-thermal-printer");
    // mod.default is NativeModules.ThermalPrinterModule; fall back to direct NativeModules access
    const thermal = mod.default ?? mod;
    if (thermal && typeof thermal.printUsb === "function") return thermal;
    // If package default didn't have printUsb, try NativeModules directly
    const { NativeModules } = require("react-native");
    if (NativeModules.ThermalPrinterModule) return NativeModules.ThermalPrinterModule;
    return thermal;
  } catch {
    throw new Error("USB printing module not available.");
  }
}

export async function printUsb(text: string): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("USB printing is only supported on Android.");
  }
  const ThermalPrinter = loadThermal();
  if (typeof ThermalPrinter?.printUsb !== "function") {
    throw new Error(
      "USB printing isn't available in this app. Direct printing needs a native development build — it doesn't work in Expo Go or the web preview.",
    );
  }
  await ThermalPrinter.printUsb({
    payload: text,
    autoCut: true,
    openCashbox: false,
  });
}
