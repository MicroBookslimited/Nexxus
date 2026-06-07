import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  saasMe,
  saasUpdateProfile,
  saasUpdateEmail,
  saasUpdatePassword,
  TENANT_TOKEN_KEY,
  ApiError,
} from "@/lib/saas-api";
import { User, Mail, Lock, Loader2 } from "lucide-react";

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

export default function Account() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["saas-me"], queryFn: saasMe });
  const tenant = data?.tenant;

  /* ── Profile ── */
  const [profile, setProfile] = useState({ businessName: "", ownerName: "", phone: "", address: "", country: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (tenant) {
      setProfile({
        businessName: tenant.businessName ?? "",
        ownerName: tenant.ownerName ?? "",
        phone: tenant.phone ?? "",
        address: tenant.address ?? "",
        country: tenant.country ?? "",
      });
    }
  }, [tenant]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await saasUpdateProfile({
        businessName: profile.businessName.trim(),
        ownerName: profile.ownerName.trim(),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        country: profile.country.trim(),
      });
      queryClient.setQueryData(["saas-me"], (old: typeof data) => (old ? { ...old, tenant: res.tenant } : old));
      queryClient.invalidateQueries({ queryKey: ["saas-me"] });
      toast({ title: "Profile updated", description: "Your business information has been saved." });
    } catch (e) {
      toast({ title: "Could not update profile", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }

  /* ── Email ── */
  const [emailForm, setEmailForm] = useState({ newEmail: "", currentPassword: "" });
  const [savingEmail, setSavingEmail] = useState(false);

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    try {
      const res = await saasUpdateEmail(emailForm.newEmail.trim(), emailForm.currentPassword);
      localStorage.setItem(TENANT_TOKEN_KEY, res.token);
      setEmailForm({ newEmail: "", currentPassword: "" });
      queryClient.invalidateQueries({ queryKey: ["saas-me"] });
      toast({ title: "Email updated", description: `Your login email is now ${res.email}.` });
    } catch (e) {
      toast({ title: "Could not update email", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setSavingEmail(false);
    }
  }

  /* ── Password ── */
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingPw, setSavingPw] = useState(false);

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword.length < 8) {
      toast({ title: "Password too short", description: "New password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: "Passwords do not match", description: "Re-enter the new password to confirm.", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    try {
      const res = await saasUpdatePassword(pwForm.currentPassword, pwForm.newPassword);
      localStorage.setItem(TENANT_TOKEN_KEY, res.token);
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed", description: "Your password has been updated." });
    } catch (e) {
      toast({ title: "Could not change password", description: errMsg(e, "Please try again."), variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Account</h1>
        <p className="text-sm text-muted-foreground">Manage your business profile and login credentials.</p>
      </div>

      {/* Business Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Business Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business Name</Label>
                <Input id="businessName" value={profile.businessName}
                  onChange={(e) => setProfile((p) => ({ ...p, businessName: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerName">Owner Name</Label>
                <Input id="ownerName" value={profile.ownerName}
                  onChange={(e) => setProfile((p) => ({ ...p, ownerName: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={profile.country}
                  onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={profile.address}
                  onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Login Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Login Email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveEmail} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Email</Label>
              <Input value={tenant?.email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newEmail">New Email</Label>
              <Input id="newEmail" type="email" value={emailForm.newEmail}
                onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emailPassword">Current Password</Label>
              <Input id="emailPassword" type="password" autoComplete="current-password" value={emailForm.currentPassword}
                onChange={(e) => setEmailForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingEmail}>
                {savingEmail && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Update Email
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" type="password" autoComplete="current-password" value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" type="password" autoComplete="new-password" value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))} required />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Must be at least 8 characters.</p>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingPw}>
                {savingPw && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Change Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
