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
    <div className={`h-screen flex flex-col overflow-hidden ${isDark ? "bg-navy-900" : "bg-background"}`}>
      <header className={`px-4 py-2 flex items-center justify-between shrink-0 border-b ${isDark ? "bg-navy-800 border-navy-600" : "bg-card border-border"}`}>
        <div className="flex items-center gap-4">
          <h1 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-foreground"}`}>
            DiveOps™
          </h1>
          <div className={`h-4 w-px ${isDark ? "bg-navy-600" : "bg-border"}`} />
          <span className={`text-sm font-mono ${isDark ? "text-navy-300" : "text-muted-foreground"}`}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            data-testid="button-theme-toggle"
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className={isDark ? "text-navy-300 hover:text-white hover:bg-navy-700" : "text-muted-foreground hover:text-foreground hover:bg-accent"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            data-testid="button-chat-assistant"
            variant="outline"
            size="sm"
            onClick={() => setChatOpen(true)}
            className="text-xs border-blue-500 text-blue-400 hover:bg-blue-500/20"
          >
            💬 Assistant
          </Button>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isDark ? "text-navy-200" : "text-foreground"}`}>{user?.fullName || user?.username}</span>
            <Badge className={`${getRoleBadgeColor(user?.role || "")} text-white text-xs`}>
              {user?.role}
            </Badge>
          </div>
          <Button
            data-testid="button-logout"
            variant="ghost"
            size="sm"
            onClick={logout}
            className={isDark ? "text-navy-300 hover:text-white hover:bg-navy-700" : "text-muted-foreground hover:text-foreground hover:bg-accent"}
          >
            Logout
          </Button>
        </div>
      </header>

      <nav className={`px-4 shrink-0 border-b ${isDark ? "bg-navy-850 border-navy-600" : "bg-secondary border-border"}`}>
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
                    ? (isDark ? "text-white" : "text-foreground")
                    : (isDark ? "text-navy-400 hover:text-navy-200" : "text-muted-foreground hover:text-foreground")
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
