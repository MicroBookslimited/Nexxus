import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useMarkThreadRead,
  useSendMessage,
  useThreadMessages,
  type ChatMessage,
} from "@workspace/api-client-react";

/**
 * One conversation, text only. New messages arrive by polling every 5 seconds
 * (there is no realtime channel in this stack), and the read cursor advances
 * whenever the newest message changes so the unread badge clears.
 */
export function ThreadPanel({
  threadId,
  staffId,
  emptyHint,
  className,
}: {
  threadId: number | null;
  staffId: number | null;
  emptyHint?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const readUpToRef = useRef(0);

  // Keep the whole conversation locally and ask the server only for what
  // arrived since the newest id we hold, so a long thread left open all day
  // doesn't re-download itself every five seconds.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [afterId, setAfterId] = useState<number | undefined>(undefined);

  const messagesQuery = useThreadMessages(staffId, threadId, { afterId, refetchMs: 5_000 });
  const sendMessage = useSendMessage();
  const markRead = useMarkThreadRead();

  /** Merge by id so an optimistic send and the poll can't duplicate a row. */
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      const next = [...byId.values()].sort((a, b) => a.id - b.id);
      const newest = next[next.length - 1];
      if (newest) setAfterId((cur) => (cur == null || newest.id > cur ? newest.id : cur));
      return next;
    });
  }, []);

  useEffect(() => {
    if (messagesQuery.data?.messages) merge(messagesQuery.data.messages);
  }, [messagesQuery.data, merge]);

  // Start clean when switching conversations.
  useEffect(() => {
    setMessages([]);
    setAfterId(undefined);
    readUpToRef.current = 0;
    atBottomRef.current = true;
  }, [threadId]);

  useEffect(() => {
    if (!staffId || threadId == null || messages.length === 0) return;
    const newest = messages[messages.length - 1];
    if (!newest || newest.id <= readUpToRef.current) return;
    readUpToRef.current = newest.id;
    markRead.mutate({ staffId, threadId, lastMessageId: newest.id });
    // markRead identity is stable enough for this effect; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, staffId, threadId]);

  // Only follow new messages when the reader is already at the bottom.
  useEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body || !staffId || threadId == null || sendMessage.isPending) return;
    setDraft("");
    atBottomRef.current = true;
    sendMessage.mutate(
      { staffId, threadId, body },
      {
        onSuccess: (m) => merge([m]),
        onError: (e: unknown) => {
          setDraft(body); // put it back rather than silently losing it
          toast({
            title: "Message not sent",
            description: e instanceof Error ? e.message : undefined,
            variant: "destructive",
          });
        },
      },
    );
  };

  if (threadId == null) {
    return (
      <div className={`flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground ${className ?? ""}`}>
        {emptyHint ?? "Pick a conversation to start messaging."}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className ?? ""}`}>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        data-testid="thread-messages"
      >
        {/* Each incremental poll uses a fresh query key, so only treat it as
            "loading" while we have nothing to show yet. */}
        {messagesQuery.isLoading && messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Say something.
          </p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const day = new Date(m.createdAt).toDateString();
            const showDay = !prev || new Date(prev.createdAt).toDateString() !== day;
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="my-3 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
                <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    data-testid={`message-${m.id}`}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.mine
                        ? "bg-primary text-primary-foreground"
                        : "border bg-muted/40 text-foreground"
                    }`}
                  >
                    {!m.mine && (
                      <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                        {m.senderName}
                        {m.senderSide === "technician" ? " · Technician" : ""}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-1 text-right text-[10px] opacity-70">
                      {new Date(m.createdAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          data-testid="input-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message — Enter to send, Shift+Enter for a new line"
          maxLength={4000}
          rows={2}
          className="min-h-[52px] resize-none"
          disabled={!staffId}
        />
        <Button
          data-testid="button-send-message"
          onClick={send}
          disabled={!draft.trim() || !staffId || sendMessage.isPending}
          size="icon"
          className="h-[52px] w-12 shrink-0"
        >
          {sendMessage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
