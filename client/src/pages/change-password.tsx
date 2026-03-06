import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Lock, KeyRound } from "lucide-react";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to change password" }));
        throw new Error(data.message || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
      // Refresh user data to clear mustChangePassword flag
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Minimum 8 characters required.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please confirm your new password.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight gold-metallic">
              Change Your Password
            </CardTitle>
            <CardDescription className="mt-2">
              <span className="text-white/80">
                Welcome, {user?.fullName || user?.username}! You must set a new password before continuing.
              </span>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-white/70">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  data-testid="input-new-password"
                  type="password"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Confirm New Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  data-testid="input-confirm-new-password"
                  type="password"
                  placeholder="Re-enter new password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <Button
              data-testid="button-change-password"
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="w-full btn-gold-metallic font-semibold"
            >
              {changePasswordMutation.isPending ? "Updating..." : "Set New Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-6 text-center">
        <p className="text-[10px] text-white/25 tracking-wider uppercase">
          Patent Pending &middot; Precision Subsea Group LLC
        </p>
      </div>
    </div>
  );
}
