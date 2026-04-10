const QUEUE_KEY = "nexus_offline_queue";

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
  timestamp: number;
  label: string;
}

export function getQueue(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedRequest[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueRequest(req: Omit<QueuedRequest, "id" | "timestamp">) {
  const queue = getQueue();
  queue.push({ ...req, id: crypto.randomUUID(), timestamp: Date.now() });
  saveQueue(queue);
  window.dispatchEvent(new CustomEvent("nexus:queue-changed"));
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter((r) => r.id !== id);
  saveQueue(queue);
  window.dispatchEvent(new CustomEvent("nexus:queue-changed"));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
  window.dispatchEvent(new CustomEvent("nexus:queue-changed"));
}

export async function flushQueue(
  onProgress?: (done: number, total: number) => void
): Promise<{ succeeded: number; failed: number }> {
  const queue = getQueue();
  let succeeded = 0;
  let failed = 0;
  const total = queue.length;

  for (let i = 0; i < queue.length; i++) {
    const req = queue[i];
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body != null ? JSON.stringify(req.body) : undefined,
      });
      if (res.ok) {
        removeFromQueue(req.id);
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    onProgress?.(i + 1, total);
  }

  return { succeeded, failed };
}
