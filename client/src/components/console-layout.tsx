import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatAssistant } from "./chat-assistant";
import { Sun, Moon } from "lucide-react";

interface ConsoleLayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "daily-log", label: "Daily Log" },
  { id: "dive-logs", label: "Dive Logs" },
  { id: "dive-plan", label: "Dive Plan" },
  { id: "library", label: "Library" },
  { id: "admin", label: "Admin" },
  { id: "risk-register", label: "Risk Register" },
];

export function ConsoleLayout({ children, activeTab, onTabChange }: ConsoleLayoutProps) {
  const { user, logout, isAdmin, isSupervisor } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [chatOpen, setChatOpen] = useState(false);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "GOD": return "bg-amber-600";
      case "ADMIN": return "bg-purple-600";
      case "SUPERVISOR": return "bg-blue-600";
      case "DIVER": return "bg-teal-600";
      default: return "bg-gray-600";
    }
  };

  const isDark = theme === "dark";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="px-4 py-2 flex items-center justify-between shrink-0 border-b bg-card border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/brain-logo.png" alt="DiveOps" className="h-8 w-auto" />
            <h1 className="text-lg font-bold tracking-tight text-primary">
              DiveOps™
            </h1>
          </div>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-mono text-white/70">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            data-testid="button-theme-toggle"
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            data-testid="button-chat-assistant"
            variant="outline"
            size="sm"
            onClick={() => setChatOpen(true)}
            className="text-xs border-primary/50 text-primary hover:bg-primary/10"
          >
            AI Assistant
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white">{user?.fullName || user?.username}</span>
            <Badge className={`${getRoleBadgeColor(user?.role || "")} text-white text-xs`}>
              {user?.role}
            </Badge>
          </div>
          <Button
            data-testid="button-logout"
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            Logout
          </Button>
        </div>
      </header>

      <nav className="px-4 shrink-0 border-b bg-secondary border-border">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const isHidden = tab.id === "admin" && !isAdmin;
            if (isHidden) return null;

            return (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`
                  px-4 py-2 text-sm font-medium transition-colors relative
                  ${activeTab === tab.id
                    ? "text-primary"
                    : "text-white/60 hover:text-white"
                  }
                `}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      <ChatAssistant isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
