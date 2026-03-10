import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { usePTT } from "@/hooks/use-ptt";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ClipboardCheck,
  ClipboardList,
  AlertTriangle,
  FileText,
  Plus,
  Check,
  X,
  Mic,
  MicOff,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  Sparkles,
  Users,
  MessageSquare,
  Flag,
  CheckCircle2,
  XCircle,
  HelpCircle,
  PenLine,
  Send,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ChecklistTemplate {
  id: string;
  projectId: string;
  checklistType: "pre_dive" | "post_dive" | "equipment";
  title: string;
  description?: string;
  roleScope: string;
  clientType: string;
  isActive: boolean;
  sortOrder: number;
  items?: ChecklistItemDef[];
}

interface ChecklistItemDef {
  id: string;
  checklistId: string;
  itemText: string;
  category?: string;
  isCritical: boolean;
  requiresNote: boolean;
  sortOrder: number;
}

interface ChecklistCompletion {
  id: string;
  checklistId: string;
  projectId: string;
  dayId?: string;
  completedBy: string;
  completedAt: string;
  status: "in_progress" | "completed" | "signed_off";
  responses: ChecklistResponse[];
  notes?: string;
  supervisorSignature?: string;
  supervisorSignedAt?: string;
  checklistTitle?: string;
  checklistType?: string;
}

interface ChecklistResponse {
  itemId: string;
  itemText: string;
  status: "pass" | "fail" | "flag" | "na";
  note?: string;
  flaggedForRisk?: boolean;
}

interface JhaRecord {
  id: string;
  projectId: string;
  dayId?: string;
  title: string;
  status: "draft" | "review" | "approved" | "superseded";
  generatedByAi: boolean;
  hazardEntries: JhaHazardEntry[];
  weatherConditions?: string;
  diveDepthRange?: string;
  equipmentInUse?: string[];
  plannedOperations?: string;
  historicalContext?: string;
  supervisorNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  version: number;
}

interface JhaHazardEntry {
  step: string;
  hazard: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  controls: string;
  responsibleParty: string;
  ppe?: string;
}

interface SafetyMeeting {
  id: string;
  projectId: string;
  dayId?: string;
  title: string;
  status: "draft" | "finalized" | "archived";
  meetingDate: string;
  generatedByAi: boolean;
  safetyTopic?: string;
  previousShiftSummary?: string;
  plannedOperations?: string;
  associatedHazards?: string;
  mitigationPlan?: string;
  openDiscussionPoints?: string;
  attendees?: string[];
  notes?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  createdBy: string;
  createdAt: string;
}

interface NearMissReport {
  id: string;
  projectId: string;
  dayId?: string;
  reportedBy: string;
  reportType: "near_miss" | "incident" | "observation" | "unsafe_condition";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  location?: string;
  personnelInvolved?: string[];
  immediateActions?: string;
  rootCause?: string;
  correctiveActions?: string;
  voiceTranscript?: string;
  status: "open" | "investigating" | "resolved" | "closed";
  reviewedBy?: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-600 text-gray-100",
    review: "bg-yellow-600 text-yellow-100",
    approved: "bg-green-600 text-green-100",
    superseded: "bg-red-600/50 text-red-200",
    finalized: "bg-green-600 text-green-100",
    archived: "bg-gray-600 text-gray-100",
    in_progress: "bg-blue-600 text-blue-100",
    completed: "bg-cyan-600 text-cyan-100",
    signed_off: "bg-green-600 text-green-100",
    open: "bg-red-600 text-red-100",
    investigating: "bg-yellow-600 text-yellow-100",
    resolved: "bg-green-600 text-green-100",
    closed: "bg-gray-600 text-gray-100",
  };
  return (
    <Badge className={`${colors[status] || "bg-gray-600"} text-xs`}>
      {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-600/80 text-green-100",
    medium: "bg-yellow-600 text-yellow-100",
    high: "bg-orange-600 text-orange-100",
    critical: "bg-red-600 text-red-100",
  };
  return (
    <Badge className={`${colors[severity] || "bg-gray-600"} text-xs`}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function RiskLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-700/60 text-green-200",
    medium: "bg-yellow-700/60 text-yellow-200",
    high: "bg-orange-700/60 text-orange-200",
    critical: "bg-red-700/60 text-red-200",
  };
  return (
    <Badge className={`${colors[level] || "bg-gray-600"} text-xs font-mono`}>
      {level.toUpperCase()}
    </Badge>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/40 mb-3" />
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">{description}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SAFETY TAB
// ═══════════════════════════════════════════════════════════════════════════

export function SafetyTab() {
  const { user, isSupervisor } = useAuth();
  const { activeProject, activeDay } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = activeProject?.id;
  const dayId = activeDay?.id;

  // ─── Section State ──────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState("checklists");

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={Shield}
          title="No Project Selected"
          description="Select a project to access safety features."
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs value={activeSection} onValueChange={setActiveSection} className="h-full flex flex-col">
        <div className="px-4 pt-3 shrink-0">
          <TabsList className="bg-navy-800/50 border border-navy-600">
            <TabsTrigger value="checklists" className="data-[state=active]:bg-navy-600 data-[state=active]:text-amber-400 text-xs sm:text-sm gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Checklists
            </TabsTrigger>
            <TabsTrigger value="jha" className="data-[state=active]:bg-navy-600 data-[state=active]:text-amber-400 text-xs sm:text-sm gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              JHA
            </TabsTrigger>
            <TabsTrigger value="meetings" className="data-[state=active]:bg-navy-600 data-[state=active]:text-amber-400 text-xs sm:text-sm gap-1">
              <Users className="h-3.5 w-3.5" />
              Safety Meetings
            </TabsTrigger>
            <TabsTrigger value="near-misses" className="data-[state=active]:bg-navy-600 data-[state=active]:text-amber-400 text-xs sm:text-sm gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              Near-Miss
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="checklists" className="flex-1 overflow-hidden mt-0">
          <ChecklistsSection projectId={projectId} dayId={dayId} />
        </TabsContent>
        <TabsContent value="jha" className="flex-1 overflow-hidden mt-0">
          <JhaSection projectId={projectId} dayId={dayId} />
        </TabsContent>
        <TabsContent value="meetings" className="flex-1 overflow-hidden mt-0">
          <MeetingsSection projectId={projectId} dayId={dayId} />
        </TabsContent>
        <TabsContent value="near-misses" className="flex-1 overflow-hidden mt-0">
          <NearMissSection projectId={projectId} dayId={dayId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECKLISTS SECTION
// ═══════════════════════════════════════════════════════════════════════════

function ChecklistsSection({ projectId, dayId }: { projectId: string; dayId?: string }) {
  const { isSupervisor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeChecklist, setActiveChecklist] = useState<ChecklistTemplate | null>(null);
  const [showFillDialog, setShowFillDialog] = useState(false);
  const [responses, setResponses] = useState<ChecklistResponse[]>([]);
  const [completionNotes, setCompletionNotes] = useState("");
  const [showCompletions, setShowCompletions] = useState(false);

  // Fetch checklists
  const { data: checklists = [], isLoading: loadingChecklists } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/safety/projects", projectId, "checklists"],
    queryFn: async () => {
      const res = await fetch(`/api/safety/projects/${projectId}/checklists`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch completions
  const { data: completions = [] } = useQuery<ChecklistCompletion[]>({
    queryKey: ["/api/safety/projects", projectId, "completions", dayId],
    queryFn: async () => {
      const url = dayId
        ? `/api/safety/projects/${projectId}/completions?dayId=${dayId}`
        : `/api/safety/projects/${projectId}/completions`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Seed defaults
  const seedMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/safety/projects/${projectId}/checklists/seed-defaults`, { clientType: "commercial" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "checklists"] });
      toast({ title: "Checklists Seeded", description: "Default checklists have been created for this project." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Submit completion
  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/safety/projects/${projectId}/completions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "completions"] });
      toast({ title: "Checklist Submitted", description: "Your checklist has been recorded." });
      setShowFillDialog(false);
      setActiveChecklist(null);
      setResponses([]);
      setCompletionNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Sign-off
  const signOffMutation = useMutation({
    mutationFn: async (completionId: string) => {
      await apiRequest("POST", `/api/safety/completions/${completionId}/sign-off`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "completions"] });
      toast({ title: "Signed Off", description: "Checklist has been signed off by supervisor." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Open checklist for filling
  const openChecklist = async (checklist: ChecklistTemplate) => {
    try {
      const res = await fetch(`/api/safety/checklists/${checklist.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load checklist");
      const full = await res.json();
      setActiveChecklist(full);
      setResponses(
        (full.items || []).map((item: ChecklistItemDef) => ({
          itemId: item.id,
          itemText: item.itemText,
          status: "pass" as const,
          note: "",
          flaggedForRisk: false,
        }))
      );
      setCompletionNotes("");
      setShowFillDialog(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const updateResponse = (idx: number, field: string, value: any) => {
    setResponses(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSubmitChecklist = () => {
    submitMutation.mutate({
      checklistId: activeChecklist?.id,
      dayId,
      responses,
      notes: completionNotes,
    });
  };

  const preDive = checklists.filter(c => c.checklistType === "pre_dive");
  const postDive = checklists.filter(c => c.checklistType === "post_dive");
  const equipment = checklists.filter(c => c.checklistType === "equipment");

  const todayCompletions = completions;
  const completedIds = new Set(todayCompletions.map(c => c.checklistId));

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-cyan-400" />
              <div>
                <div className="text-2xl font-bold text-foreground">{checklists.length}</div>
                <div className="text-xs text-muted-foreground">Templates</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
              <div>
                <div className="text-2xl font-bold text-green-400">{todayCompletions.filter(c => c.status === "signed_off").length}</div>
                <div className="text-xs text-muted-foreground">Signed Off</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-yellow-400" />
              <div>
                <div className="text-2xl font-bold text-yellow-400">{todayCompletions.filter(c => c.status === "completed").length}</div>
                <div className="text-xs text-muted-foreground">Awaiting Sign-off</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-400" />
              <div>
                <div className="text-2xl font-bold text-red-400">
                  {todayCompletions.reduce((acc, c) => acc + (c.responses?.filter(r => r.status === "fail").length || 0), 0)}
                </div>
                <div className="text-xs text-muted-foreground">Failed Items</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* No checklists → seed */}
        {checklists.length === 0 && !loadingChecklists && (
          <Card className="bg-navy-800/50 border-navy-600">
            <CardContent className="p-6 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-foreground mb-2">No Checklists Configured</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Seed default checklists for this project, or create custom ones.
              </p>
              {isSupervisor && (
                <Button
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="btn-gold-metallic text-xs"
                >
                  {seedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Seed Default Checklists
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Checklist Groups */}
        {[
          { label: "Pre-Dive Checklists", items: preDive, icon: ShieldCheck },
          { label: "Post-Dive Checklists", items: postDive, icon: ClipboardCheck },
          { label: "Equipment Inspection", items: equipment, icon: AlertTriangle },
        ].map(group => group.items.length > 0 && (
          <div key={group.label}>
            <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
              <group.icon className="h-4 w-4" />
              {group.label}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map(checklist => {
                const isCompleted = completedIds.has(checklist.id);
                return (
                  <Card
                    key={checklist.id}
                    className={`bg-navy-800/50 border-navy-600 cursor-pointer hover:border-amber-400/50 transition-colors ${isCompleted ? "opacity-70" : ""}`}
                    onClick={() => openChecklist(checklist)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-foreground">{checklist.title}</h4>
                        {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />}
                      </div>
                      {checklist.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{checklist.description}</p>
                      )}
                      <div className="flex gap-2">
                        <Badge className="bg-navy-700 text-navy-200 text-xs">{checklist.roleScope}</Badge>
                        <Badge className="bg-navy-700 text-navy-200 text-xs">{checklist.clientType}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* Completions History */}
        {todayCompletions.length > 0 && (
          <div>
            <button
              className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2 hover:text-amber-300"
              onClick={() => setShowCompletions(!showCompletions)}
            >
              {showCompletions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Completion History ({todayCompletions.length})
            </button>
            {showCompletions && (
              <div className="space-y-2">
                {todayCompletions.map(comp => (
                  <Card key={comp.id} className="bg-navy-800/30 border-navy-700">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">{comp.checklistTitle || "Checklist"}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(comp.completedAt).toLocaleString()} — {comp.responses?.filter(r => r.status === "pass").length}/{comp.responses?.length} passed
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={comp.status} />
                        {isSupervisor && comp.status === "completed" && (
                          <Button
                            size="sm"
                            className="btn-gold-metallic text-xs h-7"
                            onClick={(e) => { e.stopPropagation(); signOffMutation.mutate(comp.id); }}
                            disabled={signOffMutation.isPending}
                          >
                            <PenLine className="h-3 w-3 mr-1" />
                            Sign Off
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fill Checklist Dialog */}
      <Dialog open={showFillDialog} onOpenChange={setShowFillDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">{activeChecklist?.title}</DialogTitle>
            <DialogDescription>{activeChecklist?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {responses.map((resp, idx) => {
              const item = activeChecklist?.items?.[idx];
              return (
                <div key={resp.itemId} className={`p-3 rounded-lg border ${resp.status === "fail" ? "border-red-600/50 bg-red-900/10" : resp.status === "flag" ? "border-yellow-600/50 bg-yellow-900/10" : "border-border bg-navy-800/30"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm text-foreground flex items-center gap-2">
                        {item?.isCritical && <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                        {resp.itemText}
                      </div>
                      {item?.category && <div className="text-xs text-muted-foreground mt-0.5">{item.category}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {(["pass", "fail", "flag", "na"] as const).map(status => (
                        <button
                          key={status}
                          onClick={() => updateResponse(idx, "status", status)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            resp.status === status
                              ? status === "pass" ? "bg-green-600 text-white"
                                : status === "fail" ? "bg-red-600 text-white"
                                : status === "flag" ? "bg-yellow-600 text-white"
                                : "bg-gray-600 text-white"
                              : "bg-navy-700 text-navy-300 hover:bg-navy-600"
                          }`}
                        >
                          {status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status === "flag" ? "FLAG" : "N/A"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(resp.status === "fail" || resp.status === "flag" || item?.requiresNote) && (
                    <div className="mt-2">
                      <Input
                        placeholder="Add note..."
                        value={resp.note || ""}
                        onChange={(e) => updateResponse(idx, "note", e.target.value)}
                        className="text-xs bg-navy-900/50 border-navy-600"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <Label className="text-xs text-muted-foreground">Additional Notes</Label>
            <Textarea
              placeholder="Any additional notes..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFillDialog(false)}>Cancel</Button>
            <Button
              className="btn-gold-metallic"
              onClick={handleSubmitChecklist}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Submit Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// JHA SECTION
// ═══════════════════════════════════════════════════════════════════════════

function JhaSection({ projectId, dayId }: { projectId: string; dayId?: string }) {
  const { isSupervisor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedJha, setSelectedJha] = useState<JhaRecord | null>(null);
  const [editingJha, setEditingJha] = useState(false);

  // Generate form state
  const [genPlannedOps, setGenPlannedOps] = useState("");
  const [genWeather, setGenWeather] = useState("");
  const [genDepth, setGenDepth] = useState("");
  const [genEquipment, setGenEquipment] = useState("");

  // Edit form state
  const [editNotes, setEditNotes] = useState("");
  const [editEntries, setEditEntries] = useState<JhaHazardEntry[]>([]);

  const { data: jhaRecords = [], isLoading } = useQuery<JhaRecord[]>({
    queryKey: ["/api/safety/projects", projectId, "jha", dayId],
    queryFn: async () => {
      const url = dayId
        ? `/api/safety/projects/${projectId}/jha?dayId=${dayId}`
        : `/api/safety/projects/${projectId}/jha`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Generate JHA
  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/safety/projects/${projectId}/jha/generate`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "jha"] });
      toast({ title: "JHA Generated", description: "AI has generated a Job Hazard Analysis for review." });
      setShowGenerateDialog(false);
      setSelectedJha(data);
      setShowViewDialog(true);
      resetGenForm();
    },
    onError: (err: any) => {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Update JHA
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/safety/jha/${id}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "jha"] });
      toast({ title: "JHA Updated", description: "Changes saved successfully." });
      setSelectedJha(data);
      setEditingJha(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetGenForm = () => {
    setGenPlannedOps("");
    setGenWeather("");
    setGenDepth("");
    setGenEquipment("");
  };

  const handleGenerate = () => {
    generateMutation.mutate({
      dayId,
      plannedOperations: genPlannedOps,
      weatherConditions: genWeather || undefined,
      diveDepthRange: genDepth || undefined,
      equipmentInUse: genEquipment ? genEquipment.split(",").map(s => s.trim()) : undefined,
    });
  };

  const openJha = (jha: JhaRecord) => {
    setSelectedJha(jha);
    setEditNotes(jha.supervisorNotes || "");
    setEditEntries(jha.hazardEntries || []);
    setEditingJha(false);
    setShowViewDialog(true);
  };

  const handleApprove = () => {
    if (!selectedJha) return;
    updateMutation.mutate({
      id: selectedJha.id,
      data: {
        status: "approved",
        supervisorNotes: editNotes,
        hazardEntries: editEntries,
      },
    });
  };

  const handleSaveEdits = () => {
    if (!selectedJha) return;
    updateMutation.mutate({
      id: selectedJha.id,
      data: {
        supervisorNotes: editNotes,
        hazardEntries: editEntries,
      },
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Job Hazard Analysis
          </h2>
          {isSupervisor && (
            <Button
              className="btn-gold-metallic text-xs"
              onClick={() => setShowGenerateDialog(true)}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              AI Generate JHA
            </Button>
          )}
        </div>

        {/* JHA List */}
        {jhaRecords.length === 0 && !isLoading ? (
          <EmptyState
            icon={FileText}
            title="No JHA Records"
            description="Generate an AI-powered JHA or create one manually for today's operations."
          />
        ) : (
          <div className="space-y-2">
            {jhaRecords.map(jha => (
              <Card
                key={jha.id}
                className="bg-navy-800/50 border-navy-600 cursor-pointer hover:border-amber-400/50 transition-colors"
                onClick={() => openJha(jha)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground">{jha.title}</h4>
                        {jha.generatedByAi && (
                          <Badge className="bg-purple-600/50 text-purple-200 text-xs">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            AI
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {jha.hazardEntries?.length || 0} hazard entries — {new Date(jha.createdAt).toLocaleDateString()}
                      </div>
                      {jha.plannedOperations && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{jha.plannedOperations}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={jha.status} />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/api/safety/jha/${jha.id}/export`, "_blank");
                        }}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Generate JHA Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              AI Generate JHA
            </DialogTitle>
            <DialogDescription>
              Provide details about today's operations. AI will generate a comprehensive Job Hazard Analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Planned Operations *</Label>
              <Textarea
                placeholder="Describe today's planned dive operations..."
                value={genPlannedOps}
                onChange={(e) => setGenPlannedOps(e.target.value)}
                className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                rows={3}
              />
            </div>
            <div>
              <Label className="text-xs">Current Weather / Environmental Conditions</Label>
              <Input
                placeholder="e.g., Winds 10-15 kts, seas 2-3 ft, visibility 10+ ft"
                value={genWeather}
                onChange={(e) => setGenWeather(e.target.value)}
                className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dive Depth Range</Label>
                <Input
                  placeholder="e.g., 30-60 FSW"
                  value={genDepth}
                  onChange={(e) => setGenDepth(e.target.value)}
                  className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Equipment in Use</Label>
                <Input
                  placeholder="e.g., KM-37, Broco torch"
                  value={genEquipment}
                  onChange={(e) => setGenEquipment(e.target.value)}
                  className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
            <Button
              className="btn-gold-metallic"
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !genPlannedOps.trim()}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Generate JHA
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Edit JHA Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {selectedJha?.title}
              {selectedJha?.generatedByAi && (
                <Badge className="bg-purple-600/50 text-purple-200 text-xs">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI Generated
                </Badge>
              )}
              <StatusBadge status={selectedJha?.status || "draft"} />
            </DialogTitle>
          </DialogHeader>

          {selectedJha && (
            <div className="space-y-4">
              {/* Context Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {selectedJha.plannedOperations && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Operations:</span>
                    <p className="text-foreground mt-0.5">{selectedJha.plannedOperations}</p>
                  </div>
                )}
                {selectedJha.weatherConditions && (
                  <div>
                    <span className="text-muted-foreground">Weather:</span>
                    <p className="text-foreground mt-0.5">{selectedJha.weatherConditions}</p>
                  </div>
                )}
                {selectedJha.diveDepthRange && (
                  <div>
                    <span className="text-muted-foreground">Depth:</span>
                    <p className="text-foreground mt-0.5">{selectedJha.diveDepthRange}</p>
                  </div>
                )}
              </div>

              {/* Hazard Entries Table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-navy-800/50">
                      <TableHead className="text-xs text-amber-400 w-8">#</TableHead>
                      <TableHead className="text-xs text-amber-400">Operation Step</TableHead>
                      <TableHead className="text-xs text-amber-400">Hazard</TableHead>
                      <TableHead className="text-xs text-amber-400 w-20">Risk</TableHead>
                      <TableHead className="text-xs text-amber-400">Controls</TableHead>
                      <TableHead className="text-xs text-amber-400 w-24">Responsible</TableHead>
                      <TableHead className="text-xs text-amber-400 w-24">PPE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(editingJha ? editEntries : selectedJha.hazardEntries || []).map((entry, idx) => (
                      <TableRow key={idx} className="text-xs">
                        <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          {editingJha ? (
                            <Input
                              value={entry.step}
                              onChange={(e) => {
                                const updated = [...editEntries];
                                updated[idx] = { ...updated[idx], step: e.target.value };
                                setEditEntries(updated);
                              }}
                              className="text-xs h-7 bg-navy-900/50 border-navy-600"
                            />
                          ) : entry.step}
                        </TableCell>
                        <TableCell>
                          {editingJha ? (
                            <Input
                              value={entry.hazard}
                              onChange={(e) => {
                                const updated = [...editEntries];
                                updated[idx] = { ...updated[idx], hazard: e.target.value };
                                setEditEntries(updated);
                              }}
                              className="text-xs h-7 bg-navy-900/50 border-navy-600"
                            />
                          ) : entry.hazard}
                        </TableCell>
                        <TableCell><RiskLevelBadge level={entry.riskLevel} /></TableCell>
                        <TableCell>
                          {editingJha ? (
                            <Input
                              value={entry.controls}
                              onChange={(e) => {
                                const updated = [...editEntries];
                                updated[idx] = { ...updated[idx], controls: e.target.value };
                                setEditEntries(updated);
                              }}
                              className="text-xs h-7 bg-navy-900/50 border-navy-600"
                            />
                          ) : entry.controls}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{entry.responsibleParty}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.ppe || "Standard"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Historical Context */}
              {selectedJha.historicalContext && (
                <div className="text-xs bg-navy-800/30 rounded-lg p-3 border border-navy-700">
                  <span className="text-amber-400 font-medium">Historical Context:</span>
                  <p className="text-muted-foreground mt-1">{selectedJha.historicalContext}</p>
                </div>
              )}

              {/* Supervisor Notes */}
              {isSupervisor && (
                <div>
                  <Label className="text-xs text-muted-foreground">Supervisor Notes</Label>
                  <Textarea
                    placeholder="Add supervisor notes..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                    rows={2}
                    disabled={selectedJha.status === "approved"}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {isSupervisor && selectedJha?.status !== "approved" && (
              <>
                {!editingJha ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditEntries([...(selectedJha?.hazardEntries || [])]);
                      setEditingJha(true);
                    }}
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleSaveEdits} disabled={updateMutation.isPending}>
                    Save Edits
                  </Button>
                )}
                <Button
                  className="btn-gold-metallic"
                  size="sm"
                  onClick={handleApprove}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  Approve JHA
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowViewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY MEETINGS SECTION
// ═══════════════════════════════════════════════════════════════════════════

function MeetingsSection({ projectId, dayId }: { projectId: string; dayId?: string }) {
  const { isSupervisor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<SafetyMeeting | null>(null);
  const [editingMeeting, setEditingMeeting] = useState(false);

  // Generate form — supervisor questions
  const [step, setStep] = useState<"questions" | "generating" | "review">("questions");
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [answer3, setAnswer3] = useState("");

  // Edit fields
  const [editSafetyTopic, setEditSafetyTopic] = useState("");
  const [editPrevShift, setEditPrevShift] = useState("");
  const [editPlannedOps, setEditPlannedOps] = useState("");
  const [editHazards, setEditHazards] = useState("");
  const [editMitigation, setEditMitigation] = useState("");
  const [editDiscussion, setEditDiscussion] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const { data: meetings = [], isLoading } = useQuery<SafetyMeeting[]>({
    queryKey: ["/api/safety/projects", projectId, "meetings", dayId],
    queryFn: async () => {
      const url = dayId
        ? `/api/safety/projects/${projectId}/meetings?dayId=${dayId}`
        : `/api/safety/projects/${projectId}/meetings`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Generate meeting
  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/safety/projects/${projectId}/meetings/generate`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "meetings"] });
      toast({ title: "Meeting Generated", description: "AI has generated a safety meeting agenda for review." });
      setShowGenerateDialog(false);
      openMeeting(data);
      resetGenForm();
    },
    onError: (err: any) => {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Update meeting
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/safety/meetings/${id}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "meetings"] });
      toast({ title: "Meeting Updated", description: "Changes saved." });
      setSelectedMeeting(data);
      setEditingMeeting(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetGenForm = () => {
    setAnswer1("");
    setAnswer2("");
    setAnswer3("");
    setStep("questions");
  };

  const handleGenerate = () => {
    setStep("generating");
    generateMutation.mutate({
      dayId,
      supervisorAnswers: [answer1, answer2, answer3].filter(Boolean),
      plannedOpsDescription: answer1,
      safetyConcerns: answer2,
    });
  };

  const openMeeting = (meeting: SafetyMeeting) => {
    setSelectedMeeting(meeting);
    setEditSafetyTopic(meeting.safetyTopic || "");
    setEditPrevShift(meeting.previousShiftSummary || "");
    setEditPlannedOps(meeting.plannedOperations || "");
    setEditHazards(meeting.associatedHazards || "");
    setEditMitigation(meeting.mitigationPlan || "");
    setEditDiscussion(meeting.openDiscussionPoints || "");
    setEditNotes(meeting.notes || "");
    setEditingMeeting(false);
    setShowViewDialog(true);
  };

  const handleFinalize = () => {
    if (!selectedMeeting) return;
    updateMutation.mutate({
      id: selectedMeeting.id,
      data: {
        status: "finalized",
        safetyTopic: editSafetyTopic,
        previousShiftSummary: editPrevShift,
        plannedOperations: editPlannedOps,
        associatedHazards: editHazards,
        mitigationPlan: editMitigation,
        openDiscussionPoints: editDiscussion,
        notes: editNotes,
      },
    });
  };

  const handleSaveEdits = () => {
    if (!selectedMeeting) return;
    updateMutation.mutate({
      id: selectedMeeting.id,
      data: {
        safetyTopic: editSafetyTopic,
        previousShiftSummary: editPrevShift,
        plannedOperations: editPlannedOps,
        associatedHazards: editHazards,
        mitigationPlan: editMitigation,
        openDiscussionPoints: editDiscussion,
        notes: editNotes,
      },
    });
  };

  const QUESTIONS = [
    "What are the planned dive operations for today?",
    "Are there any specific safety concerns for today's operations?",
    "What is the current weather and any environmental conditions to note?",
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Safety Meetings
          </h2>
          {isSupervisor && (
            <Button
              className="btn-gold-metallic text-xs"
              onClick={() => { resetGenForm(); setShowGenerateDialog(true); }}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              AI Generate Meeting
            </Button>
          )}
        </div>

        {/* Meeting List */}
        {meetings.length === 0 && !isLoading ? (
          <EmptyState
            icon={MessageSquare}
            title="No Safety Meetings"
            description="Generate an AI-powered morning safety meeting agenda to get started."
          />
        ) : (
          <div className="space-y-2">
            {meetings.map(meeting => (
              <Card
                key={meeting.id}
                className="bg-navy-800/50 border-navy-600 cursor-pointer hover:border-amber-400/50 transition-colors"
                onClick={() => openMeeting(meeting)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground">{meeting.title}</h4>
                        {meeting.generatedByAi && (
                          <Badge className="bg-purple-600/50 text-purple-200 text-xs">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{meeting.meetingDate}</div>
                      {meeting.safetyTopic && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          Topic: {meeting.safetyTopic}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={meeting.status} />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/api/safety/meetings/${meeting.id}/export`, "_blank");
                        }}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Generate Meeting Dialog — Questions Flow */}
      <Dialog open={showGenerateDialog} onOpenChange={(open) => { if (!open) resetGenForm(); setShowGenerateDialog(open); }}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Generate Safety Meeting
            </DialogTitle>
            <DialogDescription>
              Answer a few questions so AI can generate a tailored 10-minute meeting agenda.
            </DialogDescription>
          </DialogHeader>

          {step === "questions" && (
            <div className="space-y-4">
              {QUESTIONS.map((q, idx) => (
                <div key={idx}>
                  <Label className="text-xs text-amber-400">{q}</Label>
                  <Textarea
                    placeholder="Your answer..."
                    value={idx === 0 ? answer1 : idx === 1 ? answer2 : answer3}
                    onChange={(e) => {
                      if (idx === 0) setAnswer1(e.target.value);
                      else if (idx === 1) setAnswer2(e.target.value);
                      else setAnswer3(e.target.value);
                    }}
                    className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-3" />
              <p className="text-sm text-muted-foreground">AI is generating your safety meeting agenda...</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetGenForm(); setShowGenerateDialog(false); }}>Cancel</Button>
            {step === "questions" && (
              <Button
                className="btn-gold-metallic"
                onClick={handleGenerate}
                disabled={!answer1.trim()}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Generate Agenda
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Edit Meeting Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {selectedMeeting?.title}
              {selectedMeeting?.generatedByAi && (
                <Badge className="bg-purple-600/50 text-purple-200 text-xs">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI
                </Badge>
              )}
              <StatusBadge status={selectedMeeting?.status || "draft"} />
            </DialogTitle>
          </DialogHeader>

          {selectedMeeting && (
            <div className="space-y-4">
              {/* Agenda Sections */}
              {[
                { label: "Safety Topic of the Day", value: editSafetyTopic, setter: setEditSafetyTopic, icon: Shield },
                { label: "Previous Shift Summary", value: editPrevShift, setter: setEditPrevShift, icon: FileText },
                { label: "Today's Planned Operations", value: editPlannedOps, setter: setEditPlannedOps, icon: ClipboardList },
                { label: "Associated Hazards", value: editHazards, setter: setEditHazards, icon: AlertTriangle },
                { label: "Mitigation Plan", value: editMitigation, setter: setEditMitigation, icon: ShieldCheck },
                { label: "Open Discussion Points", value: editDiscussion, setter: setEditDiscussion, icon: MessageSquare },
              ].map(section => (
                <div key={section.label} className="bg-navy-800/30 rounded-lg p-3 border border-navy-700">
                  <div className="flex items-center gap-2 mb-2">
                    <section.icon className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">{section.label}</span>
                  </div>
                  {editingMeeting ? (
                    <Textarea
                      value={section.value}
                      onChange={(e) => section.setter(e.target.value)}
                      className="bg-navy-900/50 border-navy-600 text-sm"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{section.value || "—"}</p>
                  )}
                </div>
              ))}

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Additional Notes</Label>
                <Textarea
                  placeholder="Meeting notes..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                  rows={2}
                  disabled={selectedMeeting.status === "finalized"}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {isSupervisor && selectedMeeting?.status !== "finalized" && (
              <>
                {!editingMeeting ? (
                  <Button variant="outline" size="sm" onClick={() => setEditingMeeting(true)}>
                    <PenLine className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleSaveEdits} disabled={updateMutation.isPending}>
                    Save Edits
                  </Button>
                )}
                <Button
                  className="btn-gold-metallic"
                  size="sm"
                  onClick={handleFinalize}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  Finalize Meeting
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowViewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEAR-MISS REPORTS SECTION
// ═══════════════════════════════════════════════════════════════════════════

function NearMissSection({ projectId, dayId }: { projectId: string; dayId?: string }) {
  const { isSupervisor } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedReport, setSelectedReport] = useState<NearMissReport | null>(null);

  // Create form
  const [reportType, setReportType] = useState<string>("near_miss");
  const [severity, setSeverity] = useState<string>("low");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");

  // PTT for voice input
  const handleTranscribed = useCallback((text: string) => {
    setDescription(prev => prev ? `${prev} ${text}` : text);
  }, []);
  const { isRecording, isTranscribing, startRecording, stopRecording } = usePTT(handleTranscribed);

  const { data: reports = [], isLoading } = useQuery<NearMissReport[]>({
    queryKey: ["/api/safety/projects", projectId, "near-misses", dayId],
    queryFn: async () => {
      const url = dayId
        ? `/api/safety/projects/${projectId}/near-misses?dayId=${dayId}`
        : `/api/safety/projects/${projectId}/near-misses`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Create report
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/safety/projects/${projectId}/near-misses`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "near-misses"] });
      toast({ title: "Report Created", description: "Near-miss report has been filed." });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Update report
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/safety/near-misses/${id}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety/projects", projectId, "near-misses"] });
      toast({ title: "Report Updated", description: "Status updated." });
      setSelectedReport(data);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setReportType("near_miss");
    setSeverity("low");
    setDescription("");
    setLocation("");
    setImmediateActions("");
    setVoiceTranscript("");
  };

  const handleCreate = () => {
    createMutation.mutate({
      dayId,
      reportType,
      severity,
      description,
      location: location || undefined,
      immediateActions: immediateActions || undefined,
      voiceTranscript: voiceTranscript || undefined,
    });
  };

  const severityCounts = {
    low: reports.filter(r => r.severity === "low").length,
    medium: reports.filter(r => r.severity === "medium").length,
    high: reports.filter(r => r.severity === "high").length,
    critical: reports.filter(r => r.severity === "critical").length,
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Near-Miss / Incident Reports
          </h2>
          <Button
            className="btn-gold-metallic text-xs"
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Report Incident
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <Flag className="h-6 w-6 text-green-400" />
              <div>
                <div className="text-xl font-bold text-green-400">{severityCounts.low}</div>
                <div className="text-xs text-muted-foreground">Low</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <Flag className="h-6 w-6 text-yellow-400" />
              <div>
                <div className="text-xl font-bold text-yellow-400">{severityCounts.medium}</div>
                <div className="text-xs text-muted-foreground">Medium</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <Flag className="h-6 w-6 text-orange-400" />
              <div>
                <div className="text-xl font-bold text-orange-400">{severityCounts.high}</div>
                <div className="text-xs text-muted-foreground">High</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <Flag className="h-6 w-6 text-red-400" />
              <div>
                <div className="text-xl font-bold text-red-400">{severityCounts.critical}</div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report List */}
        {reports.length === 0 && !isLoading ? (
          <EmptyState
            icon={ShieldCheck}
            title="No Reports Filed"
            description="No near-miss or incident reports for the current period. Report any safety observations."
          />
        ) : (
          <div className="space-y-2">
            {reports.map(report => (
              <Card
                key={report.id}
                className="bg-navy-800/50 border-navy-600 cursor-pointer hover:border-amber-400/50 transition-colors"
                onClick={() => { setSelectedReport(report); setShowDetailDialog(true); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={report.severity} />
                        <Badge className="bg-navy-700 text-navy-200 text-xs">
                          {report.reportType.replace(/_/g, " ")}
                        </Badge>
                        <StatusBadge status={report.status} />
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">{report.description}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(report.createdAt).toLocaleString()}
                        {report.location && ` — ${report.location}`}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Report Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Report Near-Miss / Incident</DialogTitle>
            <DialogDescription>
              File a safety report. High/critical severity reports auto-generate risk items.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="mt-1 bg-navy-900/50 border-navy-600 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="near_miss">Near Miss</SelectItem>
                    <SelectItem value="incident">Incident</SelectItem>
                    <SelectItem value="observation">Observation</SelectItem>
                    <SelectItem value="unsafe_condition">Unsafe Condition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger className="mt-1 bg-navy-900/50 border-navy-600 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description *</Label>
              <div className="relative mt-1">
                <Textarea
                  placeholder="Describe what happened..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-navy-900/50 border-navy-600 text-sm pr-12"
                  rows={4}
                />
                <button
                  className={`absolute bottom-2 right-2 p-2 rounded-full transition-colors ${
                    isRecording
                      ? "bg-red-600 text-white animate-pulse"
                      : isTranscribing
                      ? "bg-yellow-600 text-white"
                      : "bg-navy-700 text-navy-300 hover:bg-navy-600"
                  }`}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  title="Push to talk"
                >
                  {isRecording ? <Mic className="h-4 w-4" /> : isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicOff className="h-4 w-4" />}
                </button>
              </div>
              {isRecording && <p className="text-xs text-red-400 mt-1">Recording... Release to transcribe</p>}
            </div>

            <div>
              <Label className="text-xs">Location</Label>
              <Input
                placeholder="Where did this occur?"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Immediate Actions Taken</Label>
              <Textarea
                placeholder="What was done immediately?"
                value={immediateActions}
                onChange={(e) => setImmediateActions(e.target.value)}
                className="mt-1 bg-navy-900/50 border-navy-600 text-sm"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              className="btn-gold-metallic"
              onClick={handleCreate}
              disabled={createMutation.isPending || !description.trim()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              Near-Miss Report
              {selectedReport && <SeverityBadge severity={selectedReport.severity} />}
              {selectedReport && <StatusBadge status={selectedReport.status} />}
            </DialogTitle>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-3">
              <div className="bg-navy-800/30 rounded-lg p-3 border border-navy-700">
                <span className="text-xs text-amber-400 font-medium">Description</span>
                <p className="text-sm text-foreground mt-1">{selectedReport.description}</p>
              </div>
              {selectedReport.location && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Location:</span>{" "}
                  <span className="text-foreground">{selectedReport.location}</span>
                </div>
              )}
              {selectedReport.immediateActions && (
                <div className="bg-navy-800/30 rounded-lg p-3 border border-navy-700">
                  <span className="text-xs text-amber-400 font-medium">Immediate Actions</span>
                  <p className="text-sm text-foreground mt-1">{selectedReport.immediateActions}</p>
                </div>
              )}
              {selectedReport.rootCause && (
                <div className="bg-navy-800/30 rounded-lg p-3 border border-navy-700">
                  <span className="text-xs text-amber-400 font-medium">Root Cause</span>
                  <p className="text-sm text-foreground mt-1">{selectedReport.rootCause}</p>
                </div>
              )}
              {selectedReport.correctiveActions && (
                <div className="bg-navy-800/30 rounded-lg p-3 border border-navy-700">
                  <span className="text-xs text-amber-400 font-medium">Corrective Actions</span>
                  <p className="text-sm text-foreground mt-1">{selectedReport.correctiveActions}</p>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Reported: {new Date(selectedReport.createdAt).toLocaleString()}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {isSupervisor && selectedReport && selectedReport.status === "open" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateMutation.mutate({ id: selectedReport.id, data: { status: "investigating" } })}
                disabled={updateMutation.isPending}
              >
                Investigate
              </Button>
            )}
            {isSupervisor && selectedReport && (selectedReport.status === "open" || selectedReport.status === "investigating") && (
              <Button
                className="btn-gold-metallic"
                size="sm"
                onClick={() => updateMutation.mutate({ id: selectedReport.id, data: { status: "resolved" } })}
                disabled={updateMutation.isPending}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Resolve
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowDetailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
