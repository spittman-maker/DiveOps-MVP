import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Shield, Lock, User, Mail, KeyRound, Tag } from "lucide-react";

function SetupForm({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    initials: "",
    email: "",
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/setup/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          initials: form.initials,
          email: form.email,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Setup failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "System initialized", description: "Administrator account created. You are now logged in." });
      onComplete();
    },
    onError: (err: Error) => {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please confirm your password.", variant: "destructive" });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: "Password too short", description: "Minimum 8 characters required.", variant: "destructive" });
      return;
    }
    setupMutation.mutate();
  };

  return (
    <Card className="w-full max-w-lg bg-card border-border shadow-2xl">
      <CardHeader className="text-center space-y-4 pb-2">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
        </div>
        <div>
          <CardTitle className="text-xl font-bold tracking-tight gold-metallic">
            System Setup
          </CardTitle>
          <CardDescription className="mt-2">
            <span className="text-white/80">Create your administrator account to initialize DiveOps</span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSetup} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  data-testid="input-setup-fullname"
                  type="text"
                  placeholder="Jane Doe"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Initials</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  data-testid="input-setup-initials"
                  type="text"
                  placeholder="JD"
                  required
                  maxLength={4}
                  value={form.initials}
                  onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })}
                  className="pl-9 bg-secondary border-border text-white placeholder:text-white/30 uppercase"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                data-testid="input-setup-email"
                type="email"
                placeholder="jane.doe@company.com"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-white/50 mb-2">Login Credentials</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                data-testid="input-setup-username"
                type="text"
                placeholder="Choose a username"
                required
                minLength={3}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  data-testid="input-setup-password"
                  type="password"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Confirm Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  data-testid="input-setup-confirm"
                  type="password"
                  placeholder="Re-enter password"
                  required
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                />
              </div>
            </div>
          </div>
          <Button
            data-testid="button-setup-submit"
            type="submit"
            disabled={setupMutation.isPending}
            className="w-full btn-gold-metallic font-semibold mt-2"
          >
            {setupMutation.isPending ? "Initializing..." : "Initialize System"}
          </Button>
        </form>
        <p className="text-xs text-white/40 text-center mt-4">
          This account will have full system administrator privileges.
        </p>
      </CardContent>
    </Card>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getWelcomeMessage = (uname: string): { title: string; description: string } | null => {
    const key = uname.toLowerCase().trim();
    const messages: Record<string, { title: string; description: string }> = {
      mdorn: {
        title: "Welcome, Martin",
        description: "Perfect time to queue up some Chopin — nothing pairs better with compliance data than a little Ballade No. 1 in G minor.",
      },
      aaddison: {
        title: "Welcome, Aaron",
        description: "\"Once in a while you get shown the light, in the strangest of places if you look at it right.\" — Grateful Dead. Let's get to work.",
      },
      jmorris: {
        title: "Welcome, Jamie",
        description: "Quick heads up — we've partnered with a premium hair restoration clinic. First consultation is on us. You're welcome.",
      },
      bmartin: {
        title: "Welcome, Baker",
        description: "Don't fuck this up. Skyler is counting on you.",
      },
    };
    return messages[key] || null;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(username, password);
      const welcome = getWelcomeMessage(username);
      if (welcome) {
        setTimeout(() => {
          toast({
            title: welcome.title,
            description: welcome.description,
            duration: 12000,
          });
        }, 1500);
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md bg-card border-border shadow-2xl">
      <CardHeader className="text-center space-y-4">
        <div className="flex justify-center">
          <img
            src="/shield-logo.png"
            alt="Precision Subsea Group"
            className="h-28 w-auto"
          />
        </div>
        <div>
          <CardTitle className="text-2xl font-bold tracking-tight gold-metallic">
            DiveOps™
          </CardTitle>
          <CardDescription className="space-y-1 mt-1">
            <div className="text-white/80 text-sm">Precision Subsea Group LLC</div>
            <div className="text-xs text-white/50">Enterprise Subsea Operations Management</div>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                data-testid="input-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                autoComplete="username"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/70">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                data-testid="input-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 bg-secondary border-border text-white placeholder:text-white/30"
                autoComplete="current-password"
              />
            </div>
          </div>
          <Button
            data-testid="button-login"
            type="submit"
            disabled={isLoading}
            className="w-full btn-gold-metallic font-semibold"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <p className="text-xs text-white/40 text-center mt-6">
          Contact your system administrator for account access.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  const { data: setupStatus, isLoading } = useQuery({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const res = await fetch("/api/setup/status");
      if (!res.ok) throw new Error("Failed to check status");
      return res.json() as Promise<{ initialized: boolean; userCount: number }>;
    },
    staleTime: 30000,
  });

  const [justInitialized, setJustInitialized] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse gold-metallic text-lg">Loading...</div>
      </div>
    );
  }

  const showSetup = setupStatus && !setupStatus.initialized && !justInitialized;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {showSetup ? (
        <SetupForm onComplete={() => setJustInitialized(true)} />
      ) : (
        <LoginForm />
      )}
      <div className="mt-6 text-center">
        <p className="text-[10px] text-white/25 tracking-wider uppercase">
          Patent Pending &middot; Precision Subsea Group LLC
        </p>
      </div>
    </div>
  );
}
