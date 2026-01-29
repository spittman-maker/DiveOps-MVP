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
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-navy-800/80 border-navy-600">
        <CardHeader className="text-center space-y-2">
          <div className="text-sm text-navy-400 font-medium">Precision Subsea Group LLC</div>
          <CardTitle className="text-2xl font-bold text-white tracking-tight">
            DiveOps™
          </CardTitle>
          <CardDescription className="text-navy-300 space-y-1">
            <div>Enterprise Subsea Operations Management System</div>
            <div className="text-xs text-navy-400">Command and Control for Subsea Operations</div>
            <div className="text-xs text-navy-500 italic">Patent Pending</div>
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
                className="bg-navy-900 border-navy-600 text-white placeholder:text-navy-400"
              />
            </div>
            <div>
              <Input
                data-testid="input-password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-navy-900 border-navy-600 text-white placeholder:text-navy-400"
              />
            </div>
            <Button
              data-testid="button-login"
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-navy-600">
            <Button
              data-testid="button-seed"
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="w-full border-navy-500 text-navy-300 hover:bg-navy-700"
            >
              {seedMutation.isPending ? "Creating..." : "Create Test Users"}
            </Button>
            <p className="mt-2 text-xs text-navy-400 text-center">
              Creates: god/godmode, supervisor/supervisor123, diver/diver123
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
