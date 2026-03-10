import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Download, Database, MessageSquare, FileText, Package, BookOpen, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, AlertTriangle, Shield, Clock, CheckCircle2, ClipboardList, LogIn, LogOut, KeyRound, UserPlus, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/hooks/use-project";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SopRecord {
  id: string;
  projectId: string;
  title: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserRecord {
  id: string;
  username: string;
  role: string;
  fullName?: string;
  initials?: string;
  email?: string;
}

interface Project {
  id: string;
  name: string;
  clientName: string;
  jobsiteName: string;
  jobsiteAddress?: string;
  jobsiteLat?: string;
  jobsiteLng?: string;
  timezone?: string;
}

interface ProjectMember {
  userId: string;
  projectId: string;
  role: string;
  user?: {
    id: string;
    username: string;
    fullName?: string;
    initials?: string;
  };
}

interface DirectoryFacility {
  id: string;
  name: string;
  facilityType: string;
  address: string;
  phone: string;
  travelTimeMinutes?: number;
  verifiedBy?: string;
  lastVerifiedAt?: string;
}

const ROLES = ["GOD", "ADMIN", "SUPERVISOR", "DIVER"] as const;
const FACILITY_TYPES = ["chamber", "hospital", "coastguard"] as const;

interface MLStats {
  conversations: number;
  messages: number;
  logEvents: number;
  projects: number;
  days: number;
  lastFullExport: { exportedAt: string; recordCount: number } | null;
  exportHistory: Array<{ id: number; exportType: string; recordCount: number; exportedAt: string }>;
}

function MLDataExportSection() {
  const { toast } = useToast();
  const { isGod } = useAuth();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery<MLStats>({
    queryKey: ["ml-export-stats"],
    queryFn: async () => {
      const res = await fetch("/api/ml-export/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: projects } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const handleDownload = async (endpoint: string, filename: string, label: string) => {
    setDownloading(label);
    try {
      const res = await fetch(`/api/ml-export/${endpoint}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: `${label} exported successfully` });
      refetchStats();
    } catch (error) {
      toast({ title: `Failed to export ${label}`, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handlePurge = async (type: string, projectId?: string) => {
    setPurging(true);
    try {
      const url = type === "project"
        ? `/api/ml-export/purge/project/${projectId}`
        : `/api/ml-export/purge/conversations`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Purge failed", variant: "destructive" });
        return;
      }
      toast({ title: data.message });
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (error) {
      toast({ title: "Purge operation failed", variant: "destructive" });
    } finally {
      setPurging(false);
      setPurgeConfirm(null);
    }
  };

  const hasFullExport = !!stats?.lastFullExport;
  const today = new Date().toISOString().split("T")[0];

  return (
    <ScrollArea className="h-[calc(100vh-240px)]">
      <div className="grid gap-4">
        <Card className="bg-navy-800/50 border-navy-600">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Database className="w-5 h-5 text-amber-400" />
              ML Training Data Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-navy-900/50 rounded-lg p-4 border border-navy-700">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span className="text-navy-400 text-sm">Conversations</span>
                </div>
                <p data-testid="stat-conversations" className="text-2xl font-bold text-white">{stats?.conversations ?? "—"}</p>
                <p className="text-navy-500 text-xs">{stats?.messages ?? 0} total messages</p>
              </div>
              <div className="bg-navy-900/50 rounded-lg p-4 border border-navy-700">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span className="text-navy-400 text-sm">Log Events</span>
                </div>
                <p data-testid="stat-log-events" className="text-2xl font-bold text-white">{stats?.logEvents ?? "—"}</p>
                <p className="text-navy-500 text-xs">raw text + structured output pairs</p>
              </div>
              <div className="bg-navy-900/50 rounded-lg p-4 border border-navy-700">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-amber-400" />
                  <span className="text-navy-400 text-sm">Format</span>
                </div>
                <p className="text-lg font-bold text-white">JSONL</p>
                <p className="text-navy-500 text-xs">ready for fine-tuning</p>
              </div>
            </div>

            {hasFullExport ? (
              <div className="flex items-center gap-2 p-3 bg-green-900/20 rounded-lg border border-green-700/30">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-green-400 text-sm font-medium">Full ML Bundle exported</p>
                  <p className="text-navy-400 text-xs">
                    Last export: {new Date(stats.lastFullExport!.exportedAt).toLocaleString()} ({stats.lastFullExport!.recordCount} records)
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-amber-900/20 rounded-lg border border-amber-700/30">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-amber-400 text-sm font-medium">No full bundle export yet</p>
                  <p className="text-navy-400 text-xs">Export the Full ML Bundle before data purge operations become available</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-navy-800/50 border-navy-600">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Download className="w-5 h-5 text-amber-400" />
              Export Datasets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-navy-900/50 rounded-lg border border-navy-700">
                <div>
                  <p className="text-white font-medium">AI Conversations</p>
                  <p className="text-navy-400 text-sm">All chat threads with system prompts, user inputs, and AI responses — JSONL format for fine-tuning</p>
                </div>
                <Button
                  data-testid="button-export-conversations"
                  className="btn-gold-metallic hover:btn-gold-metallic"
                  disabled={downloading !== null}
                  onClick={() => handleDownload("conversations", `diveops_conversations_${today}.jsonl`, "Conversations")}
                >
                  {downloading === "Conversations" ? "Exporting..." : "Download JSONL"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 bg-navy-900/50 rounded-lg border border-navy-700">
                <div>
                  <p className="text-white font-medium">Log Processing Training Data</p>
                  <p className="text-navy-400 text-sm">Raw supervisor notes paired with AI-extracted structured output — ideal for training classification models</p>
                </div>
                <Button
                  data-testid="button-export-log-training"
                  className="btn-gold-metallic hover:btn-gold-metallic"
                  disabled={downloading !== null}
                  onClick={() => handleDownload("log-training", `diveops_log_training_${today}.jsonl`, "Log Training")}
                >
                  {downloading === "Log Training" ? "Exporting..." : "Download JSONL"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 bg-navy-900/50 rounded-lg border border-navy-700">
                <div>
                  <p className="text-white font-medium">Full ML Bundle</p>
                  <p className="text-navy-400 text-sm">Complete dataset including conversations, log events, dives, and risks — single JSON file</p>
                </div>
                <Button
                  data-testid="button-export-full-bundle"
                  className="btn-gold-metallic hover:btn-gold-metallic"
                  disabled={downloading !== null}
                  onClick={() => handleDownload("full-bundle", `diveops_ml_bundle_${today}.json`, "Full Bundle")}
                >
                  {downloading === "Full Bundle" ? "Exporting..." : "Download JSON"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isGod && (
          <Card className="bg-navy-800/50 border-red-900/50">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                Data Purge (GOD Only)
              </CardTitle>
              <p className="text-navy-400 text-sm mt-1">
                Permanently delete operational data. Requires a full ML bundle export first to preserve training data.
              </p>
            </CardHeader>
            <CardContent>
              {!hasFullExport ? (
                <div className="flex items-center gap-3 p-4 bg-navy-900/50 rounded-lg border border-navy-700">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-amber-400 font-medium">Purge locked</p>
                    <p className="text-navy-400 text-sm">You must export the Full ML Bundle before any data can be purged. This ensures all training data is preserved.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-navy-900/50 rounded-lg border border-navy-700">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-medium">Purge AI Conversations</p>
                      {purgeConfirm === "conversations" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-red-400 text-sm">Confirm permanent deletion?</span>
                          <Button
                            data-testid="button-confirm-purge-conversations"
                            variant="destructive"
                            size="sm"
                            disabled={purging}
                            onClick={() => handlePurge("conversations")}
                          >
                            {purging ? "Purging..." : "Yes, Purge"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-navy-600 text-navy-300"
                            onClick={() => setPurgeConfirm(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          data-testid="button-purge-conversations"
                          variant="destructive"
                          size="sm"
                          onClick={() => setPurgeConfirm("conversations")}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Purge
                        </Button>
                      )}
                    </div>
                    <p className="text-navy-400 text-sm">Deletes all {stats?.conversations ?? 0} conversations and {stats?.messages ?? 0} messages</p>
                  </div>

                  {projects && projects.length > 0 && (
                    <div className="p-3 bg-navy-900/50 rounded-lg border border-navy-700">
                      <p className="text-white font-medium mb-3">Purge Project Data</p>
                      <p className="text-navy-400 text-sm mb-3">Permanently removes a project and all its days, log events, dives, risks, and exported documents</p>
                      <div className="space-y-2">
                        {projects.map((project) => (
                          <div key={project.id} className="flex items-center justify-between p-2 bg-navy-800/50 rounded border border-navy-700">
                            <span className="text-white text-sm">{project.name}</span>
                            {purgeConfirm === `project-${project.id}` ? (
                              <div className="flex items-center gap-2">
                                <span className="text-red-400 text-xs">Delete forever?</span>
                                <Button
                                  data-testid={`button-confirm-purge-project-${project.id}`}
                                  variant="destructive"
                                  size="sm"
                                  disabled={purging}
                                  onClick={() => handlePurge("project", project.id)}
                                >
                                  {purging ? "..." : "Confirm"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-navy-600 text-navy-300"
                                  onClick={() => setPurgeConfirm(null)}
                                >
                                  No
                                </Button>
                              </div>
                            ) : (
                              <Button
                                data-testid={`button-purge-project-${project.id}`}
                                variant="destructive"
                                size="sm"
                                onClick={() => setPurgeConfirm(`project-${project.id}`)}
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Purge
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {stats?.exportHistory && stats.exportHistory.length > 0 && (
          <Card className="bg-navy-800/50 border-navy-600">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Export History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.exportHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-2 bg-navy-900/50 rounded border border-navy-700">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        entry.exportType === "full-bundle"
                          ? "border-green-600 text-green-400"
                          : "border-amber-600 text-amber-400"
                      }>
                        {entry.exportType}
                      </Badge>
                      <span className="text-navy-400 text-sm">{entry.recordCount} records</span>
                    </div>
                    <span className="text-navy-500 text-xs">{new Date(entry.exportedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-navy-800/50 border-navy-600">
          <CardHeader>
            <CardTitle className="text-white text-base">Data Format Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-amber-400 font-medium">Conversations (JSONL)</p>
                <p className="text-navy-400">Each line = one conversation with full message history. Compatible with OpenAI fine-tuning format. Fields: conversation_id, title, messages[role, content, timestamp]</p>
              </div>
              <div>
                <p className="text-amber-400 font-medium">Log Training Data (JSONL)</p>
                <p className="text-navy-400">Each line = one log event. Input/output pairs: raw_text (supervisor input) mapped to category, extracted_json, structured_payload (AI-structured output). Ideal for training extraction/classification models.</p>
              </div>
              <div>
                <p className="text-amber-400 font-medium">Full Bundle (JSON)</p>
                <p className="text-navy-400">Single file with all datasets (conversations, log_events, dives, risks) plus metadata. Best for comprehensive analysis or building custom training pipelines.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

// AuditLogSection component - to be inserted into admin.tsx before AdminTab()

interface AuditEvent {
  id: string;
  correlationId: string;
  action: string;
  userId: string | null;
  userRole: string | null;
  projectId: string | null;
  dayId: string | null;
  targetId: string | null;
  targetType: string | null;
  metadata: Record<string, any> | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  ipAddress: string | null;
  timestamp: string;
}

type SortDir = "asc" | "desc";

function getEventIcon(action: string) {
  if (action === "auth.login") return <LogIn className="w-4 h-4 text-green-400" />;
  if (action === "auth.login_failed") return <LogIn className="w-4 h-4 text-red-400" />;
  if (action === "auth.logout") return <LogOut className="w-4 h-4 text-navy-400" />;
  if (action === "auth.password_change") return <KeyRound className="w-4 h-4 text-yellow-400" />;
  if (action === "user.create") return <UserPlus className="w-4 h-4 text-blue-400" />;
  if (action === "user.update") return <Shield className="w-4 h-4 text-blue-300" />;
  return <ClipboardList className="w-4 h-4 text-navy-400" />;
}

function getEventBadgeClass(action: string): string {
  if (action === "auth.login") return "bg-green-900/50 text-green-300 border-green-700";
  if (action === "auth.login_failed") return "bg-red-900/50 text-red-300 border-red-700";
  if (action === "auth.logout") return "bg-navy-700/50 text-navy-300 border-navy-600";
  if (action === "auth.password_change") return "bg-yellow-900/50 text-yellow-300 border-yellow-700";
  if (action.startsWith("user.")) return "bg-blue-900/50 text-blue-300 border-blue-700";
  if (action.startsWith("day.")) return "bg-purple-900/50 text-purple-300 border-purple-700";
  if (action.startsWith("export.")) return "bg-orange-900/50 text-orange-300 border-orange-700";
  return "bg-navy-700/50 text-navy-300 border-navy-600";
}

function formatEventLabel(action: string): string {
  const labels: Record<string, string> = {
    "auth.login": "Login",
    "auth.login_failed": "Login Failed",
    "auth.logout": "Logout",
    "auth.password_change": "Password Changed",
    "user.create": "User Created",
    "user.update": "User Updated",
    "day.create": "Day Created",
    "day.activate": "Day Activated",
    "day.close": "Day Closed",
    "day.close_override": "Day Closed (Override)",
    "day.reopen": "Day Reopened",
    "log_event.create": "Log Event Created",
    "log_event.update": "Log Event Updated",
    "log_event.delete": "Log Event Deleted",
    "risk.create": "Risk Created",
    "risk.update": "Risk Updated",
    "dive.create": "Dive Created",
    "dive.update": "Dive Updated",
    "export.generate": "Export Generated",
  };
  return labels[action] || action;
}

function getEventDetails(event: AuditEvent): string {
  const meta = event.metadata || {};
  if (event.action === "auth.login") return `User: ${meta.username || event.userId || "—"} · Role: ${meta.role || event.userRole || "—"}`;
  if (event.action === "auth.login_failed") return `Attempted: ${meta.username || "—"} · ${meta.reason || "Invalid credentials"}`;
  if (event.action === "auth.logout") return `User: ${meta.username || event.userId || "—"}`;
  if (event.action === "auth.password_change") return `User: ${meta.username || event.userId || "—"}${meta.forced ? " · Forced reset" : ""}`;
  if (event.action === "user.create") return `Created: ${meta.createdUsername || event.targetId || "—"} · Role: ${meta.role || "—"}`;
  if (event.action === "user.update") return `Updated user ${event.targetId || "—"}`;
  if (event.targetId) return `${event.targetType || "entity"}: ${event.targetId}`;
  return "—";
}

const ALL_EVENT_TYPES = [
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password_change",
  "user.create",
  "user.update",
  "day.create",
  "day.activate",
  "day.close",
  "day.close_override",
  "day.reopen",
  "log_event.create",
  "log_event.update",
  "log_event.delete",
  "risk.create",
  "risk.update",
  "dive.create",
  "dive.update",
  "export.generate",
];

function AuditLogSection({ allUsers }: { allUsers: UserRecord[] }) {
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const queryParams = new URLSearchParams();
  if (filterAction !== "all") queryParams.set("action", filterAction);
  if (filterUserId !== "all") queryParams.set("userId", filterUserId);
  if (filterDateFrom) queryParams.set("dateFrom", filterDateFrom);
  if (filterDateTo) queryParams.set("dateTo", filterDateTo);
  queryParams.set("limit", "500");

  const { data, isLoading, refetch, isFetching } = useQuery<{ events: AuditEvent[]; pagination: any }>({
    queryKey: ["audit-events", filterAction, filterUserId, filterDateFrom, filterDateTo],
    queryFn: async () => {
      const res = await fetch(`/api/audit-events?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit events");
      return res.json();
    },
    staleTime: 30_000,
  });

  const events = data?.events ?? [];

  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return sortDir === "desc" ? tb - ta : ta - tb;
  });

  function toggleSort() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }

  function clearFilters() {
    setFilterAction("all");
    setFilterUserId("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  const hasFilters = filterAction !== "all" || filterUserId !== "all" || filterDateFrom || filterDateTo;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-240px)]">
      {/* Filter Bar */}
      <Card className="bg-navy-800/50 border-navy-600 flex-shrink-0">
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Event Type Filter */}
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label className="text-navy-400 text-xs">Event Type</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="bg-navy-700 border-navy-600 text-white h-8 text-sm">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent className="bg-navy-800 border-navy-600">
                  <SelectItem value="all" className="text-white hover:bg-navy-700">All Events</SelectItem>
                  {ALL_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-white hover:bg-navy-700">
                      {formatEventLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User Filter */}
            <div className="flex flex-col gap-1 min-w-[180px]">
              <Label className="text-navy-400 text-xs">User</Label>
              <Select value={filterUserId} onValueChange={setFilterUserId}>
                <SelectTrigger className="bg-navy-700 border-navy-600 text-white h-8 text-sm">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent className="bg-navy-800 border-navy-600">
                  <SelectItem value="all" className="text-white hover:bg-navy-700">All Users</SelectItem>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-white hover:bg-navy-700">
                      {u.fullName || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="flex flex-col gap-1">
              <Label className="text-navy-400 text-xs">From</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="bg-navy-700 border-navy-600 text-white h-8 text-sm w-36"
              />
            </div>

            {/* Date To */}
            <div className="flex flex-col gap-1">
              <Label className="text-navy-400 text-xs">To</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="bg-navy-700 border-navy-600 text-white h-8 text-sm w-36"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 items-end pb-0.5">
              <Button
                size="sm"
                variant="outline"
                className="border-navy-500 h-8 text-xs"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {hasFilters && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-navy-500 h-8 text-xs text-navy-400"
                  onClick={clearFilters}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Count */}
            <div className="ml-auto flex items-end pb-0.5">
              <span className="text-navy-400 text-xs">{sorted.length} event{sorted.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-md border border-navy-600">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-6 h-6 animate-spin text-navy-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <ClipboardList className="w-8 h-8 text-navy-500" />
            <p className="text-navy-400 text-sm">No audit events found</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-navy-800 sticky top-0 z-10">
              <TableRow className="border-navy-600 hover:bg-navy-800">
                <TableHead className="text-navy-300 font-semibold w-[180px]">User</TableHead>
                <TableHead className="text-navy-300 font-semibold w-[180px]">Event Type</TableHead>
                <TableHead
                  className="text-navy-300 font-semibold w-[180px] cursor-pointer select-none"
                  onClick={toggleSort}
                >
                  <div className="flex items-center gap-1">
                    Timestamp
                    {sortDir === "desc" ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronUp className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-navy-300 font-semibold">Details</TableHead>
                <TableHead className="text-navy-300 font-semibold w-[120px]">IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((event) => {
                const actor = allUsers.find((u) => u.id === event.userId);
                const actorLabel = actor
                  ? (actor.fullName || actor.username)
                  : event.metadata?.username || event.userId || "—";
                const ts = new Date(event.timestamp);
                const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <TableRow key={event.id} className="border-navy-700 hover:bg-navy-800/40">
                    <TableCell className="text-white text-sm py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-navy-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {actor?.initials || actorLabel.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate max-w-[120px]" title={actorLabel}>{actorLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        {getEventIcon(event.action)}
                        <Badge className={`text-xs border ${getEventBadgeClass(event.action)}`}>
                          {formatEventLabel(event.action)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-navy-300 text-xs py-2">
                      <div>{dateStr}</div>
                      <div className="text-navy-500">{timeStr}</div>
                    </TableCell>
                    <TableCell className="text-navy-300 text-sm py-2 max-w-[300px]">
                      <span className="truncate block" title={getEventDetails(event)}>
                        {getEventDetails(event)}
                      </span>
                    </TableCell>
                    <TableCell className="text-navy-500 text-xs py-2 font-mono">
                      {event.ipAddress || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export function AdminTab() {
  const { isAdmin, isGod } = useAuth();
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("projects");

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [manageTeamOpen, setManageTeamOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [sopDialogOpen, setSopDialogOpen] = useState(false);
  const [editingSop, setEditingSop] = useState<SopRecord | null>(null);
  const [sopForm, setSopForm] = useState({ title: "", content: "" });

  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  const [createFacilityOpen, setCreateFacilityOpen] = useState(false);
  const [editFacilityOpen, setEditFacilityOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<DirectoryFacility | null>(null);

  const [browserGeo, setBrowserGeo] = useState<{ lat: string; lng: string; tz: string }>({ lat: "", lng: "", tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York" });
  
  // Bug #8: Auto-populate lat/lng and timezone from browser
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBrowserGeo({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude), tz });
        },
        () => {
          setBrowserGeo((prev) => ({ ...prev, tz }));
        },
        { timeout: 5000 }
      );
    } else {
      setBrowserGeo((prev) => ({ ...prev, tz }));
    }
  }, []);
  
  const [projectForm, setProjectForm] = useState({
    name: "",
    clientName: "",
    jobsiteName: "",
    jobsiteAddress: "",
    jobsiteLat: "",
    jobsiteLng: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  });

  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    fullName: "",
    initials: "",
    email: "",
    role: "DIVER" as string,
  });

  const [facilityForm, setFacilityForm] = useState({
    name: "",
    facilityType: "chamber" as string,
    address: "",
    phone: "",
    travelTimeMinutes: "",
    lat: "",
    lng: "",
  });

  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("DIVER");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: facilities = [] } = useQuery<DirectoryFacility[]>({
    queryKey: ["directory-facilities"],
    queryFn: async () => {
      const res = await fetch("/api/directory-facilities", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: allUsers = [] } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: teamMembers = [], refetch: refetchTeam } = useQuery<ProjectMember[]>({
    queryKey: ["project-members", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return [];
      const res = await fetch(`/api/projects/${selectedProject.id}/members`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedProject && manageTeamOpen,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: typeof projectForm) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create project" }));
        throw new Error(err.message || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCreateProjectOpen(false);
      resetProjectForm();
      toast({ title: "Project created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create project", variant: "destructive" });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof projectForm }) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditProjectOpen(false);
      setSelectedProject(null);
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ projectId, userId, role }: { projectId: string; userId: string; role: string }) => {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error("Failed to add member");
      return res.json();
    },
    onSuccess: () => {
      refetchTeam();
      setAddMemberUserId("");
      setAddMemberRole("DIVER");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove member");
    },
    onSuccess: () => {
      refetchTeam();
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof userForm) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create user" }));
        throw new Error(err.message || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateUserOpen(false);
      resetUserForm();
      if (data.temporaryPassword) {
        toast({
          title: "User created — share temporary password",
          description: `Temp password for ${data.username}: ${data.temporaryPassword} — User must change it on first login.`,
          duration: 30000,
        });
      } else {
        toast({ title: "User created successfully" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create user", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof userForm> }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditUserOpen(false);
      setSelectedUser(null);
    },
  });

  const createFacilityMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch("/api/directory-facilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create facility" }));
        throw new Error(err.message || "Failed to create facility");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory-facilities"] });
      setCreateFacilityOpen(false);
      resetFacilityForm();
      toast({ title: "Facility added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create facility", variant: "destructive" });
    },
  });

  const updateFacilityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await fetch(`/api/directory-facilities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update facility");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory-facilities"] });
      setEditFacilityOpen(false);
      setSelectedFacility(null);
    },
  });

  const { data: sops = [] } = useQuery<SopRecord[]>({
    queryKey: ["project-sops", activeProject?.id],
    queryFn: async () => {
      if (!activeProject) return [];
      const res = await fetch(`/api/projects/${activeProject.id}/sops`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject,
  });

  const createSopMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      if (!activeProject) throw new Error("No active project");
      const res = await fetch(`/api/projects/${activeProject.id}/sops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create SOP" }));
        throw new Error(err.message || "Failed to create SOP");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-sops"] });
      setSopDialogOpen(false);
      setSopForm({ title: "", content: "" });
      toast({ title: "SOP created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to create SOP", variant: "destructive" });
    },
  });

  const updateSopMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SopRecord> }) => {
      const res = await fetch(`/api/sops/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update SOP" }));
        throw new Error(err.message || "Failed to update SOP");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-sops"] });
      setSopDialogOpen(false);
      setEditingSop(null);
      setSopForm({ title: "", content: "" });
      toast({ title: "SOP updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to update SOP", variant: "destructive" });
    },
  });

  const deleteSopMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sops/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete SOP" }));
        throw new Error(err.message || "Failed to delete SOP");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-sops"] });
      toast({ title: "SOP deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to delete SOP", variant: "destructive" });
    },
  });

  const toggleSopMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/sops/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle SOP");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-sops"] });
    },
  });

  function resetProjectForm() {
    setProjectForm({ name: "", clientName: "", jobsiteName: "", jobsiteAddress: "", jobsiteLat: browserGeo.lat, jobsiteLng: browserGeo.lng, timezone: browserGeo.tz });
  }

  function resetUserForm() {
    setUserForm({ username: "", password: "", fullName: "", initials: "", email: "", role: "DIVER" });
  }

  function resetFacilityForm() {
    setFacilityForm({ name: "", facilityType: "chamber", address: "", phone: "", travelTimeMinutes: "", lat: browserGeo.lat, lng: browserGeo.lng });
  }

  function openEditProject(project: Project) {
    setSelectedProject(project);
    setProjectForm({
      name: project.name || "",
      clientName: project.clientName || "",
      jobsiteName: project.jobsiteName || "",
      jobsiteAddress: project.jobsiteAddress || "",
      jobsiteLat: project.jobsiteLat || "",
      jobsiteLng: project.jobsiteLng || "",
      timezone: project.timezone || "America/New_York",
    });
    setEditProjectOpen(true);
  }

  function openManageTeam(project: Project) {
    setSelectedProject(project);
    setManageTeamOpen(true);
  }

  function openEditUser(user: UserRecord) {
    setSelectedUser(user);
    setUserForm({
      username: user.username || "",
      password: "",
      fullName: user.fullName || "",
      initials: user.initials || "",
      email: user.email || "",
      role: user.role || "DIVER",
    });
    setEditUserOpen(true);
  }

  function openEditFacility(facility: DirectoryFacility) {
    setSelectedFacility(facility);
    setFacilityForm({
      name: facility.name || "",
      facilityType: facility.facilityType || "chamber",
      address: facility.address || "",
      phone: facility.phone || "",
      travelTimeMinutes: facility.travelTimeMinutes?.toString() || "",
    });
    setEditFacilityOpen(true);
  }

  function handleSubmitProject(isCreate: boolean) {
    if (isCreate) {
      createProjectMutation.mutate(projectForm);
    } else if (selectedProject) {
      updateProjectMutation.mutate({ id: selectedProject.id, data: projectForm });
    }
  }

  function handleSubmitUser(isCreate: boolean) {
    if (isCreate) {
      createUserMutation.mutate(userForm);
    } else if (selectedUser) {
      const payload: Record<string, any> = { ...userForm };
      if (!payload.password) delete payload.password;
      updateUserMutation.mutate({ id: selectedUser.id, data: payload });
    }
  }

  function handleSubmitFacility(isCreate: boolean) {
    const payload: Record<string, any> = {
      ...facilityForm,
      travelTimeMinutes: facilityForm.travelTimeMinutes ? parseInt(facilityForm.travelTimeMinutes) : undefined,
      lat: facilityForm.lat || browserGeo.lat || "0",
      lng: facilityForm.lng || browserGeo.lng || "0",
    };
    if (isCreate) {
      createFacilityMutation.mutate(payload);
    } else if (selectedFacility) {
      updateFacilityMutation.mutate({ id: selectedFacility.id, data: payload });
    }
  }

  const getFacilityTypeColor = (type: string) => {
    switch (type) {
      case "chamber": return "btn-gold-metallic";
      case "hospital": return "bg-red-600";
      case "coastguard": return "bg-orange-600";
      default: return "bg-gray-600";
    }
  };

  const ROLE_DISPLAY: Record<string, string> = {
    GOD: "System Admin",
    ADMIN: "Administrator",
    SUPERVISOR: "Supervisor",
    DIVER: "Diver",
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "GOD": return "bg-purple-600";
      case "ADMIN": return "bg-blue-600";
      case "SUPERVISOR": return "bg-green-600";
      case "DIVER": return "bg-cyan-600";
      default: return "bg-gray-600";
    }
  };

  const displayRole = (role: string) => ROLE_DISPLAY[role] || role;

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-navy-400">Admin access required</p>
      </div>
    );
  }

  const memberUserIds = new Set(teamMembers.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Administration</h2>
        <p className="text-sm text-navy-400">
          Manage projects, users, and system settings
        </p>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection} className="h-[calc(100vh-160px)]">
        <TabsList className="bg-navy-800 border-navy-600 mb-4">
          <TabsTrigger
            data-testid="admin-tab-projects"
            value="projects"
            className="data-[state=active]:bg-navy-700"
          >
            Projects
          </TabsTrigger>
          <TabsTrigger
            data-testid="admin-tab-users"
            value="users"
            className="data-[state=active]:bg-navy-700"
          >
            Users
          </TabsTrigger>
          <TabsTrigger
            data-testid="admin-tab-directory"
            value="directory"
            className="data-[state=active]:bg-navy-700"
          >
            Facility Directory
          </TabsTrigger>
          <TabsTrigger
            data-testid="admin-tab-sops"
            value="sops"
            className="data-[state=active]:bg-navy-700"
          >
            SOPs
          </TabsTrigger>
          {isGod && (
            <TabsTrigger
              data-testid="admin-tab-ml-export"
              value="ml-export"
              className="data-[state=active]:bg-navy-700"
            >
              ML Data
            </TabsTrigger>
          )}
          {isGod && (
            <TabsTrigger
              data-testid="admin-tab-system"
              value="system"
              className="data-[state=active]:bg-navy-700"
            >
              System
            </TabsTrigger>
          )}
          <TabsTrigger
            data-testid="admin-tab-audit"
            value="audit"
            className="data-[state=active]:bg-navy-700"
          >
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* ───── PROJECTS TAB ───── */}
        <TabsContent value="projects" className="h-full mt-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="grid gap-4">
              <Button
                data-testid="button-create-project"
                className="btn-gold-metallic hover:btn-gold-metallic w-full"
                onClick={() => {
                  resetProjectForm();
                  setCreateProjectOpen(true);
                }}
              >
                Create Project
              </Button>

              {projects.map((project) => (
                <Card
                  key={project.id}
                  data-testid={`project-card-${project.id}`}
                  className="bg-navy-800/50 border-navy-600"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-base">{project.name}</CardTitle>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-navy-400">Client</Label>
                        <p className="text-white">{project.clientName}</p>
                      </div>
                      <div>
                        <Label className="text-navy-400">Jobsite</Label>
                        <p className="text-white">{project.jobsiteName}</p>
                      </div>
                      {project.jobsiteAddress && (
                        <div className="col-span-2">
                          <Label className="text-navy-400">Address</Label>
                          <p className="text-white">{project.jobsiteAddress}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        data-testid={`button-edit-project-${project.id}`}
                        size="sm"
                        variant="outline"
                        className="border-navy-500"
                        onClick={() => openEditProject(project)}
                      >
                        Edit
                      </Button>
                      <Button
                        data-testid={`button-manage-team-${project.id}`}
                        size="sm"
                        variant="outline"
                        className="border-navy-500"
                        onClick={() => openManageTeam(project)}
                      >
                        Manage Team
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {projects.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-navy-400">No projects found</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ───── USERS TAB ───── */}
        <TabsContent value="users" className="h-full mt-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="grid gap-4">
              <Button
                data-testid="button-create-user"
                className="btn-gold-metallic hover:btn-gold-metallic w-full"
                onClick={() => {
                  resetUserForm();
                  setCreateUserOpen(true);
                }}
              >
                Create User
              </Button>

              {allUsers.map((u) => (
                <Card
                  key={u.id}
                  data-testid={`user-card-${u.id}`}
                  className="bg-navy-800/50 border-navy-600"
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center text-white font-bold text-sm">
                          {u.initials || u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-white font-medium" data-testid={`text-username-${u.id}`}>
                              {u.fullName || u.username}
                            </h3>
                            <Badge className={getRoleBadgeColor(u.role)} data-testid={`badge-role-${u.id}`}>
                              {displayRole(u.role)}
                            </Badge>
                          </div>
                          <p className="text-sm text-navy-400" data-testid={`text-email-${u.id}`}>
                            {u.email || "No email"} · @{u.username}
                          </p>
                        </div>
                      </div>
                      <Button
                        data-testid={`button-edit-user-${u.id}`}
                        size="sm"
                        variant="outline"
                        className="border-navy-500"
                        onClick={() => openEditUser(u)}
                      >
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {allUsers.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-navy-400">No users found</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ───── FACILITY DIRECTORY TAB ───── */}
        <TabsContent value="directory" className="h-full mt-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="grid gap-4">
              {facilities.map((facility) => (
                <Card
                  key={facility.id}
                  data-testid={`facility-card-${facility.id}`}
                  className="bg-navy-800/50 border-navy-600"
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-medium">{facility.name}</h3>
                          <Badge className={getFacilityTypeColor(facility.facilityType)}>
                            {facility.facilityType}
                          </Badge>
                        </div>
                        <p className="text-sm text-navy-400 mt-1">{facility.address}</p>
                        <p className="text-sm text-navy-400">{facility.phone}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {facility.travelTimeMinutes && (
                            <p className="text-sm text-amber-400">
                              {facility.travelTimeMinutes} min
                            </p>
                          )}
                          {facility.lastVerifiedAt && (
                            <p className="text-xs text-navy-500">
                              Verified {new Date(facility.lastVerifiedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          data-testid={`button-edit-facility-${facility.id}`}
                          size="sm"
                          variant="outline"
                          className="border-navy-500"
                          onClick={() => openEditFacility(facility)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button
                data-testid="button-add-facility"
                className="btn-gold-metallic hover:btn-gold-metallic w-full"
                onClick={() => {
                  resetFacilityForm();
                  setCreateFacilityOpen(true);
                }}
              >
                Add Facility
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ───── SOPS TAB ───── */}
        <TabsContent value="sops" className="h-full mt-0">
          <ScrollArea className="h-[calc(100vh-240px)]">
            <div className="grid gap-4">
              {!activeProject ? (
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardContent className="py-8 text-center">
                    <p className="text-navy-400">Select a project to manage SOPs</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium">Standard Operating Procedures</h3>
                      <p className="text-sm text-navy-400">
                        Active SOPs are included in AI prompts when processing log entries for {activeProject.name}
                      </p>
                    </div>
                    <Button
                      data-testid="button-create-sop"
                      className="btn-gold-metallic"
                      size="sm"
                      onClick={() => {
                        setEditingSop(null);
                        setSopForm({ title: "", content: "" });
                        setSopDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add SOP
                    </Button>
                  </div>

                  {sops.length === 0 ? (
                    <Card className="bg-navy-800/50 border-navy-600">
                      <CardContent className="py-8 text-center">
                        <BookOpen className="h-8 w-8 text-navy-500 mx-auto mb-2" />
                        <p className="text-navy-400">No SOPs yet. Add your first Standard Operating Procedure.</p>
                        <p className="text-xs text-navy-500 mt-1">
                          SOPs tell the AI how to process and format log entries for this project.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    sops.map((sop) => (
                      <Card
                        key={sop.id}
                        data-testid={`sop-card-${sop.id}`}
                        className={`border-navy-600 ${sop.isActive ? "bg-navy-800/50" : "bg-navy-900/50 opacity-60"}`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-white text-base">{sop.title}</CardTitle>
                              <Badge className={sop.isActive ? "bg-green-600" : "bg-gray-600"}>
                                {sop.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                data-testid={`button-toggle-sop-${sop.id}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleSopMutation.mutate({ id: sop.id, isActive: !sop.isActive })}
                                title={sop.isActive ? "Deactivate" : "Activate"}
                              >
                                {sop.isActive ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                              </Button>
                              <Button
                                data-testid={`button-edit-sop-${sop.id}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSop(sop);
                                  setSopForm({ title: sop.title, content: sop.content });
                                  setSopDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                data-testid={`button-delete-sop-${sop.id}`}
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-300"
                                onClick={() => {
                                  if (confirm("Delete this SOP?")) {
                                    deleteSopMutation.mutate(sop.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <pre className="text-sm text-navy-300 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
                            {sop.content}
                          </pre>
                          <p className="text-xs text-navy-500 mt-2">
                            Updated: {new Date(sop.updatedAt).toLocaleDateString()}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ───── ML DATA EXPORT TAB ───── */}
        {isGod && (
          <TabsContent value="ml-export" className="h-full mt-0">
            <MLDataExportSection />
          </TabsContent>
        )}

        {/* ───── SYSTEM TAB ───── */}
        {isGod && (
          <TabsContent value="system" className="h-full mt-0">
            <div className="grid gap-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader>
                  <CardTitle className="text-white text-base">System Controls</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-navy-400">AI Model</Label>
                      <p className="text-white font-mono">gpt-5.2</p>
                    </div>
                    <div>
                      <Label className="text-navy-400">Prompt Version</Label>
                      <p className="text-white font-mono">v1.0</p>
                    </div>
                    <Button
                      data-testid="button-regenerate-renders"
                      variant="outline"
                      className="border-navy-500"
                    >
                      Regenerate All AI Renders
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
        {/* ───── AUDIT LOG TAB ───── */}
        <TabsContent value="audit" className="h-full mt-0">
          <AuditLogSection allUsers={allUsers} />
        </TabsContent>
      </Tabs>

      {/* ───── CREATE PROJECT DIALOG ───── */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">Project Name</Label>
              <Input
                data-testid="input-project-name"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Client Name</Label>
              <Input
                data-testid="input-project-client"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.clientName}
                onChange={(e) => setProjectForm({ ...projectForm, clientName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Jobsite Name</Label>
              <Input
                data-testid="input-project-jobsite"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.jobsiteName}
                onChange={(e) => setProjectForm({ ...projectForm, jobsiteName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Jobsite Address</Label>
              <Input
                data-testid="input-project-address"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.jobsiteAddress}
                onChange={(e) => setProjectForm({ ...projectForm, jobsiteAddress: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Latitude</Label>
                <Input
                  data-testid="input-project-lat"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={projectForm.jobsiteLat}
                  onChange={(e) => setProjectForm({ ...projectForm, jobsiteLat: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Longitude</Label>
                <Input
                  data-testid="input-project-lng"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={projectForm.jobsiteLng}
                  onChange={(e) => setProjectForm({ ...projectForm, jobsiteLng: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-navy-300">Timezone</Label>
              <Input
                data-testid="input-project-timezone"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.timezone}
                onChange={(e) => setProjectForm({ ...projectForm, timezone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-create-project"
              variant="outline"
              className="border-navy-500"
              onClick={() => setCreateProjectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-create-project"
              className="btn-gold-metallic hover:btn-gold-metallic"
              onClick={() => handleSubmitProject(true)}
              disabled={createProjectMutation.isPending}
            >
              {createProjectMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── EDIT PROJECT DIALOG ───── */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">Project Name</Label>
              <Input
                data-testid="input-edit-project-name"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Client Name</Label>
              <Input
                data-testid="input-edit-project-client"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.clientName}
                onChange={(e) => setProjectForm({ ...projectForm, clientName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Jobsite Name</Label>
              <Input
                data-testid="input-edit-project-jobsite"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.jobsiteName}
                onChange={(e) => setProjectForm({ ...projectForm, jobsiteName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Jobsite Address</Label>
              <Input
                data-testid="input-edit-project-address"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.jobsiteAddress}
                onChange={(e) => setProjectForm({ ...projectForm, jobsiteAddress: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Latitude</Label>
                <Input
                  data-testid="input-edit-project-lat"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={projectForm.jobsiteLat}
                  onChange={(e) => setProjectForm({ ...projectForm, jobsiteLat: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Longitude</Label>
                <Input
                  data-testid="input-edit-project-lng"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={projectForm.jobsiteLng}
                  onChange={(e) => setProjectForm({ ...projectForm, jobsiteLng: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-navy-300">Timezone</Label>
              <Input
                data-testid="input-edit-project-timezone"
                className="bg-navy-800 border-navy-600 text-white"
                value={projectForm.timezone}
                onChange={(e) => setProjectForm({ ...projectForm, timezone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-edit-project"
              variant="outline"
              className="border-navy-500"
              onClick={() => setEditProjectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-edit-project"
              className="btn-gold-metallic hover:btn-gold-metallic"
              onClick={() => handleSubmitProject(false)}
              disabled={updateProjectMutation.isPending}
            >
              {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── MANAGE TEAM DIALOG ───── */}
      <Dialog open={manageTeamOpen} onOpenChange={setManageTeamOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              Manage Team — {selectedProject?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-navy-300">Current Members</Label>
              {teamMembers.length === 0 && (
                <p className="text-navy-400 text-sm">No team members yet</p>
              )}
              {teamMembers.map((member) => (
                <div
                  key={member.userId}
                  data-testid={`team-member-${member.userId}`}
                  className="flex items-center justify-between bg-navy-800 rounded-lg p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white">
                      {member.user?.fullName || member.user?.username || member.userId}
                    </span>
                    <Badge className={getRoleBadgeColor(member.role)}>
                      {member.role}
                    </Badge>
                  </div>
                  <Button
                    data-testid={`button-remove-member-${member.userId}`}
                    size="sm"
                    variant="outline"
                    className="border-red-500 text-red-400 hover:bg-red-900/30"
                    onClick={() =>
                      selectedProject &&
                      removeMemberMutation.mutate({
                        projectId: selectedProject.id,
                        userId: member.userId,
                      })
                    }
                    disabled={removeMemberMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t border-navy-600 pt-4">
              <Label className="text-navy-300">Add Member</Label>
              <div className="flex gap-2 mt-2">
                <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                  <SelectTrigger
                    data-testid="select-add-member-user"
                    className="bg-navy-800 border-navy-600 text-white flex-1"
                  >
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent className="bg-navy-800 border-navy-600">
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-white">
                        {u.fullName || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={addMemberRole} onValueChange={setAddMemberRole}>
                  <SelectTrigger
                    data-testid="select-add-member-role"
                    className="bg-navy-800 border-navy-600 text-white w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-navy-800 border-navy-600">
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-white">
                        {displayRole(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  data-testid="button-add-member"
                  className="btn-gold-metallic hover:btn-gold-metallic"
                  disabled={!addMemberUserId || addMemberMutation.isPending}
                  onClick={() =>
                    selectedProject &&
                    addMemberMutation.mutate({
                      projectId: selectedProject.id,
                      userId: addMemberUserId,
                      role: addMemberRole,
                    })
                  }
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-close-manage-team"
              variant="outline"
              className="border-navy-500"
              onClick={() => setManageTeamOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── CREATE USER DIALOG ───── */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">Username</Label>
              <Input
                data-testid="input-user-username"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Password</Label>
              <Input
                data-testid="input-user-password"
                type="password"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Full Name</Label>
              <Input
                data-testid="input-user-fullname"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.fullName}
                onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Initials</Label>
                <Input
                  data-testid="input-user-initials"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={userForm.initials}
                  onChange={(e) => setUserForm({ ...userForm, initials: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Role</Label>
                <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                  <SelectTrigger
                    data-testid="select-user-role"
                    className="bg-navy-800 border-navy-600 text-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-navy-800 border-navy-600">
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-white">
                        {displayRole(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-navy-300">Email</Label>
              <Input
                data-testid="input-user-email"
                type="email"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-create-user"
              variant="outline"
              className="border-navy-500"
              onClick={() => setCreateUserOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-create-user"
              className="btn-gold-metallic hover:btn-gold-metallic"
              onClick={() => handleSubmitUser(true)}
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── EDIT USER DIALOG ───── */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Edit User — {selectedUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">Full Name</Label>
              <Input
                data-testid="input-edit-user-fullname"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.fullName}
                onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Password (leave blank to keep current)</Label>
              <Input
                data-testid="input-edit-user-password"
                type="password"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Initials</Label>
                <Input
                  data-testid="input-edit-user-initials"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={userForm.initials}
                  onChange={(e) => setUserForm({ ...userForm, initials: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Role</Label>
                <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                  <SelectTrigger
                    data-testid="select-edit-user-role"
                    className="bg-navy-800 border-navy-600 text-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-navy-800 border-navy-600">
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-white">
                        {displayRole(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-navy-300">Email</Label>
              <Input
                data-testid="input-edit-user-email"
                type="email"
                className="bg-navy-800 border-navy-600 text-white"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-edit-user"
              variant="outline"
              className="border-navy-500"
              onClick={() => setEditUserOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-edit-user"
              className="btn-gold-metallic hover:btn-gold-metallic"
              onClick={() => handleSubmitUser(false)}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── CREATE FACILITY DIALOG ───── */}
      <Dialog open={createFacilityOpen} onOpenChange={setCreateFacilityOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Add Facility</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">Facility Name</Label>
              <Input
                data-testid="input-facility-name"
                className="bg-navy-800 border-navy-600 text-white"
                value={facilityForm.name}
                onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Type</Label>
              <Select
                value={facilityForm.facilityType}
                onValueChange={(v) => setFacilityForm({ ...facilityForm, facilityType: v })}
              >
                <SelectTrigger
                  data-testid="select-facility-type"
                  className="bg-navy-800 border-navy-600 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-navy-800 border-navy-600">
                  {FACILITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-white">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-navy-300">Address</Label>
              <Input
                data-testid="input-facility-address"
                className="bg-navy-800 border-navy-600 text-white"
                placeholder="Enter address and press Tab to auto-fill lat/lng"
                value={facilityForm.address}
                onChange={(e) => setFacilityForm({ ...facilityForm, address: e.target.value })}
                onBlur={async (e) => {
                  const addr = e.target.value.trim();
                  if (addr.length > 3) {
                    try {
                      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`, { credentials: "include" });
                      if (res.ok) {
                        const geo = await res.json();
                        if (geo.lat && geo.lng) {
                          setFacilityForm(prev => ({ ...prev, lat: geo.lat, lng: geo.lng }));
                        }
                      }
                    } catch {}
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Latitude</Label>
                <Input
                  data-testid="input-facility-lat"
                  className="bg-navy-800 border-navy-600 text-white"
                  placeholder="Auto-filled from address"
                  value={facilityForm.lat}
                  onChange={(e) => setFacilityForm({ ...facilityForm, lat: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Longitude</Label>
                <Input
                  data-testid="input-facility-lng"
                  className="bg-navy-800 border-navy-600 text-white"
                  placeholder="Auto-filled from address"
                  value={facilityForm.lng}
                  onChange={(e) => setFacilityForm({ ...facilityForm, lng: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Phone</Label>
                <Input
                  data-testid="input-facility-phone"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={facilityForm.phone}
                  onChange={(e) => setFacilityForm({ ...facilityForm, phone: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Travel Time (min)</Label>
                <Input
                  data-testid="input-facility-travel-time"
                  type="number"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={facilityForm.travelTimeMinutes}
                  onChange={(e) => setFacilityForm({ ...facilityForm, travelTimeMinutes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-create-facility"
              variant="outline"
              className="border-navy-500"
              onClick={() => setCreateFacilityOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-create-facility"
              className="btn-gold-metallic hover:btn-gold-metallic"
              onClick={() => handleSubmitFacility(true)}
              disabled={createFacilityMutation.isPending}
            >
              {createFacilityMutation.isPending ? "Adding..." : "Add Facility"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── SOP DIALOG ───── */}
      <Dialog open={sopDialogOpen} onOpenChange={(open) => { setSopDialogOpen(open); if (!open) { setEditingSop(null); setSopForm({ title: "", content: "" }); } }}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">{editingSop ? "Edit SOP" : "Add Standard Operating Procedure"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">SOP Title</Label>
              <Input
                data-testid="input-sop-title"
                className="bg-navy-800 border-navy-600 text-white"
                placeholder="e.g., Log Formatting Standards"
                value={sopForm.title}
                onChange={(e) => setSopForm({ ...sopForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">SOP Content</Label>
              <p className="text-xs text-navy-500 mb-1">
                Write the procedure the AI should follow when processing log entries. Be specific about formatting, terminology, and rules.
              </p>
              <Textarea
                data-testid="input-sop-content"
                className="bg-navy-800 border-navy-600 text-white min-h-[200px] font-mono text-sm"
                placeholder={"Example:\n- Always use 24-hour time format\n- Refer to the client as 'American Marine' not 'AM'\n- Use 'L/S' for Left Surface, 'R/B' for Reached Bottom\n- Include depth in FSW for all dive events"}
                value={sopForm.content}
                onChange={(e) => setSopForm({ ...sopForm, content: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-sop"
              variant="outline"
              className="border-navy-500"
              onClick={() => { setSopDialogOpen(false); setEditingSop(null); setSopForm({ title: "", content: "" }); }}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-sop"
              className="btn-gold-metallic"
              disabled={!sopForm.title.trim() || !sopForm.content.trim() || createSopMutation.isPending || updateSopMutation.isPending}
              onClick={() => {
                if (editingSop) {
                  updateSopMutation.mutate({ id: editingSop.id, data: { title: sopForm.title, content: sopForm.content } });
                } else {
                  createSopMutation.mutate({ title: sopForm.title, content: sopForm.content });
                }
              }}
            >
              {(createSopMutation.isPending || updateSopMutation.isPending) ? "Saving..." : editingSop ? "Save Changes" : "Add SOP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── EDIT FACILITY DIALOG ───── */}
      <Dialog open={editFacilityOpen} onOpenChange={setEditFacilityOpen}>
        <DialogContent className="bg-navy-900 border-navy-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Facility</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-navy-300">Facility Name</Label>
              <Input
                data-testid="input-edit-facility-name"
                className="bg-navy-800 border-navy-600 text-white"
                value={facilityForm.name}
                onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-navy-300">Type</Label>
              <Select
                value={facilityForm.facilityType}
                onValueChange={(v) => setFacilityForm({ ...facilityForm, facilityType: v })}
              >
                <SelectTrigger
                  data-testid="select-edit-facility-type"
                  className="bg-navy-800 border-navy-600 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-navy-800 border-navy-600">
                  {FACILITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-white">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-navy-300">Address</Label>
              <Input
                data-testid="input-edit-facility-address"
                className="bg-navy-800 border-navy-600 text-white"
                value={facilityForm.address}
                onChange={(e) => setFacilityForm({ ...facilityForm, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-navy-300">Phone</Label>
                <Input
                  data-testid="input-edit-facility-phone"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={facilityForm.phone}
                  onChange={(e) => setFacilityForm({ ...facilityForm, phone: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-navy-300">Travel Time (min)</Label>
                <Input
                  data-testid="input-edit-facility-travel-time"
                  type="number"
                  className="bg-navy-800 border-navy-600 text-white"
                  value={facilityForm.travelTimeMinutes}
                  onChange={(e) => setFacilityForm({ ...facilityForm, travelTimeMinutes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-cancel-edit-facility"
              variant="outline"
              className="border-navy-500"
              onClick={() => setEditFacilityOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-edit-facility"
              className="btn-gold-metallic hover:btn-gold-metallic"
              onClick={() => handleSubmitFacility(false)}
              disabled={updateFacilityMutation.isPending}
            >
              {updateFacilityMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
