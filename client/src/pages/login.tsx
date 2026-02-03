import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/seed", { method: "POST" });
      if (!res.ok) throw new Error("Seed failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Seed data created",
        description: `Users: ${data.users.god}, ${data.users.supervisor}, ${data.users.diver}`,
      });
    },
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src="/shield-logo.png" 
              alt="Precision Subsea Group" 
              className="h-32 w-auto"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-primary tracking-tight">
            DiveOps™
          </CardTitle>
          <CardDescription className="space-y-1">
            <div className="text-white/90">Enterprise Subsea Operations Management System</div>
            <div className="text-xs text-white/70">Command and Control for Subsea Operations</div>
            <div className="text-xs text-white/50 italic">Patent Pending</div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                data-testid="input-username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-secondary border-border text-white placeholder:text-white/50"
              />
            </div>
            <div>
              <Input
                data-testid="input-password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary border-border text-white placeholder:text-white/50"
              />
            </div>
            <Button
              data-testid="button-login"
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-border">
            <Button
              data-testid="button-seed"
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="w-full border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {seedMutation.isPending ? "Creating..." : "Create Test Users"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Creates: god/godmode, supervisor/supervisor123, diver/diver123
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
