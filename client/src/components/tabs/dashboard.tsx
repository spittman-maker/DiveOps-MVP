import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings, GripVertical, X, Save, RotateCcw, Sun, Cloud, CloudRain, Wind, Droplets, Zap, Waves, Radio, Activity, ChevronDown, AlertTriangle, Shield, ShieldCheck, Send, Loader2, Users, Clock, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";

interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, any>;
}

interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

interface DashboardLayout {
  widgets: WidgetConfig[];
  version: number;
}

interface ActiveDiver {
  id: string;
  name: string;
  station: string | null;
  lsTime: string;
}

interface RecentRisk {
  id: string;
  riskId: string;
  description: string;
  source: string;
}

interface DashboardStats {
  totalDives: number;
  activeDives: number;
  activeDivers?: ActiveDiver[];
  completedDives?: number;
  safetyIncidents: number;
  openRisks: number;
  recentRisks?: RecentRisk[];
  logEntriesToday: number;
  directivesToday?: number;
  dayStatus?: string;
  dayDate?: string;
}

// ─── Live Board Types ────────────────────────────────────────────────────────

interface LiveDive {
  id: string;
  diverName: string;
  station: string;
  maxDepthFsw: number | null;
  breathingGas: string;
  fo2Percent: number | null;
  lsTime: string;
  rbTime: string | null;
  lbTime: string | null;
  rsTime?: string;
  elapsedMin: number;
  bottomTimeMin: number | null;
  totalMin?: number;
  tableUsed: string | null;
  scheduleUsed: string | null;
  repetitiveGroup: string | null;
  decompRequired: string | null;
  diveNumber: number;
  dayId: string;
}

interface LiveLogEntry {
  id: string;
  station: string;
  category: string;
  rawText: string;
  eventTime: string;
  captureTime: string;
  dayId: string;
}

interface StationInfo {
  name: string;
  activeDivers: number;
  completedDives: number;
  isActive: boolean;
}

interface LiveBoardData {
  activeDives: LiveDive[];
  completedDives: LiveDive[];
  logEntries: LiveLogEntry[];
  stations: StationInfo[];
  dayCount: number;
  date: string;
}

const WIDGET_TYPES = [
  { type: "live_dive_board", label: "Live Dive Board", defaultW: 4, defaultH: 3 },
  { type: "live_log_feed", label: "Live Log Feed", defaultW: 2, defaultH: 3 },
  { type: "station_overview", label: "Station Overview", defaultW: 2, defaultH: 3 },
  { type: "daily_summary", label: "Today's Summary", defaultW: 2, defaultH: 2 },
  { type: "active_dives", label: "Active Dives", defaultW: 2, defaultH: 2 },
  { type: "recent_logs", label: "Recent Logs", defaultW: 2, defaultH: 2 },
  { type: "safety_incidents", label: "Safety Status", defaultW: 2, defaultH: 2 },
  { type: "risk_register", label: "Risk Register", defaultW: 2, defaultH: 2 },
  { type: "dive_stats", label: "Dive Statistics", defaultW: 2, defaultH: 2 },
  { type: "project_status", label: "Project Status", defaultW: 2, defaultH: 2 },
  { type: "weather", label: "Weather & Lightning", defaultW: 2, defaultH: 2 },
  { type: "diver_certs", label: "Diver Certifications", defaultW: 2, defaultH: 2 },
  { type: "equipment_certs", label: "Equipment Certifications", defaultW: 2, defaultH: 2 },
  { type: "expiring_certs", label: "Expiring Certifications", defaultW: 2, defaultH: 2 },
  { type: "cert_status", label: "Certification Status", defaultW: 2, defaultH: 2 },
  { type: "my_crew_quick_entry", label: "My Crew Quick-Entry", defaultW: 2, defaultH: 3 },
];

// ─── Shared hook for live board data ─────────────────────────────────────────

function useLiveBoardData(projectId?: string) {
  return useQuery<LiveBoardData>({
    queryKey: ["dashboard-live-board", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/dashboard/live-board?projectId=${projectId}`
        : "/api/dashboard/live-board";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { activeDives: [], completedDives: [], logEntries: [], stations: [], dayCount: 0, date: "" };
      return res.json();
    },
    refetchInterval: 5000,
  });
}

// ─── NEW: Live Dive Board Widget ─────────────────────────────────────────────

function LiveDiveBoardWidget({ projectId }: { projectId?: string } = {}) {
  const { data } = useLiveBoardData(projectId);
  const activeDives = data?.activeDives || [];
  const completedDives = data?.completedDives || [];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="widget-live-dive-board">
      {/* Header summary */}
      <div className="flex items-center gap-3 mb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Waves className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">{activeDives.length} In Water</span>
        </div>
        <span className="text-xs text-navy-400">|</span>
        <span className="text-xs text-navy-300">{completedDives.length} Completed Today</span>
        {activeDives.length > 0 && (
          <Badge className="btn-gold-metallic animate-pulse text-[9px] px-1.5 py-0">LIVE</Badge>
        )}
      </div>

      {/* Active dives table */}
      {activeDives.length > 0 && (
        <div className="mb-2 shrink-0">
          <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1">Active Dives</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-navy-400 border-b border-navy-600">
                  <th className="text-left py-1 px-1 font-medium"></th>
                  <th className="text-left py-1 px-1 font-medium">Diver</th>
                  <th className="text-left py-1 px-1 font-medium">Station</th>
                  <th className="text-right py-1 px-1 font-medium">Depth</th>
                  <th className="text-left py-1 px-1 font-medium">Gas</th>
                  <th className="text-right py-1 px-1 font-medium">FO2%</th>
                  <th className="text-right py-1 px-1 font-medium">LS</th>
                  <th className="text-right py-1 px-1 font-medium">Elapsed</th>
                  <th className="text-right py-1 px-1 font-medium">BT</th>
                  <th className="text-left py-1 px-1 font-medium">Table</th>
                </tr>
              </thead>
              <tbody>
                {activeDives.map(dive => (
                  <tr key={dive.id} className="border-b border-navy-700/50 hover:bg-navy-700/30">
                    <td className="py-1 px-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    </td>
                    <td className="py-1 px-1 text-white font-medium">{dive.diverName}</td>
                    <td className="py-1 px-1 text-cyan-400">{dive.station}</td>
                    <td className="py-1 px-1 text-right text-white font-mono">{dive.maxDepthFsw ? `${dive.maxDepthFsw}'` : "—"}</td>
                    <td className="py-1 px-1 text-navy-200">{dive.breathingGas}</td>
                    <td className="py-1 px-1 text-right text-navy-200 font-mono">{dive.fo2Percent || "—"}</td>
                    <td className="py-1 px-1 text-right text-amber-400 font-mono">{formatTime(dive.lsTime)}</td>
                    <td className="py-1 px-1 text-right text-amber-300 font-mono font-bold">{dive.elapsedMin}m</td>
                    <td className="py-1 px-1 text-right text-white font-mono">{dive.bottomTimeMin != null ? `${dive.bottomTimeMin}m` : "—"}</td>
                    <td className="py-1 px-1 text-navy-300 truncate max-w-[100px]">{dive.scheduleUsed || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed dives */}
      {completedDives.length > 0 && (
        <div className="flex-1 overflow-auto min-h-0">
          <div className="text-[10px] text-navy-400 font-semibold uppercase tracking-wider mb-1">Completed</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-700">
                  <th className="text-left py-0.5 px-1 font-medium">Diver</th>
                  <th className="text-left py-0.5 px-1 font-medium">Station</th>
                  <th className="text-right py-0.5 px-1 font-medium">Depth</th>
                  <th className="text-left py-0.5 px-1 font-medium">Gas</th>
                  <th className="text-right py-0.5 px-1 font-medium">Total</th>
                  <th className="text-right py-0.5 px-1 font-medium">BT</th>
                  <th className="text-left py-0.5 px-1 font-medium">Table</th>
                  <th className="text-left py-0.5 px-1 font-medium">Group</th>
                </tr>
              </thead>
              <tbody>
                {completedDives.slice(0, 15).map(dive => (
                  <tr key={dive.id} className="border-b border-navy-700/30 opacity-70 hover:opacity-100">
                    <td className="py-0.5 px-1 text-navy-200">{dive.diverName}</td>
                    <td className="py-0.5 px-1 text-cyan-400/60">{dive.station}</td>
                    <td className="py-0.5 px-1 text-right text-navy-200 font-mono">{dive.maxDepthFsw ? `${dive.maxDepthFsw}'` : "—"}</td>
                    <td className="py-0.5 px-1 text-navy-300">{dive.breathingGas}</td>
                    <td className="py-0.5 px-1 text-right text-navy-200 font-mono">{dive.totalMin}m</td>
                    <td className="py-0.5 px-1 text-right text-navy-200 font-mono">{dive.bottomTimeMin != null ? `${dive.bottomTimeMin}m` : "—"}</td>
                    <td className="py-0.5 px-1 text-navy-400 truncate max-w-[80px]">{dive.scheduleUsed || "—"}</td>
                    <td className="py-0.5 px-1 text-navy-300 font-mono">{dive.repetitiveGroup || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeDives.length === 0 && completedDives.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 text-navy-500">
          <Waves className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-xs">No dive activity yet today</p>
        </div>
      )}
    </div>
  );
}

// ─── NEW: Live Log Feed Widget ───────────────────────────────────────────────

function LiveLogFeedWidget({ projectId }: { projectId?: string } = {}) {
  const { data } = useLiveBoardData(projectId);
  const logEntries = data?.logEntries || [];

  const categoryColor: Record<string, string> = {
    directive: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    safety: "bg-red-500/20 text-red-400 border-red-500/30",
    dive_op: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    ops: "bg-green-500/20 text-green-400 border-green-500/30",
    general: "bg-navy-600/50 text-navy-300 border-navy-500/30",
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  if (logEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-navy-500" data-testid="widget-live-log-feed">
        <Radio className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-xs">No log entries yet today</p>
        <p className="text-[10px] mt-1">Entries from all crews will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="widget-live-log-feed">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Radio className="h-3.5 w-3.5 text-green-400" />
        <span className="text-xs text-navy-300">{logEntries.length} entries from all crews</span>
      </div>
      <div className="space-y-1 overflow-auto flex-1 min-h-0">
        {logEntries.map(log => (
          <div key={log.id} className="bg-navy-700/60 rounded px-2 py-1.5 text-[11px]">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-mono text-[10px]">{formatTime(log.eventTime)}</span>
                <span className={`text-[9px] font-semibold uppercase px-1.5 py-0 rounded border ${categoryColor[log.category] || categoryColor.general}`}>
                  {log.category?.replace("_", " ") || "general"}
                </span>
              </div>
              <span className="text-[9px] text-cyan-400/70 font-medium">{log.station}</span>
            </div>
            <div className="text-white/80 text-[11px] line-clamp-2 leading-tight">{log.rawText}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NEW: Station Overview Widget ────────────────────────────────────────────

// ─── Crew Hours Types ───────────────────────────────────────────────────────

interface CrewMemberHours {
  id: string;
  name: string;
  trade: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  notes: string;
}

const TRADE_OPTIONS = ["Diver", "Tender", "Standby Diver", "Supervisor", "DMT", "Crane Operator", "Rigger", "Welder", "Inspector", "Other"];

function StationOverviewWidget({ projectId }: { projectId?: string } = {}) {
  const { toast } = useToast();
  const { activeDay } = useProject();

  // Read crew from localStorage (same key as daily-log / quick-entry)
  const [selectedCrew, setSelectedCrew] = useState<string>(() => {
    try {
      return localStorage.getItem("diveops_selected_station") || "";
    } catch {
      return "";
    }
  });

  // Sync crew selection with localStorage
  useEffect(() => {
    const syncCrew = () => {
      try {
        const stored = localStorage.getItem("diveops_selected_station") || "";
        setSelectedCrew(stored);
      } catch {}
    };
    window.addEventListener("storage", syncCrew);
    const interval = setInterval(syncCrew, 2000);
    return () => {
      window.removeEventListener("storage", syncCrew);
      clearInterval(interval);
    };
  }, []);

  // Get today's date string for localStorage key
  const todayStr = activeDay?.date || new Date().toISOString().slice(0, 10);
  const storageKey = `diveops_crew_hours_${selectedCrew}_${todayStr}`;

  // Load crew members from localStorage
  const [members, setMembers] = useState<CrewMemberHours[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  // Reload when crew or day changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setMembers(JSON.parse(stored));
      } else {
        setMembers([]);
      }
    } catch {
      setMembers([]);
    }
  }, [storageKey]);

  // Persist to localStorage and backend whenever members change
  const saveMembers = useCallback((updated: CrewMemberHours[]) => {
    setMembers(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}
    // Also save to backend
    fetch("/api/crew-hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        station: selectedCrew,
        date: todayStr,
        members: updated,
      }),
    }).catch(() => {});
  }, [storageKey, selectedCrew, todayStr]);

  // Fetch from backend on mount
  useEffect(() => {
    if (!selectedCrew) return;
    fetch(`/api/crew-hours?station=${encodeURIComponent(selectedCrew)}&date=${todayStr}`, {
      credentials: "include",
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.members && data.members.length > 0) {
          setMembers(data.members);
          try {
            localStorage.setItem(storageKey, JSON.stringify(data.members));
          } catch {}
        }
      })
      .catch(() => {});
  }, [selectedCrew, todayStr, storageKey]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("Diver");

  const addMember = () => {
    if (!newName.trim()) return;
    const member: CrewMemberHours = {
      id: `m${Date.now()}`,
      name: newName.trim(),
      trade: newTrade,
      startTime: "",
      endTime: "",
      totalHours: 0,
      notes: "",
    };
    const updated = [...members, member];
    saveMembers(updated);
    setNewName("");
    setShowAddForm(false);
    toast({ title: "Added", description: `${member.name} added to roster` });
  };

  const updateMember = (id: string, field: keyof CrewMemberHours, value: string | number) => {
    const updated = members.map(m => {
      if (m.id !== id) return m;
      const updatedMember = { ...m, [field]: value };
      // Auto-calculate total hours when start/end times change
      if ((field === "startTime" || field === "endTime") && updatedMember.startTime && updatedMember.endTime) {
        const [sh, sm] = updatedMember.startTime.split(":").map(Number);
        const [eh, em] = updatedMember.endTime.split(":").map(Number);
        if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
          let totalMin = (eh * 60 + em) - (sh * 60 + sm);
          if (totalMin < 0) totalMin += 24 * 60; // overnight shift
          updatedMember.totalHours = Math.round(totalMin / 60 * 100) / 100;
        }
      }
      return updatedMember;
    });
    saveMembers(updated);
  };

  const removeMember = (id: string) => {
    const updated = members.filter(m => m.id !== id);
    saveMembers(updated);
  };

  const totalCrewHours = members.reduce((sum, m) => sum + (m.totalHours || 0), 0);

  const handleCrewChange = (newCrew: string) => {
    setSelectedCrew(newCrew);
    try {
      localStorage.setItem("diveops_selected_station", newCrew);
    } catch {}
  };

  if (!selectedCrew) {
    return (
      <div className="flex flex-col h-full overflow-hidden" data-testid="widget-station-overview">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <Users className="h-3.5 w-3.5 text-cyan-400" />
          <select
            value={selectedCrew}
            onChange={(e) => handleCrewChange(e.target.value)}
            className="bg-navy-900 border border-navy-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500 flex-1"
          >
            <option value="">Select a team/station</option>
            {CREW_STATIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-navy-500">
          <Activity className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-xs">Select a team to view roster</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="widget-station-overview">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Users className="h-3.5 w-3.5 text-cyan-400" />
        <select
          value={selectedCrew}
          onChange={(e) => handleCrewChange(e.target.value)}
          className="bg-navy-900 border border-navy-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500 flex-1"
        >
          <option value="">Select a team/station</option>
          {CREW_STATIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Badge className="text-[9px] bg-cyan-700 text-cyan-100 shrink-0">{members.length} crew</Badge>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between mb-2 px-1 shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] text-navy-300">Total: <span className="text-amber-400 font-mono font-bold">{totalCrewHours.toFixed(1)}h</span></span>
        </div>
        <span className="text-[10px] text-navy-500">{todayStr}</span>
      </div>

      {/* Roster table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {members.length > 0 ? (
          <div className="space-y-1">
            {members.map((member) => (
              <div key={member.id} className="bg-navy-700/60 rounded px-2 py-1.5 border border-navy-600/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-xs font-medium">{member.name}</span>
                    <Badge className="text-[8px] bg-navy-600 text-navy-200 px-1 py-0">{member.trade}</Badge>
                  </div>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="text-navy-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <div>
                    <label className="text-[8px] text-navy-500 block">Start</label>
                    <input
                      type="time"
                      value={member.startTime}
                      onChange={(e) => updateMember(member.id, "startTime", e.target.value)}
                      className="bg-navy-900 border border-navy-600 text-white text-[10px] rounded px-1 py-0.5 w-full focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-navy-500 block">End</label>
                    <input
                      type="time"
                      value={member.endTime}
                      onChange={(e) => updateMember(member.id, "endTime", e.target.value)}
                      className="bg-navy-900 border border-navy-600 text-white text-[10px] rounded px-1 py-0.5 w-full focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-navy-500 block">Hours</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={member.totalHours || ""}
                      onChange={(e) => updateMember(member.id, "totalHours", parseFloat(e.target.value) || 0)}
                      className="bg-navy-900 border border-navy-600 text-amber-400 text-[10px] rounded px-1 py-0.5 w-full font-mono font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <div className="mt-1">
                  <input
                    type="text"
                    placeholder="Notes..."
                    value={member.notes}
                    onChange={(e) => updateMember(member.id, "notes", e.target.value)}
                    className="bg-navy-900/50 border border-navy-700 text-navy-200 text-[10px] rounded px-1 py-0.5 w-full focus:outline-none focus:border-amber-500 placeholder-navy-600"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-navy-500">
            <p className="text-xs">No crew members added yet</p>
            <p className="text-[10px] mt-1">Click + to add personnel</p>
          </div>
        )}
      </div>

      {/* Add member form */}
      <div className="shrink-0 mt-2">
        {showAddForm ? (
          <div className="bg-navy-700/60 rounded p-2 border border-navy-600/50 space-y-1.5">
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-navy-900 border border-navy-600 text-white text-xs rounded px-2 py-1 w-full focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => { if (e.key === "Enter") addMember(); }}
              autoFocus
            />
            <select
              value={newTrade}
              onChange={(e) => setNewTrade(e.target.value)}
              className="bg-navy-900 border border-navy-600 text-white text-xs rounded px-2 py-1 w-full focus:outline-none focus:border-amber-500"
            >
              {TRADE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <Button size="sm" onClick={addMember} disabled={!newName.trim()} className="h-6 px-2 text-[10px] btn-gold-metallic hover:btn-gold-metallic flex-1">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewName(""); }} className="h-6 px-2 text-[10px] text-navy-400">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="w-full h-7 text-[10px] border-navy-600 text-navy-300 hover:text-amber-400 hover:border-amber-500"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Crew Member
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Existing Widgets ────────────────────────────────────────────────────────

function DailySummaryWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-2">
      {stats.dayDate && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy-400">{stats.dayDate}</span>
          <Badge className={stats.dayStatus === "ACTIVE" ? "bg-green-600" : stats.dayStatus === "CLOSED" ? "bg-red-600" : "bg-yellow-600"}>
            {stats.dayStatus}
          </Badge>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-xl font-bold text-amber-400">{stats.totalDives}</div>
          <div className="text-[10px] text-navy-300">Dives</div>
        </div>
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-xl font-bold text-green-400">{stats.logEntriesToday}</div>
          <div className="text-[10px] text-navy-300">Log Entries</div>
        </div>
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-xl font-bold text-cyan-400">{stats.directivesToday || 0}</div>
          <div className="text-[10px] text-navy-300">Directives</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between bg-navy-700/50 rounded px-2 py-1">
          <span className="text-navy-400">Completed</span>
          <span className="text-white font-mono">{stats.completedDives || 0}</span>
        </div>
        <div className="flex justify-between bg-navy-700/50 rounded px-2 py-1">
          <span className="text-navy-400">In Water</span>
          <span className="text-amber-400 font-mono">{stats.activeDives}</span>
        </div>
      </div>
    </div>
  );
}

function ActiveDivesWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-3xl font-bold text-amber-400">{stats.activeDives}</div>
        {stats.activeDives > 0 && (
          <Badge className="btn-gold-metallic animate-pulse">IN WATER</Badge>
        )}
      </div>
      <div className="text-xs text-navy-300 mb-2">Divers Currently In Water</div>
      {stats.activeDivers && stats.activeDivers.length > 0 ? (
        <div className="space-y-1 overflow-auto flex-1">
          {stats.activeDivers.map(diver => (
            <div key={diver.id} className="bg-navy-700 rounded px-2 py-1 flex justify-between items-center">
              <span className="text-white text-xs font-medium">{diver.name}</span>
              <span className="text-navy-400 text-xs">{diver.station || ""}</span>
            </div>
          ))}
        </div>
      ) : stats.activeDives === 0 ? (
        <div className="text-navy-500 text-xs text-center mt-2">No active dives</div>
      ) : null}
    </div>
  );
}

function SafetyWidget({ stats }: { stats: DashboardStats }) {
  const hasIssues = stats.safetyIncidents > 0 || stats.openRisks > 0;
  return (
    <div className="flex items-center justify-around h-full">
      <div className="text-center">
        <div className={`text-2xl font-bold ${stats.safetyIncidents > 0 ? "text-red-400" : "text-green-400"}`}>
          {stats.safetyIncidents}
        </div>
        <div className="text-xs text-navy-300">Safety Incidents</div>
      </div>
      <div className="text-center">
        <div className={`text-2xl font-bold ${stats.openRisks > 0 ? "text-yellow-400" : "text-green-400"}`}>
          {stats.openRisks}
        </div>
        <div className="text-xs text-navy-300">Open Risks</div>
      </div>
      {!hasIssues && (
        <Badge className="bg-green-600">ALL CLEAR</Badge>
      )}
    </div>
  );
}

function DiveStatsWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-navy-300">Completed</span>
        <span className="font-mono text-white">{stats.totalDives - stats.activeDives}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-navy-300">In Progress</span>
        <span className="font-mono text-amber-400">{stats.activeDives}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-navy-300">Log Entries</span>
        <span className="font-mono text-white">{stats.logEntriesToday}</span>
      </div>
    </div>
  );
}

function ProjectStatusWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex items-center justify-center h-full gap-4">
      <Badge className={stats.dayStatus === "ACTIVE" ? "bg-green-600" : stats.dayStatus === "CLOSED" ? "bg-red-600" : "bg-yellow-600"}>
        {stats.dayStatus || "NO DAY"}
      </Badge>
      <span className="text-sm text-navy-300">{stats.dayDate || "No active day"}</span>
    </div>
  );
}

function RiskRegisterWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className={`text-3xl font-bold ${stats.openRisks > 0 ? "text-yellow-400" : "text-green-400"}`}>
          {stats.openRisks}
        </div>
        {stats.openRisks === 0 && <Badge className="bg-green-600 text-xs">ALL CLEAR</Badge>}
      </div>
      <div className="text-xs text-navy-300 mb-2">Open Risk Items</div>
      {stats.recentRisks && stats.recentRisks.length > 0 && (
        <div className="space-y-1 overflow-auto flex-1">
          {stats.recentRisks.map(risk => (
            <div key={risk.id} className="bg-navy-700 rounded px-2 py-1">
              <div className="flex items-center gap-1">
                <span className="text-amber-400 font-mono text-[10px]">{risk.riskId}</span>
                <span className="text-navy-500 text-[10px]">{risk.source}</span>
              </div>
              <div className="text-white/70 text-[10px] truncate">{risk.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RecentLog {
  id: string;
  rawText: string;
  category: string;
  eventTime: string;
  captureTime: string;
  station?: string;
  masterLogLine?: string;
  internalLine?: string;
  aiStatus?: string;
}

function RecentLogsWidget({ projectId }: { projectId?: string } = {}) {
  const { data: recentLogs } = useQuery<RecentLog[]>({
    queryKey: ["dashboard-recent-logs", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/dashboard/recent-logs?projectId=${projectId}`
        : "/api/dashboard/recent-logs";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });

  if (!recentLogs || recentLogs.length === 0) {
    return (
      <div className="text-center text-navy-400 text-sm">
        <p>No log entries yet</p>
        <p className="text-xs mt-2">Add entries in the Daily Log tab</p>
      </div>
    );
  }

  const categoryColor: Record<string, string> = {
    directive: "text-cyan-400",
    safety: "text-red-400",
    dive_op: "text-amber-400",
    ops: "text-green-400",
    general: "text-navy-300",
  };

  return (
    <div className="space-y-1.5 overflow-auto h-full">
      {recentLogs.map(log => (
        <div key={log.id} className="bg-navy-700 rounded px-2 py-1.5 text-xs">
          <div className="flex justify-between items-center mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400 font-mono text-[10px]">
                {(() => { const d = new Date(log.eventTime); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; })()}
              </span>
              <span className={`uppercase text-[9px] font-semibold ${categoryColor[log.category] || "text-navy-300"}`}>
                {log.category?.replace("_", " ") || "general"}
              </span>
            </div>
            {log.station && (
              <span className="text-[9px] text-cyan-400/60">{log.station}</span>
            )}
          </div>
          <div className="text-white/80 text-[11px] line-clamp-2">
            {log.masterLogLine || log.rawText}
          </div>
          {log.masterLogLine && (
            <div className="flex items-center gap-1 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${log.aiStatus === "ok" ? "bg-green-500" : log.aiStatus === "needs_review" ? "bg-yellow-500" : "bg-navy-500"}`} />
              <span className="text-[9px] text-navy-500">AI processed</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface WeatherData {
  configured: boolean;
  location?: string;
  country?: string;
  temp?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  conditions?: string;
  description?: string;
  icon?: string;
  hasThunderstorm?: boolean;
}

interface LightningData {
  configured: boolean;
  hasUpcomingStorms?: boolean;
  thunderstormAlerts?: Array<{
    time: number;
    timeText: string;
    conditions: string;
    probability: number;
    temp: number;
  }>;
}

function WeatherWidget({ projectId }: { projectId?: string } = {}) {
  const { data: projects } = useQuery<any[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Use the selected project, not just projects[0]
  const project = projectId ? projects?.find((p: any) => p.id === projectId) : projects?.[0];
  
  // Parse lat/lng - handle numeric values and string formats like "36.8354° N"
  const parseDegree = (val: any): number | null => {
    if (val == null || val === "") return null;
    if (typeof val === "number") return val;
    const str = String(val).trim();
    const match = str.match(/([\d.]+)/);
    if (!match) return null;
    let num = parseFloat(match[1]);
    if (isNaN(num)) return null;
    if (/[SW]/i.test(str)) num = -num;
    return num;
  };
  
  const lat = parseDegree(project?.jobsiteLat);
  const lon = parseDegree(project?.jobsiteLng);
  const siteName = project?.jobsiteName || "Jobsite";

  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLon, setGeoLon] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat && !lon && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoLat(pos.coords.latitude);
          setGeoLon(pos.coords.longitude);
        },
        (err) => {
          setGeoError("Location access denied");
        },
        { timeout: 10000 }
      );
    }
  }, [lat, lon]);

  const effectiveLat = lat || geoLat;
  const effectiveLon = lon || geoLon;

  const { data: weather, isLoading: weatherLoading } = useQuery<WeatherData>({
    queryKey: ["weather", effectiveLat, effectiveLon],
    queryFn: async () => {
      const res = await fetch(`/api/weather?lat=${effectiveLat}&lon=${effectiveLon}`, { credentials: "include" });
      if (!res.ok) return { configured: false };
      return res.json();
    },
    enabled: !!effectiveLat && !!effectiveLon,
    refetchInterval: 300000,
    staleTime: 60000,
  });

  const { data: lightning } = useQuery<LightningData>({
    queryKey: ["lightning", effectiveLat, effectiveLon],
    queryFn: async () => {
      const res = await fetch(`/api/weather/lightning?lat=${effectiveLat}&lon=${effectiveLon}`, { credentials: "include" });
      if (!res.ok) return { configured: false };
      return res.json();
    },
    enabled: !!effectiveLat && !!effectiveLon,
    refetchInterval: 300000,
  });

  if (!effectiveLat || !effectiveLon) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <Cloud className="h-8 w-8 mb-2 opacity-50" />
        <p>{geoError || "Locating..."}</p>
        <p className="text-xs mt-1">Set lat/lng in project settings or allow location access</p>
      </div>
    );
  }

  if (weatherLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading weather...</div>;
  }

  if (!weather?.configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <CloudRain className="h-8 w-8 mb-2 opacity-50" />
        <p>Weather API not configured</p>
        <p className="text-xs mt-1">Add OPENWEATHER_API_KEY secret</p>
      </div>
    );
  }

  const getWeatherIcon = (icon?: string) => {
    if (!icon) return <Cloud className="h-8 w-8" />;
    if (icon.includes("01")) return <Sun className="h-8 w-8 text-yellow-400" />;
    if (icon.includes("02") || icon.includes("03") || icon.includes("04")) return <Cloud className="h-8 w-8 text-gray-400" />;
    if (icon.includes("09") || icon.includes("10")) return <CloudRain className="h-8 w-8 text-amber-400" />;
    if (icon.includes("11")) return <Zap className="h-8 w-8 text-yellow-400" />;
    return <Cloud className="h-8 w-8" />;
  };

  const tempF = weather.temp != null ? Math.round(weather.temp * 9 / 5 + 32) : null;
  const feelsLikeF = weather.feelsLike != null ? Math.round(weather.feelsLike * 9 / 5 + 32) : null;
  const windMph = weather.windSpeed != null ? Math.round(weather.windSpeed * 2.237) : null;

  return (
    <div className="space-y-2 p-1" data-testid="widget-weather">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getWeatherIcon(weather.icon)}
          <div>
            <div className="text-xl font-bold text-white">{tempF}°F</div>
            <div className="text-xs text-navy-300">{weather.conditions}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-navy-200">{weather.location || siteName}</div>
          <div className="text-xs text-navy-400">Feels like {feelsLikeF}°F</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1 text-navy-300">
          <Wind className="h-3 w-3" />
          {windMph} mph
        </div>
        <div className="flex items-center gap-1 text-navy-300">
          <Droplets className="h-3 w-3" />
          {weather.humidity}%
        </div>
      </div>

      {weather.hasThunderstorm && (
        <div className="flex items-center gap-2 bg-yellow-600/20 border border-yellow-600 rounded px-2 py-1">
          <Zap className="h-4 w-4 text-yellow-400 animate-pulse" />
          <span className="text-xs text-yellow-300">Thunderstorm Warning</span>
        </div>
      )}

      {lightning?.hasUpcomingStorms && !weather.hasThunderstorm && (
        <div className="flex items-center gap-2 bg-orange-600/20 border border-orange-600 rounded px-2 py-1">
          <Zap className="h-4 w-4 text-orange-400" />
          <span className="text-xs text-orange-300">Storms expected in forecast</span>
        </div>
      )}
    </div>
  );
}

function DiverCertsWidget({ projectId }: { projectId?: string } = {}) {
  const { data: users } = useQuery<any[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: allCerts } = useQuery<any[]>({
    queryKey: ["diver-certifications", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/diver-certifications?projectId=${projectId}`
        : "/api/diver-certifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const divers = users?.filter(u => u.role === "DIVER" || u.role === "SUPERVISOR") || [];

  // Group certs by userId
  const certsByUser = (allCerts || []).reduce((acc: Record<string, any[]>, cert: any) => {
    if (!acc[cert.userId]) acc[cert.userId] = [];
    acc[cert.userId].push(cert);
    return acc;
  }, {});

  // Certification status helper
  const getCertStatus = (expiryStr?: string) => {
    if (!expiryStr) return { label: "N/A", color: "bg-navy-600" };
    const expiry = new Date(expiryStr);
    const now = new Date();
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return { label: "EXPIRED", color: "bg-red-600" };
    if (daysUntil < 30) return { label: "EXPIRING", color: "bg-yellow-600" };
    return { label: "CURRENT", color: "bg-green-600" };
  };

  return (
    <div className="flex flex-col h-full" data-testid="widget-diver-certs">
      <div className="text-xs text-navy-300 mb-2">{divers.length} Personnel on Record</div>
      <div className="space-y-1 overflow-auto flex-1">
        {divers.slice(0, 10).map(diver => {
          const diverCerts = certsByUser[diver.id] || [];
          const medCert = diverCerts.find((c: any) => c.certType?.toLowerCase().includes("medical"));
          const diveCert = diverCerts.find((c: any) => c.certType?.toLowerCase().includes("dive"));
          const medStatus = getCertStatus(medCert?.expirationDate);
          const diveStatus = getCertStatus(diveCert?.expirationDate);
          const certNames = diverCerts.map((c: any) => c.certType).join(", ");
          return (
            <div key={diver.id} className="bg-navy-700 rounded px-2 py-1.5">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs font-medium">{diver.fullName || diver.username}</span>
                <span className="text-[9px] text-navy-400">{diver.role}</span>
              </div>
              <div className="flex gap-2 mt-1">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-navy-400">Medical:</span>
                  <Badge className={`${medStatus.color} text-[8px] px-1 py-0`}>{medStatus.label}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-navy-400">Dive Cert:</span>
                  <Badge className={`${diveStatus.color} text-[8px] px-1 py-0`}>{diveStatus.label}</Badge>
                </div>
              </div>
              {certNames && (
                <div className="text-[9px] text-navy-500 mt-0.5 truncate">
                  {certNames}
                </div>
              )}
            </div>
          );
        })}
        {divers.length === 0 && (
          <div className="text-navy-500 text-xs text-center mt-2">No divers registered</div>
        )}
      </div>
    </div>
  );
}

function EquipmentCertsWidget({ projectId }: { projectId?: string } = {}) {
  const { data: equipmentCerts } = useQuery<any[]>({
    queryKey: ["equipment-certifications", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/equipment-certifications?projectId=${projectId}`
        : "/api/equipment-certifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const items = equipmentCerts || [];

  const getCertStatus = (expiryStr?: string) => {
    if (!expiryStr) return { label: "N/A", color: "bg-navy-600" };
    const expiry = new Date(expiryStr);
    const now = new Date();
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return { label: "EXPIRED", color: "bg-red-600" };
    if (daysUntil < 30) return { label: "EXPIRING", color: "bg-yellow-600" };
    if (daysUntil < 90) return { label: "DUE SOON", color: "bg-orange-600" };
    return { label: "CURRENT", color: "bg-green-600" };
  };

  return (
    <div className="flex flex-col h-full" data-testid="widget-equipment-certs">
      <div className="text-xs text-navy-300 mb-2">{items.length} Items Tracked</div>
      <div className="space-y-1 overflow-auto flex-1">
        {items.length > 0 ? items.map((item: any) => {
          const cert = getCertStatus(item.expirationDate);
          return (
            <div key={item.id} className="bg-navy-700 rounded px-2 py-1.5">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs truncate font-medium">{item.equipmentName}</span>
                <Badge className={`${cert.color} text-[8px] px-1 py-0`}>{cert.label}</Badge>
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <span className="text-[9px] text-navy-500">{item.equipmentCategory}{item.serialNumber ? ` | S/N: ${item.serialNumber}` : ""}</span>
                <span className="text-[9px] text-navy-400">{item.expirationDate ? `Exp: ${new Date(item.expirationDate).toISOString().slice(0, 7)}` : "No expiry"}</span>
              </div>
            </div>
          );
        }) : (
          <div className="text-navy-500 text-xs text-center mt-2">No equipment certifications tracked</div>
        )}
      </div>
    </div>
  );
}

// ─── My Crew Quick-Entry Widget ─────────────────────────────────────────────

const CREW_STATIONS = ["Dive Team 1", "Dive Team 2", "Dive Team 3", "Subcontractor Dive Team 1", "Subcontractor Dive Team 2", "Night Shift"];

function MyCrewQuickEntryWidget({ projectId }: { projectId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProject, activeDay } = useProject();
  const { canWriteLogEvents } = useAuth();
  const [quickInput, setQuickInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Read the persisted station from localStorage (same key as daily-log)
  const [myCrew, setMyCrew] = useState<string>(() => {
    try {
      return localStorage.getItem("diveops_selected_station") || "";
    } catch {
      return "";
    }
  });

  // Listen for storage changes (in case user changes crew in daily-log tab)
  useEffect(() => {
    const syncCrew = () => {
      try {
        const stored = localStorage.getItem("diveops_selected_station") || "";
        setMyCrew(stored);
      } catch {}
    };
    window.addEventListener("storage", syncCrew);
    const interval = setInterval(syncCrew, 2000);
    return () => {
      window.removeEventListener("storage", syncCrew);
      clearInterval(interval);
    };
  }, []);

  const handleCrewChange = (newCrew: string) => {
    setMyCrew(newCrew);
    try {
      localStorage.setItem("diveops_selected_station", newCrew);
    } catch {}
  };

  // Fetch all log entries for the current day, then filter by crew/station
  const { data: allLogs = [] } = useQuery<any[]>({
    queryKey: ["dashboard-recent-logs", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/dashboard/recent-logs?projectId=${projectId}`
        : "/api/dashboard/recent-logs";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Also fetch from the live board for a fuller feed
  const { data: liveBoardData } = useLiveBoardData(projectId);
  const liveLogEntries = liveBoardData?.logEntries || [];

  // Merge and deduplicate: use live board entries (more complete) + recent logs
  const crewLogs = (() => {
    // Combine both sources
    const combined = [
      ...liveLogEntries.map((l: any) => ({
        id: l.id,
        rawText: l.rawText,
        station: l.station,
        category: l.category,
        eventTime: l.eventTime,
      })),
      ...allLogs.map((l: any) => ({
        id: l.id,
        rawText: l.masterLogLine || l.rawText,
        station: l.station,
        category: l.category,
        eventTime: l.eventTime,
      })),
    ];
    // Deduplicate by id
    const seen = new Set<string>();
    const unique = combined.filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
    // Filter by selected crew/station
    const filtered = myCrew
      ? unique.filter((l) => l.station === myCrew)
      : unique;
    // Sort newest first
    return filtered.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
  })();

  const handleQuickSubmit = async () => {
    if (!quickInput.trim() || !activeDay || !activeProject) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/log-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rawText: quickInput.trim(),
          dayId: activeDay.id,
          projectId: activeProject.id,
          station: myCrew || undefined,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) throw new Error("Failed to create event");
      setQuickInput("");
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-live-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days"] });
      queryClient.invalidateQueries({ queryKey: ["dives"] });
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      toast({ title: "Entry saved", description: `Logged to ${myCrew || "no station"}` });
    } catch {
      toast({ title: "Error", description: "Failed to save log entry", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryColor: Record<string, string> = {
    directive: "text-cyan-400",
    safety: "text-red-400",
    dive_op: "text-amber-400",
    ops: "text-green-400",
    general: "text-navy-300",
  };

  const formatLogTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const dayIsClosed = activeDay?.status === "CLOSED";
  const canSubmit = canWriteLogEvents && !!activeDay && !dayIsClosed;

  if (!activeDay) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-navy-500" data-testid="widget-my-crew-quick-entry">
        <Users className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-xs">No active shift</p>
        <p className="text-[10px] mt-1">Start a shift in the Daily Log tab</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="widget-my-crew-quick-entry">
      {/* Crew header */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Users className="h-3.5 w-3.5 text-cyan-400" />
        <select
          data-testid="my-crew-select"
          value={myCrew}
          onChange={(e) => handleCrewChange(e.target.value)}
          className="bg-navy-900 border border-navy-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500 flex-1"
        >
          <option value="">Select your crew</option>
          {CREW_STATIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {myCrew && (
          <Badge className="text-[9px] bg-cyan-700 text-cyan-100 shrink-0">{myCrew}</Badge>
        )}
      </div>

      {dayIsClosed && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 mb-2 shrink-0">
          <span>Shift is closed — read only</span>
        </div>
      )}

      {!canWriteLogEvents && !dayIsClosed && (
        <div className="flex items-center gap-1.5 text-xs text-navy-400 mb-2 shrink-0">
          <span>Log entry requires Supervisor role</span>
        </div>
      )}

      {/* Crew log feed */}
      <div className="flex-1 min-h-0 overflow-auto mb-2">
        {crewLogs.length > 0 ? (
          <div className="space-y-1">
            {crewLogs.map((log) => (
              <div key={log.id} className="bg-navy-700/60 rounded px-2 py-1.5 text-[11px]">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-mono text-[10px]">{formatLogTime(log.eventTime)}</span>
                    <span className={`uppercase text-[9px] font-semibold ${categoryColor[log.category] || "text-navy-300"}`}>
                      {log.category?.replace("_", " ") || "general"}
                    </span>
                  </div>
                  {log.station && (
                    <span className="text-[9px] text-cyan-400/60">{log.station}</span>
                  )}
                </div>
                <div className="text-white/80 text-[11px] line-clamp-2 leading-tight">{log.rawText}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-navy-500">
            <p className="text-xs">{myCrew ? `No entries for ${myCrew} yet` : "Select a crew to see entries"}</p>
          </div>
        )}
      </div>

      {/* Quick entry input */}
      {canSubmit && (
        <div className="flex flex-col gap-2 shrink-0">
          <Textarea
            data-testid="my-crew-quick-input"
            placeholder={myCrew ? `Quick log for ${myCrew}...` : "Select a crew first, then type your log entry..."}
            value={quickInput}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuickInput(e.target.value)}
            className="bg-navy-900 border-navy-600 text-white font-mono text-sm min-h-[48px] max-h-[100px] resize-none"
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleQuickSubmit();
              }
            }}
          />
          <Button
            data-testid="my-crew-quick-submit"
            size="sm"
            onClick={handleQuickSubmit}
            disabled={!quickInput.trim() || isSubmitting}
            className="h-8 btn-gold-metallic hover:btn-gold-metallic text-xs gap-1.5 self-end"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {isSubmitting ? "Sending..." : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}

function renderWidget(type: string, stats: DashboardStats, projectId?: string) {
  switch (type) {
    case "daily_summary":
      return <DailySummaryWidget stats={stats} />;
    case "active_dives":
      return <ActiveDivesWidget stats={stats} />;
    case "safety_incidents":
      return <SafetyWidget stats={stats} />;
    case "dive_stats":
      return <DiveStatsWidget stats={stats} />;
    case "project_status":
      return <ProjectStatusWidget stats={stats} />;
    case "risk_register":
      return <RiskRegisterWidget stats={stats} />;
    case "recent_logs":
      return <RecentLogsWidget projectId={projectId} />;
    case "weather":
      return <WeatherWidget projectId={projectId} />;
    case "diver_certs":
      return <DiverCertsWidget projectId={projectId} />;
    case "equipment_certs":
      return <EquipmentCertsWidget projectId={projectId} />;
    case "expiring_certs":
      return <ExpiringCertsWidget projectId={projectId} />;
    case "cert_status":
      return <CertStatusWidget projectId={projectId} />;
    case "live_dive_board":
      return <LiveDiveBoardWidget projectId={projectId} />;
    case "live_log_feed":
      return <LiveLogFeedWidget projectId={projectId} />;
    case "station_overview":
      return <StationOverviewWidget projectId={projectId} />;
    case "my_crew_quick_entry":
      return <MyCrewQuickEntryWidget projectId={projectId} />;
    default:
      return <div className="text-navy-400 text-sm">Unknown widget type</div>;
  }
}

// ─── Expiring Certifications Widget ─────────────────────────────────────────

function ExpiringCertsWidget({ projectId }: { projectId?: string }) {
  const { data: expiring } = useQuery<any[]>({
    queryKey: ["certifications-expiring", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/certifications/expiring?projectId=${projectId}`
        : "/api/certifications/expiring";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
  });

  const items = expiring || [];

  return (
    <div className="flex flex-col h-full" data-testid="widget-expiring-certs">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-yellow-400" />
        <span className="text-xs text-navy-300">{items.length} expiring within 30 days</span>
      </div>
      <div className="space-y-1 overflow-auto flex-1">
        {items.length > 0 ? items.slice(0, 10).map((item: any) => {
          const daysLeft = Math.ceil((new Date(item.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return (
            <div key={item.id} className="bg-navy-700 rounded px-2 py-1.5">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs font-medium truncate">
                  {item.certName || item.certType}
                </span>
                <Badge className={`${daysLeft < 0 ? 'bg-red-600' : daysLeft < 7 ? 'bg-red-500' : 'bg-yellow-600'} text-[8px] px-1 py-0`}>
                  {daysLeft < 0 ? 'EXPIRED' : `${daysLeft}d left`}
                </Badge>
              </div>
              <div className="text-[9px] text-navy-400 mt-0.5">
                {item.entityName || item.equipmentName || 'Unknown'} — {item.certType}
              </div>
            </div>
          );
        }) : (
          <div className="flex flex-col items-center justify-center h-full text-navy-500">
            <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No certifications expiring soon</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Certification Status Widget ────────────────────────────────────────────

function CertStatusWidget({ projectId }: { projectId?: string }) {
  const { data: stats } = useQuery<any>({
    queryKey: ["certifications-stats", projectId],
    queryFn: async () => {
      const url = projectId
        ? `/api/certifications/stats?projectId=${projectId}`
        : "/api/certifications/stats";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { active: 0, expiring: 0, expired: 0 };
      return res.json();
    },
    refetchInterval: 60000,
  });

  const certStats = stats || { active: 0, expiring: 0, expired: 0 };

  return (
    <div className="flex flex-col h-full" data-testid="widget-cert-status">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-cyan-400" />
        <span className="text-xs text-navy-300">Certification Overview</span>
      </div>
      <div className="grid grid-cols-3 gap-2 flex-1">
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-xl font-bold text-green-400">{certStats.active}</div>
          <div className="text-[10px] text-navy-300">Active</div>
        </div>
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-xl font-bold text-yellow-400">{certStats.expiring}</div>
          <div className="text-[10px] text-navy-300">Expiring</div>
        </div>
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-xl font-bold text-red-400">{certStats.expired}</div>
          <div className="text-[10px] text-navy-300">Expired</div>
        </div>
      </div>
      <div className="mt-2 text-[9px] text-navy-500 text-center">
        Personnel + Equipment combined
      </div>
    </div>
  );
}

export function DashboardTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { projects, activeProject, setActiveProject } = useProject();
  const [isEditing, setIsEditing] = useState(false);
  const [localLayout, setLocalLayout] = useState<WidgetConfig[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const selectedProjectId = activeProject?.id;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width - 32);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth - 32);
    return () => observer.disconnect();
  }, []);

  const { data: layout } = useQuery<DashboardLayout>({
    queryKey: ["dashboard-layout"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/layout", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load layout");
      return res.json();
    },
  });

  const { data: stats = { totalDives: 0, activeDives: 0, safetyIncidents: 0, openRisks: 0, logEntriesToday: 0 } } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId
        ? `/api/dashboard/stats?projectId=${selectedProjectId}`
        : "/api/dashboard/stats";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: !!selectedProjectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (widgets: WidgetConfig[]) => {
      const res = await fetch("/api/dashboard/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ widgets, version: (layout?.version || 0) + 1 }),
      });
      if (!res.ok) throw new Error("Failed to save layout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] });
      toast({ title: "Layout saved", description: "Your dashboard layout has been saved" });
      setIsEditing(false);
    },
  });

  useEffect(() => {
    if (layout?.widgets) {
      setLocalLayout(layout.widgets);
    }
  }, [layout]);

  const handleLayoutChange = useCallback((newLayout: GridLayoutItem[]) => {
    setLocalLayout(prev => 
      prev.map(widget => {
        const item = newLayout.find(l => l.i === widget.id);
        if (item) {
          return { ...widget, x: item.x, y: item.y, w: item.w, h: item.h };
        }
        return widget;
      })
    );
  }, []);

  const addWidget = (type: string) => {
    const widgetType = WIDGET_TYPES.find(w => w.type === type);
    if (!widgetType) return;

    const newWidget: WidgetConfig = {
      id: `w${Date.now()}`,
      type,
      title: widgetType.label,
      x: 0,
      y: Infinity,
      w: widgetType.defaultW,
      h: widgetType.defaultH,
    };
    setLocalLayout(prev => [...prev, newWidget]);
  };

  const removeWidget = (id: string) => {
    setLocalLayout(prev => prev.filter(w => w.id !== id));
  };

  const resetLayout = () => {
    setLocalLayout([
      { id: "w1", type: "live_dive_board", title: "Live Dive Board", x: 0, y: 0, w: 4, h: 3 },
      { id: "w2", type: "live_log_feed", title: "Live Log Feed", x: 0, y: 3, w: 2, h: 3 },
      { id: "w3", type: "station_overview", title: "Station Overview", x: 2, y: 3, w: 2, h: 3 },
      { id: "w4", type: "daily_summary", title: "Today's Summary", x: 0, y: 6, w: 2, h: 2 },
      { id: "w5", type: "safety_incidents", title: "Safety Status", x: 2, y: 6, w: 2, h: 2 },
      { id: "w6", type: "my_crew_quick_entry", title: "My Crew Quick-Entry", x: 4, y: 0, w: 2, h: 3 },
    ]);
  };

  const gridLayout: GridLayoutItem[] = localLayout.map(widget => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    minW: 1,
    minH: 1,
    static: false,
  }));

  const handleProjectSwitch = (projectId: string) => {
    setActiveProject(projectId);
    // Invalidate all dashboard queries so they refetch with the new project
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-live-board"] });
    queryClient.invalidateQueries({ queryKey: ["certifications-expiring"] });
    queryClient.invalidateQueries({ queryKey: ["certifications-stats"] });
    // BUG-5 FIX: Also invalidate library queries on project switch
    queryClient.invalidateQueries({ queryKey: ["library-exports"] });
    queryClient.invalidateQueries({ queryKey: ["library-docs"] });
    toast({ title: "Switching project", description: "Loading dashboard data for the selected project..." });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-navy-800 p-3 border-b border-navy-600 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {projects && projects.length > 1 ? (
              <Select
                value={activeProject?.id || ""}
                onValueChange={handleProjectSwitch}
              >
                <SelectTrigger
                  className="h-7 w-auto min-w-[140px] max-w-[250px] bg-navy-700 border-navy-500 text-white text-sm font-semibold px-2 py-1 focus:ring-amber-500"
                  data-testid="select-project-switcher"
                >
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-navy-800 border-navy-600">
                  {projects.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      className="text-navy-200 hover:bg-navy-700 focus:bg-navy-700 focus:text-white"
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <h2 className="text-sm font-semibold text-white" data-testid="text-dashboard-title">
                {activeProject?.name || "DiveOps"}
              </h2>
            )}
            {stats.dayStatus && (
              <Badge data-testid="badge-shift-status" className={stats.dayStatus === "ACTIVE" ? "bg-green-600" : stats.dayStatus === "CLOSED" ? "bg-red-600" : "bg-yellow-600"}>
                {stats.dayStatus === "ACTIVE" ? "SHIFT ACTIVE" : stats.dayStatus}
              </Badge>
            )}
            {stats.activeDives > 0 && (
              <Badge className="btn-gold-metallic animate-pulse" data-testid="badge-in-water">
                {stats.activeDives} IN WATER
              </Badge>
            )}
            {stats.openRisks > 0 && (
              <Badge className="bg-red-600" data-testid="badge-open-risks-header">
                {stats.openRisks} OPEN RISK{stats.openRisks > 1 ? "S" : ""}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="button-add-widget" variant="outline" size="sm" className="text-xs border-green-500 text-green-400">
                    <Plus className="h-3 w-3 mr-1" /> Add Widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-navy-800 border-navy-600">
                  {WIDGET_TYPES.map(wt => (
                    <DropdownMenuItem
                      key={wt.type}
                      onClick={() => addWidget(wt.type)}
                      className="text-navy-200 hover:bg-navy-700"
                    >
                      {wt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                data-testid="button-reset-layout"
                variant="outline"
                size="sm"
                onClick={resetLayout}
                className="text-xs border-yellow-500 text-yellow-400"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Reset
              </Button>
              <Button
                data-testid="button-save-layout"
                size="sm"
                onClick={() => saveMutation.mutate(localLayout)}
                disabled={saveMutation.isPending}
                className="text-xs bg-green-600 hover:bg-green-700"
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button
                data-testid="button-cancel-edit"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLocalLayout(layout?.widgets || []);
                  setIsEditing(false);
                }}
                className="text-xs text-navy-400"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              data-testid="button-edit-dashboard"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs border-amber-500 text-amber-400"
            >
              <Settings className="h-3 w-3 mr-1" /> Customize
            </Button>
          )}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={4}
          rowHeight={150}
          width={containerWidth}
          onLayoutChange={handleLayoutChange as any}
          isDraggable={isEditing}
          isResizable={isEditing}
          draggableHandle=".widget-drag-handle"
          resizeHandles={['se']}
        >
          {localLayout.map(widget => (
            <div key={widget.id} className="bg-navy-800 border border-navy-600 rounded-lg overflow-hidden">
              <div className="bg-navy-750 px-3 py-2 border-b border-navy-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <GripVertical className="h-4 w-4 text-navy-500 cursor-move widget-drag-handle" />
                  )}
                  <span className="text-sm font-medium text-white">{widget.title}</span>
                </div>
                {isEditing && (
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="text-navy-500 hover:text-red-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="p-3 h-[calc(100%-40px)] overflow-auto">
                {renderWidget(widget.type, stats, selectedProjectId)}
              </div>
            </div>
          ))}
        </GridLayout>

        {localLayout.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-navy-400">
            <p className="text-sm mb-4">No widgets on your dashboard</p>
            <Button onClick={() => setIsEditing(true)} variant="outline" className="border-amber-500 text-amber-400">
              <Plus className="h-4 w-4 mr-2" /> Add Widgets
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
