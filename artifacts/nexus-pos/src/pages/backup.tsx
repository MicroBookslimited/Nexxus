import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DatabaseBackup, Download, Upload, ShieldAlert, Loader2, CheckCircle2, LockKeyhole } from "lucide-react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function BackupPage() {
  const { toast } = useToast();

  /* ── Export ── */
  const [exportPassword, setExportPassword] = useState("");
  const [exportPassword2, setExportPassword2] = useState("");
  const [exporting, setExporting] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);

  const handleExport = async () => {
    if (exportPassword.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (exportPassword !== exportPassword2) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const resp = await fetch("/api/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ password: exportPassword }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Backup failed");
      }
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] || `nexxus-backup-${new Date().toISOString().slice(0, 10)}.nxbk`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLastExportAt(new Date().toLocaleString());
      setExportPassword("");
      setExportPassword2("");
      toast({ title: "Backup downloaded", description: "Store the file and its password somewhere safe — the password cannot be recovered." });
    } catch (e) {
      toast({ title: "Backup failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  /* ── Restore ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreDone, setRestoreDone] = useState<Record<string, number> | null>(null);

  const doRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const text = await restoreFile.text();
      let envelope: unknown;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new Error("This does not look like a NEXXUS backup file.");
      }
      const resp = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ password: restorePassword, file: envelope }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || "Restore failed");
      setRestoreDone(body.restored ?? {});
      setConfirmOpen(false);
      setConfirmText("");
      setRestoreFile(null);
      setRestorePassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Restore complete", description: "Your data has been restored from the backup." });
    } catch (e) {
      toast({ title: "Restore failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const totalRestored = restoreDone ? Object.values(restoreDone).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <DatabaseBackup className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Backup & Restore</h1>
          <p className="text-sm text-muted-foreground">
            Download an offline copy of your business data, or restore it after data loss.
          </p>
        </div>
      </div>

      {/* ── Export ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" /> Download a backup
          </CardTitle>
          <CardDescription>
            Includes your products, customers, orders, work orders, settings and more. The file is
            encrypted with a password you choose — without it, the file cannot be read (or restored).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Backup password</Label>
              <Input type="password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label>Confirm password</Label>
              <Input type="password" value={exportPassword2} onChange={(e) => setExportPassword2(e.target.value)} placeholder="Repeat the password" autoComplete="new-password" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
            If you lose this password, the backup cannot be opened — there is no way to recover it.
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {exporting ? "Preparing backup…" : "Download Backup"}
            </Button>
            {lastExportAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Downloaded {lastExportAt}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Restore ── */}
      <Card className="border-rose-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-rose-600 dark:text-rose-400">
            <Upload className="h-4 w-4" /> Restore from a backup
          </CardTitle>
          <CardDescription>
            Replaces <span className="font-semibold text-foreground">all current business data</span> in
            this account with the contents of the backup file. Use this after data loss. A backup can
            only be restored into the same NEXXUS account it was taken from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Backup file (.nxbk)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".nxbk,application/octet-stream"
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label>Backup password</Label>
              <Input type="password" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} placeholder="Password used when it was created" autoComplete="off" />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Restoring wipes what's currently in the account first. Anything created after this backup
              was taken (sales, products, customers…) will be gone. This cannot be undone.
            </span>
          </div>
          <Button
            variant="destructive"
            disabled={!restoreFile || !restorePassword}
            onClick={() => setConfirmOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" /> Restore Backup…
          </Button>
          {restoreDone && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Restore complete — {totalRestored.toLocaleString()} records restored.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Restore confirmation ── */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!restoring) { setConfirmOpen(o); setConfirmText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="h-5 w-5" /> Replace all data?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the business data currently in this account and replace it
              with the backup <span className="font-mono">{restoreFile?.name}</span>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Type <span className="font-mono font-bold">RESTORE</span> to confirm</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={restoring} onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirmText !== "RESTORE" || restoring} onClick={doRestore}>
              {restoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {restoring ? "Restoring…" : "Wipe & Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
