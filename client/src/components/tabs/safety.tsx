import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyChecklists } from "@/components/safety/checklists";
import { SafetyJha } from "@/components/safety/jha";
import { SafetyMeetings } from "@/components/safety/meetings";
import { SafetyNearMiss } from "@/components/safety/near-miss";

type SafetySubSection = "checklists" | "jha" | "meetings" | "near-miss";

interface SafetyMetrics {
  totalChecklists: number;
  completedToday: number;
  openNearMisses: number;
  totalNearMisses: number;
  activeJhas: number;
  meetingsThisWeek: number;
}

const SUB_SECTIONS: { id: SafetySubSection; label: string; icon: string }[] = [
  { id: "checklists", label: "Checklists", icon: "clipboard-check" },
  { id: "jha", label: "JHA", icon: "shield-alert" },
  { id: "meetings", label: "Safety Meetings", icon: "users" },
  { id: "near-miss", label: "Near-Miss Reports", icon: "alert-triangle" },
];

export function SafetyTab() {
  const [activeSection, setActiveSection] = useState<SafetySubSection>("checklists");
  const { activeProject } = useProject();
  const { isSupervisor } = useAuth();

  const { data: metrics } = useQuery<SafetyMetrics>({
    queryKey: ["safety-metrics", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return { totalChecklists: 0, completedToday: 0, openNearMisses: 0, totalNearMisses: 0, activeJhas: 0, meetingsThisWeek: 0 };
      const res = await fetch(`/api/safety/${activeProject.id}/metrics`, { credentials: "include" });
      if (!res.ok) return { totalChecklists: 0, completedToday: 0, openNearMisses: 0, totalNearMisses: 0, activeJhas: 0, meetingsThisWeek: 0 };
      return res.json();
    },
    enabled: !!activeProject?.id,
    refetchInterval: 30000,
  });

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Select a project to view safety information</p>
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case "checklists":
        return <SafetyChecklists />;
      case "jha":
        return <SafetyJha />;
      case "meetings":
        return <SafetyMeetings />;
      case "near-miss":
        return <SafetyNearMiss />;
      default:
        return <SafetyChecklists />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Safety Metrics Bar */}
      <div className="px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Checklists Today</span>
            <Badge variant="secondary" className="text-xs">{metrics?.completedToday ?? 0}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs text-muted-foreground">Open Near-Misses</span>
            <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-400">{metrics?.openNearMisses ?? 0}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs text-muted-foreground">Active JHAs</span>
            <Badge variant="secondary" className="text-xs">{metrics?.activeJhas ?? 0}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-xs text-muted-foreground">Meetings This Week</span>
            <Badge variant="secondary" className="text-xs">{metrics?.meetingsThisWeek ?? 0}</Badge>
          </div>
        </div>
      </div>

      {/* Sub-section Navigation */}
      <div className="px-4 border-b border-border bg-secondary/30">
        <div className="flex gap-1">
          {SUB_SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`
                px-4 py-2 text-sm font-medium transition-colors relative
                ${activeSection === section.id
                  ? "text-primary"
                  : "text-white/60 hover:text-white"
                }
              `}
            >
              {section.label}
              {activeSection === section.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {renderSection()}
      </div>
    </div>
  );
}
