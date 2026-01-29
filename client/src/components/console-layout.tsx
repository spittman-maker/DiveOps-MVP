import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatAssistant } from "./chat-assistant";

interface ConsoleLayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "daily-log", label: "Daily Log" },
  { id: "dive-logs", label: "Dive Logs" },
  { id: "dive-plan", label: "Dive Plan" },
  { id: "library", label: "Library" },
  { id: "admin", label: "Admin" },
  { id: "risk-register", label: "Risk Register" },
];

export function ConsoleLayout({ children, activeTab, onTabChange }: ConsoleLayoutProps) {
  const { user, logout, isAdmin, isSupervisor } = useAuth();
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

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      <header className="bg-navy-800 border-b border-navy-600 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white tracking-tight">
            DiveOps™
          </h1>
          <div className="h-4 w-px bg-navy-600" />
          <span className="text-sm text-navy-300 font-mono">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-3">
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
            <span className="text-sm text-navy-200">{user?.fullName || user?.username}</span>
            <Badge className={`${getRoleBadgeColor(user?.role || "")} text-white text-xs`}>
              {user?.role}
            </Badge>
          </div>
          <Button
            data-testid="button-logout"
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-navy-300 hover:text-white hover:bg-navy-700"
          >
            Logout
          </Button>
        </div>
      </header>

      <nav className="bg-navy-850 border-b border-navy-600 px-4">
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
                    ? "text-white"
                    : "text-navy-400 hover:text-navy-200"
                  }
                `}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
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
