/**
 * Network (raw TCP, port 9100) ESC/POS transport.
 *
 * Uses `react-native-tcp-socket`, lazily required so the app still loads in
 * Expo Go (the native module only resolves in a development build).
 */

import { bytesToBase64 } from "../base64";

function loadTcp(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("react-native-tcp-socket");
  } catch {
    throw new Error("Network printing requires a development build (react-native-tcp-socket is not available in Expo Go).");
  }
}

export async function printNetwork(
  bytes: Uint8Array,
  opts: { host?: string; port?: number; timeoutMs?: number },
): Promise<void> {
  const host = opts.host?.trim();
  const port = opts.port ?? 9100;
  if (!host) throw new Error("No printer IP address configured.");

  const tcpModule = loadTcp();
  const TcpSocket = tcpModule.default ?? tcpModule;
  const payload = bytesToBase64(bytes);

  await new Promise<void>((resolve, reject) => {
    let client: any = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        client?.destroy();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve();
    };

    timer = setTimeout(
      () => finish(new Error(`Timed out connecting to ${host}:${port}.`)),
      opts.timeoutMs ?? 8000,
    );

    try {
      client = TcpSocket.createConnection({ host, port }, () => {
        try {
          client.write(payload, "base64");
          // Give the socket a moment to flush before closing.
          setTimeout(() => finish(), 600);
        } catch (e) {
          finish(e instanceof Error ? e : new Error("Failed to send to printer."));
        }
      });

      client.on("error", (e: Error) => {
        finish(e instanceof Error ? e : new Error("Printer connection error."));
      });
    } catch (e) {
      finish(e instanceof Error ? e : new Error("Could not open printer connection."));
    }
  });
}
