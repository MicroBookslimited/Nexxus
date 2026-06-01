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
    return mod.default ?? mod;
  } catch {
    throw new Error("USB printing requires a development build (react-native-thermal-printer is not available in Expo Go).");
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
