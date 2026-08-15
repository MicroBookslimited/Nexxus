import { useMemo, useState } from "react";
import { Loader2, MessageSquare, Search, User, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PinPad } from "@/components/PinPad";
import { ThreadPanel } from "@/components/messaging/thread-panel";
import { useStaff } from "@/contexts/StaffContext";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSettings,
  useListMessageThreads,
  useListStaff,
  useOpenDirectThread,
} from "@workspace/api-client-react";

/**
 * Office inbox for messaging field technicians.
 *
 * The office is a collective identity — every admin/manager sees and can
 * reply in every conversation, so a technician's question is never stuck
 * with one person who is off shift. Technicians without a conversation yet
 * are still listed so the office can start one.
 */

type StaffRow = { id: number; name: string; role?: string; isTechnician?: boolean; isActive?: boolean };

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function MessagesPage() {
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const { staff: sessionStaff, setStaff } = useStaff();
  const [locked, setLocked] = useState(() => !sessionStaff);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const staffId = sessionStaff?.id ?? null;
  const threadsQuery = useListMessageThreads(locked ? null : staffId);
  const { data: allStaff } = useListStaff();
  const openDirect = useOpenDirectThread();

  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data]);

  /** Technicians without a thread yet still need a row so a chat can be started. */
  const technicianRows = useMemo(() => {
    const byStaffId = new Map(
      threads.filter((t) => t.kind === "direct" && t.staffId != null).map((t) => [t.staffId!, t]),
    );
    return (allStaff ?? [])
      .filter((s: StaffRow) => s.isTechnician && s.isActive !== false)
      .map((s: StaffRow) => ({ staff: s, thread: byStaffId.get(s.id) ?? null }))
      .sort((a, b) => {
        const au = a.thread?.unreadCount ?? 0;
        const bu = b.thread?.unreadCount ?? 0;
        if (au !== bu) return bu - au;
        const at = a.thread?.lastMessageAt ?? "";
        const bt = b.thread?.lastMessageAt ?? "";
        if (at !== bt) return bt.localeCompare(at);
        return a.staff.name.localeCompare(b.staff.name);
      });
  }, [allStaff, threads]);

  const jobThreads = useMemo(
    () => threads.filter((t) => t.kind === "job"),
    [threads],
  );

  const q = search.trim().toLowerCase();
  const filteredTechs = q
    ? technicianRows.filter((r) => r.staff.name.toLowerCase().includes(q))
    : technicianRows;
  const filteredJobs = q
    ? jobThreads.filter((t) =>
        [t.title, t.workOrderNumber, t.customerName, t.workOrderItem]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : jobThreads;

  // Route-level module gate: nav is already hidden, but block direct URL access too.
  if (settings && settings.work_orders_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Work Orders module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules to message technicians.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 w-full max-w-xs px-4">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold flex items-center gap-2 justify-center">
              <MessageSquare className="h-5 w-5 text-sky-500" /> Messages
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your PIN — messages are sent under your name
            </p>
          </div>
          <PinPad
            onSuccess={(s) => { setStaff({ ...s, permissions: s.permissions ?? [] }); setLocked(false); }}
            title="Staff PIN Required"
          />
        </div>
      </div>
    );
  }

  const startDirect = (withStaffId: number) => {
    if (!staffId) return;
    openDirect.mutate(
      { staffId, withStaffId },
      {
        onSuccess: (t) => setSelected(t.id),
        onError: (e: unknown) =>
          toast({
            title: "Could not open conversation",
            description: e instanceof Error ? e.message : undefined,
            variant: "destructive",
          }),
      },
    );
  };

  const selectedThread = threads.find((t) => t.id === selected) ?? null;
  const selectedTech = technicianRows.find((r) => r.thread?.id === selected) ?? null;
  const headerTitle = selectedThread
    ? selectedThread.kind === "job"
      ? selectedThread.title
      : (selectedTech?.staff.name ?? selectedThread.title)
    : "Messages";

  const Row = ({
    title,
    subtitle,
    preview,
    time,
    unread,
    active,
    icon,
    onClick,
    testId,
  }: {
    title: string;
    subtitle?: string | null;
    preview?: string | null;
    time?: string;
    unread: number;
    active: boolean;
    icon: React.ElementType;
    onClick: () => void;
    testId: string;
  }) => {
    const Icon = icon;
    return (
      <button
        data-testid={testId}
        onClick={onClick}
        className={`w-full text-left flex gap-3 px-3 py-2.5 border-b transition-colors ${
          active ? "bg-muted" : "hover:bg-muted/50"
        }`}
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{title}</span>
            {time ? <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{time}</span> : null}
          </div>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <p className={`truncate text-xs ${unread > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {preview || "No messages yet"}
            </p>
            {unread > 0 && (
              <Badge className="ml-auto h-5 shrink-0 px-1.5 text-[10px]">{unread > 99 ? "99+" : unread}</Badge>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-6 w-6 text-sky-500" />
        <h1 className="text-xl font-semibold">Messages</h1>
        <span className="text-sm text-muted-foreground">
          Signed in as {sessionStaff?.name}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        {/* ── Conversation list ── */}
        <aside className="flex w-72 shrink-0 flex-col border-r">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-search-conversations"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search technicians or jobs"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threadsQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <p className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Technicians
                </p>
                {filteredTechs.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    No technicians yet. Mark staff as technicians on the Staff page.
                  </p>
                ) : (
                  filteredTechs.map(({ staff: s, thread }) => (
                    <Row
                      key={s.id}
                      testId={`conversation-tech-${s.id}`}
                      title={s.name}
                      subtitle={s.role}
                      preview={
                        thread?.lastMessagePreview
                          ? `${thread.lastMessageSenderName ? `${thread.lastMessageSenderName}: ` : ""}${thread.lastMessagePreview}`
                          : null
                      }
                      time={stamp(thread?.lastMessageAt ?? null)}
                      unread={thread?.unreadCount ?? 0}
                      active={thread != null && thread.id === selected}
                      icon={User}
                      onClick={() => (thread ? setSelected(thread.id) : startDirect(s.id))}
                    />
                  ))
                )}

                {filteredJobs.length > 0 && (
                  <p className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Job conversations
                  </p>
                )}
                {filteredJobs.map((t) => (
                  <Row
                    key={t.id}
                    testId={`conversation-job-${t.id}`}
                    title={t.title}
                    subtitle={[t.customerName, t.workOrderItem].filter(Boolean).join(" · ") || null}
                    preview={
                      t.lastMessagePreview
                        ? `${t.lastMessageSenderName ? `${t.lastMessageSenderName}: ` : ""}${t.lastMessagePreview}`
                        : null
                    }
                    time={stamp(t.lastMessageAt)}
                    unread={t.unreadCount}
                    active={t.id === selected}
                    icon={Wrench}
                    onClick={() => setSelected(t.id)}
                  />
                ))}
              </>
            )}
          </div>
        </aside>

        {/* ── Thread ── */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <span className="text-sm font-semibold">{headerTitle}</span>
            {selected != null && (
              <span className="text-xs text-muted-foreground">Text messages only</span>
            )}
          </div>
          <ThreadPanel
            threadId={selected}
            staffId={staffId}
            emptyHint="Pick a technician or job on the left to start messaging."
          />
        </section>
      </div>
    </div>
  );
}
