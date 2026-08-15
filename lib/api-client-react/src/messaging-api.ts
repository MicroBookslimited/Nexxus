import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

/**
 * In-app messaging between the office and field technicians (Work Orders
 * module). Every call needs the x-staff-id header: the server resolves the
 * sender's name and side ("office" vs "technician") from that staff row, so
 * a PIN session is required before messages are readable.
 *
 * Text only — there is no attachment endpoint.
 */

export const MESSAGING_KEY = "messaging";

export type MessageThreadSummary = {
  id: number;
  kind: "direct" | "job";
  workOrderId: number | null;
  workOrderNumber: string | null;
  workOrderItem: string | null;
  workOrderStatus: string | null;
  customerName: string | null;
  staffId: number | null;
  title: string;
  lastMessageId: number | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: number;
  body: string;
  senderStaffId: number | null;
  senderName: string;
  senderSide: "office" | "technician";
  mine: boolean;
  createdAt: string;
};

export type ThreadListResponse = {
  side: "office" | "technician";
  threads: MessageThreadSummary[];
};

export type ThreadMessagesResponse = {
  threadId: number;
  kind: "direct" | "job";
  workOrderId: number | null;
  side: "office" | "technician";
  staffId: number;
  messages: ChatMessage[];
};

const staffHeader = (staffId: number) => ({ "x-staff-id": String(staffId) });

/** Every conversation this staff member can see, newest activity first. */
export function useListMessageThreads(staffId: number | null, refetchMs = 15_000) {
  return useQuery<ThreadListResponse>({
    queryKey: [MESSAGING_KEY, "threads", staffId],
    queryFn: () =>
      customFetch<ThreadListResponse>("/api/messaging/threads", {
        headers: staffHeader(staffId!),
      }),
    enabled: staffId != null,
    refetchInterval: refetchMs,
  });
}

/** Cheap badge poll. Disabled when there is no PIN session. */
export function useMessagingUnreadCount(staffId: number | null, refetchMs = 30_000) {
  return useQuery<{ unreadCount: number; unreadThreads: number }>({
    queryKey: [MESSAGING_KEY, "unread", staffId],
    queryFn: () =>
      customFetch<{ unreadCount: number; unreadThreads: number }>("/api/messaging/unread-count", {
        headers: staffHeader(staffId!),
      }),
    enabled: staffId != null,
    refetchInterval: refetchMs,
    // Messaging rides on the Work Orders add-on; without it just hide the badge.
    retry: false,
  });
}

/**
 * Messages in a thread. Poll fast while the thread is open; `afterId` keeps
 * each poll to just what arrived since the last one.
 */
export function useThreadMessages(
  staffId: number | null,
  threadId: number | null,
  opts?: { afterId?: number; refetchMs?: number; enabled?: boolean },
) {
  const afterId = opts?.afterId;
  return useQuery<ThreadMessagesResponse>({
    queryKey: [MESSAGING_KEY, "messages", threadId, staffId, afterId ?? null],
    queryFn: () =>
      customFetch<ThreadMessagesResponse>(
        `/api/messaging/threads/${threadId}/messages${afterId != null ? `?afterId=${afterId}` : ""}`,
        { headers: staffHeader(staffId!) },
      ),
    enabled: staffId != null && threadId != null && (opts?.enabled ?? true),
    refetchInterval: opts?.refetchMs ?? 5_000,
  });
}

/** Get-or-create the office↔technician conversation. */
export function useOpenDirectThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, withStaffId }: { staffId: number; withStaffId: number }) =>
      customFetch<{ id: number; title: string }>(`/api/messaging/threads/direct/${withStaffId}`, {
        method: "POST",
        headers: staffHeader(staffId),
        body: JSON.stringify({}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [MESSAGING_KEY, "threads"] }),
  });
}

/** Get-or-create the shared conversation for one job. */
export function useOpenJobThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, workOrderId }: { staffId: number; workOrderId: number }) =>
      customFetch<{ id: number; title: string }>(`/api/messaging/threads/job/${workOrderId}`, {
        method: "POST",
        headers: staffHeader(staffId),
        body: JSON.stringify({}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [MESSAGING_KEY, "threads"] }),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, threadId, body }: { staffId: number; threadId: number; body: string }) =>
      customFetch<ChatMessage>(`/api/messaging/threads/${threadId}/messages`, {
        method: "POST",
        headers: staffHeader(staffId),
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MESSAGING_KEY, "threads"] });
      void qc.invalidateQueries({ queryKey: [MESSAGING_KEY, "messages"] });
    },
  });
}

/** Advance my read cursor. The server never lets it move backwards. */
export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, threadId, lastMessageId }: {
      staffId: number;
      threadId: number;
      lastMessageId?: number;
    }) =>
      customFetch<{ ok: boolean; lastReadMessageId: number }>(
        `/api/messaging/threads/${threadId}/read`,
        {
          method: "POST",
          headers: staffHeader(staffId),
          body: JSON.stringify(lastMessageId != null ? { lastMessageId } : {}),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [MESSAGING_KEY, "threads"] });
      void qc.invalidateQueries({ queryKey: [MESSAGING_KEY, "unread"] });
    },
  });
}
