import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface NearMissReport {
  id: string;
  projectId: string;
  dayId: string | null;
  reportedBy: string;
  reportedByName: string | null;
  title: string;
  description: string;
  location: string | null;
  severity: string;
  status: string;
  category: string | null;
  involvedPersonnel: string[];
  immediateActions: string | null;
  rootCause: string | null;
  correctiveActions: string | null;
  voiceTranscript: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-amber-500/20 text-amber-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  reported: "bg-blue-500/20 text-blue-400",
  under_review: "bg-amber-500/20 text-amber-400",
  resolved: "bg-emerald-500/20 text-emerald-400",
  closed: "bg-gray-500/20 text-gray-400",
};

const CATEGORIES = [
  "Slip/Trip/Fall",
  "Equipment Failure",
  "Communication Breakdown",
  "Procedural Deviation",
  "Environmental Hazard",
  "Near-Drowning/DCS",
  "Rigging/Lifting",
  "Electrical",
  "Chemical Exposure",
  "Other",
];

export function SafetyNearMiss() {
  const { activeProject, activeDay } = useProject();
  const { isSupervisor, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<NearMissReport | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<string>("low");
  const [category, setCategory] = useState("");
  const [involvedPersonnel, setInvolvedPersonnel] = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");

  // Review form state
  const [rootCause, setRootCause] = useState("");
  const [correctiveActions, setCorrectiveActions] = useState("");

  const { data: nearMisses = [], isLoading } = useQuery<NearMissReport[]>({
    queryKey: ["safety-near-misses", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/safety/${activeProject.id}/near-misses`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error("No project");
      const res = await fetch("/api/safety/near-misses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          dayId: activeDay?.id,
          title,
          description,
          location: location || undefined,
          severity,
          category: category || undefined,
          involvedPersonnel: involvedPersonnel ? involvedPersonnel.split(",").map(s => s.trim()).filter(Boolean) : [],
          immediateActions: immediateActions || undefined,
          voiceTranscript: voiceTranscript || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create report");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["safety-near-misses"] });
      queryClient.invalidateQueries({ queryKey: ["safety-metrics"] });
      setShowCreate(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await fetch(`/api/safety/near-misses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update report");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["safety-near-misses"] });
      setSelectedReport(data);
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setLocation("");
    setSeverity("low");
    setCategory("");
    setInvolvedPersonnel("");
    setImmediateActions("");
    setVoiceTranscript("");
  };

  // Voice recording using Web Speech API (browser-native)
  const startVoiceInput = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = voiceTranscript;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
          setVoiceTranscript(finalTranscript);
          // Auto-fill description if empty
          if (!description) {
            setDescription(finalTranscript.trim());
          }
        } else {
          interim += transcript;
        }
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setIsRecording(true);

    // Store reference for stopping
    (window as any).__safetyRecognition = recognition;
  }, [voiceTranscript, description]);

  const stopVoiceInput = useCallback(() => {
    const recognition = (window as any).__safetyRecognition;
    if (recognition) {
      recognition.stop();
      delete (window as any).__safetyRecognition;
    }
    setIsRecording(false);
  }, []);

  // Create Form
  if (showCreate) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Report Near-Miss</h2>
              <p className="text-sm text-muted-foreground">Quick capture — use voice input for faster reporting</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
          </div>

          {/* Voice Input */}
          <Card className="bg-card border-border border-l-4 border-l-amber-500">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold text-amber-400">Voice Input</Label>
                <Button
                  size="sm"
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopVoiceInput : startVoiceInput}
                  className={isRecording ? "animate-pulse" : ""}
                >
                  {isRecording ? "Stop Recording" : "Start Voice Input"}
                </Button>
              </div>
              {isRecording && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-red-400">Recording... speak clearly</span>
                </div>
              )}
              {voiceTranscript && (
                <div className="bg-secondary/50 rounded p-2 mt-2">
                  <span className="text-xs text-muted-foreground">Transcript:</span>
                  <p className="text-sm text-white mt-1">{voiceTranscript}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-xs">Title *</Label>
                <Input
                  placeholder="Brief description of the near-miss..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Detailed Description *</Label>
                <Textarea
                  placeholder="What happened? What could have happened? ..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Location</Label>
                  <Input
                    placeholder="Where did it occur?"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Severity</Label>
                  <div className="flex gap-2 mt-1">
                    {(["low", "medium", "high", "critical"] as const).map((sev) => (
                      <button
                        key={sev}
                        onClick={() => setSeverity(sev)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                          severity === sev
                            ? sev === "low" ? "bg-emerald-600 text-white"
                              : sev === "medium" ? "bg-amber-600 text-white"
                              : sev === "high" ? "bg-orange-600 text-white"
                              : "bg-red-600 text-white"
                            : "bg-secondary text-muted-foreground hover:text-white"
                        }`}
                      >
                        {sev.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat === category ? "" : cat)}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        category === cat
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Involved Personnel (comma-separated)</Label>
                <Input
                  placeholder="e.g., John Smith, Jane Doe"
                  value={involvedPersonnel}
                  onChange={(e) => setInvolvedPersonnel(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Immediate Actions Taken</Label>
                <Textarea
                  placeholder="What actions were taken immediately?"
                  rows={2}
                  value={immediateActions}
                  onChange={(e) => setImmediateActions(e.target.value)}
                />
              </div>
              <Button
                className="w-full btn-gold-metallic"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !title || !description}
              >
                {createMutation.isPending ? "Submitting..." : "Submit Near-Miss Report"}
              </Button>
              {createMutation.isError && (
                <p className="text-xs text-red-400">{(createMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  // Detail View
  if (selectedReport) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { setSelectedReport(null); setRootCause(""); setCorrectiveActions(""); }}>
                Back
              </Button>
              <div>
                <h2 className="text-lg font-bold text-white">{selectedReport.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={SEVERITY_COLORS[selectedReport.severity] || "bg-gray-500/20"}>
                    {selectedReport.severity.toUpperCase()}
                  </Badge>
                  <Badge className={STATUS_COLORS[selectedReport.status] || "bg-gray-500/20"}>
                    {selectedReport.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Reported by {selectedReport.reportedByName} on {new Date(selectedReport.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">Description</span>
                <p className="text-sm text-white mt-1">{selectedReport.description}</p>
              </div>
              {selectedReport.location && (
                <div>
                  <span className="text-xs text-muted-foreground">Location</span>
                  <p className="text-sm text-white mt-1">{selectedReport.location}</p>
                </div>
              )}
              {selectedReport.category && (
                <div>
                  <span className="text-xs text-muted-foreground">Category</span>
                  <p className="text-sm text-white mt-1">{selectedReport.category}</p>
                </div>
              )}
              {selectedReport.involvedPersonnel && selectedReport.involvedPersonnel.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Involved Personnel</span>
                  <p className="text-sm text-white mt-1">{selectedReport.involvedPersonnel.join(", ")}</p>
                </div>
              )}
              {selectedReport.immediateActions && (
                <div>
                  <span className="text-xs text-muted-foreground">Immediate Actions</span>
                  <p className="text-sm text-white mt-1">{selectedReport.immediateActions}</p>
                </div>
              )}
              {selectedReport.voiceTranscript && (
                <div>
                  <span className="text-xs text-muted-foreground">Voice Transcript</span>
                  <p className="text-sm text-white/80 mt-1 italic">{selectedReport.voiceTranscript}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Root Cause & Corrective Actions (existing) */}
          {(selectedReport.rootCause || selectedReport.correctiveActions) && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Investigation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedReport.rootCause && (
                  <div>
                    <span className="text-xs text-muted-foreground">Root Cause</span>
                    <p className="text-sm text-white mt-1">{selectedReport.rootCause}</p>
                  </div>
                )}
                {selectedReport.correctiveActions && (
                  <div>
                    <span className="text-xs text-muted-foreground">Corrective Actions</span>
                    <p className="text-sm text-white mt-1">{selectedReport.correctiveActions}</p>
                  </div>
                )}
                {selectedReport.resolvedAt && (
                  <p className="text-xs text-muted-foreground">
                    Resolved on {new Date(selectedReport.resolvedAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Supervisor Actions */}
          {isSupervisor && selectedReport.status !== "closed" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Supervisor Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedReport.status === "reported" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateMutation.mutate({
                      id: selectedReport.id,
                      updates: { status: "under_review" },
                    })}
                    disabled={updateMutation.isPending}
                  >
                    Begin Review
                  </Button>
                )}
                {selectedReport.status === "under_review" && (
                  <>
                    <div>
                      <Label className="text-xs">Root Cause Analysis</Label>
                      <Textarea
                        placeholder="What was the root cause?"
                        rows={3}
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Corrective Actions</Label>
                      <Textarea
                        placeholder="What corrective actions will be taken?"
                        rows={3}
                        value={correctiveActions}
                        onChange={(e) => setCorrectiveActions(e.target.value)}
                      />
                    </div>
                    <Button
                      className="btn-gold-metallic"
                      onClick={() => updateMutation.mutate({
                        id: selectedReport.id,
                        updates: {
                          status: "resolved",
                          rootCause: rootCause || undefined,
                          correctiveActions: correctiveActions || undefined,
                        },
                      })}
                      disabled={updateMutation.isPending}
                    >
                      Resolve Near-Miss
                    </Button>
                  </>
                )}
                {selectedReport.status === "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateMutation.mutate({
                      id: selectedReport.id,
                      updates: { status: "closed" },
                    })}
                    disabled={updateMutation.isPending}
                  >
                    Close Report
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    );
  }

  // List View
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Near-Miss Reports</h2>
            <p className="text-sm text-muted-foreground">Report and track near-miss incidents</p>
          </div>
          <Button
            size="sm"
            className="btn-gold-metallic"
            onClick={() => setShowCreate(true)}
          >
            Report Near-Miss
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading reports...</div>
        ) : nearMisses.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No near-miss reports yet.</p>
              <p className="text-xs mt-2">Click "Report Near-Miss" to capture an incident.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {nearMisses.map((report) => (
              <Card
                key={report.id}
                className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedReport(report)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{report.title}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          By: {report.reportedByName || "Unknown"}
                        </span>
                        {report.category && (
                          <Badge variant="outline" className="text-xs">{report.category}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={SEVERITY_COLORS[report.severity] || "bg-gray-500/20"}>
                        {report.severity}
                      </Badge>
                      <Badge className={STATUS_COLORS[report.status] || "bg-gray-500/20"}>
                        {report.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
