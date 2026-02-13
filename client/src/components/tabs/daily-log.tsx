import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Mic, Square, CheckCircle, Edit2, ChevronDown, ChevronRight, Loader2, ArrowRight } from "lucide-react";

const COMMON_STATIONS = ["Dive Team 1", "Dive Team 2", "Dive Team 3", "Subcontractor Dive Team 1", "Subcontractor Dive Team 2", "Night Shift"];


interface AIAnnotation {
  type: "typo" | "missing_info" | "ambiguous" | "safety_flag" | "suggestion";
  message: string;
}

interface LogEvent {
  id: string;
  rawText: string;
  eventTime: string;
  captureTime: string;
  category: string;
  authorId: string;
  station?: string;
  aiAnnotations?: AIAnnotation[];
  renders?: Array<{
    renderType: string;
    renderText: string;
    section: string;
    status: string;
  }>;
}

interface MasterLogEntry {
  id: string;
  eventTime: string;
  rawText: string;
  masterLogLine: string;
  status: string;
  station?: string;
  category?: string;
}

interface DiveRecord {
  id: string;
  diveNumber: number;
  diverId: string;
  diverName?: string;
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  maxDepthFsw?: number;
}

interface MasterLogData {
  day: {
    id: string;
    date: string;
    status: string;
  };
  isLocked: boolean;
  isDraft: boolean;
  sections: {
    ops: MasterLogEntry[];
    dive: MasterLogEntry[];
    directives: MasterLogEntry[];
    safety: MasterLogEntry[];
    risk: MasterLogEntry[];
  };
  stationLogs?: Array<{ station: string; entries: MasterLogEntry[] }>;
  directiveEntries?: MasterLogEntry[];
  conflictEntries?: MasterLogEntry[];
  operationalNotes?: MasterLogEntry[];
  riskEntries?: MasterLogEntry[];
  risks?: Array<{ id: string; riskId: string; description: string; status: string; owner: string; category: string; }>;
  dives?: DiveRecord[];
  summary?: {
    totalDives: number;
    totalDivers: number;
    maxDepth: number;
    safetyIncidents: number;
    directivesCount: number;
    extractedDiverInitials?: string[];
  };
}

function DepthPrompt({ eventId }: { eventId: string }) {
  const [depth, setDepth] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = async () => {
    const val = parseInt(depth, 10);
    if (isNaN(val) || val <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/log-events/${eventId}/depth`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ depthFsw: val }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/days"] });
      toast({ title: `Depth set to ${val} FSW` });
    } catch {
      toast({ title: "Failed to save depth", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center gap-1.5 text-xs rounded px-2 py-1 bg-green-900/30 text-green-300">
        <CheckCircle className="w-3 h-3" />
        <span>Depth recorded: {depth} FSW</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs rounded px-2 py-1.5 bg-amber-900/30 border border-amber-500/30" data-testid={`depth-prompt-${eventId}`}>
      <span className="text-amber-300 font-semibold shrink-0">DEPTH?</span>
      <span className="text-amber-200/80 shrink-0">Dive start detected — enter depth:</span>
      <Input
        data-testid={`depth-input-${eventId}`}
        type="number"
        min="1"
        placeholder="FSW"
        className="h-6 w-20 text-xs bg-navy-800 border-amber-500/40 text-white px-2"
        value={depth}
        onChange={(e) => setDepth(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
        disabled={submitting}
      />
      <Button
        data-testid={`depth-submit-${eventId}`}
        size="sm"
        className="h-6 px-2 text-xs btn-gold-metallic hover:btn-gold-metallic"
        onClick={handleSubmit}
        disabled={submitting || !depth}
      >
        {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
      </Button>
    </div>
  );
}

export function DailyLogTab() {
  const { canWriteLogEvents, isSupervisor } = useAuth();
  const { activeProject, activeDay, refreshDay } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rawInput, setRawInput] = useState("");
  const [selectedStation, setSelectedStation] = useState<string>("");

  const [isRecording, setIsRecording] = useState(false);
  const [pttTranscript, setPttTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pttPendingSubmit, setPttPendingSubmit] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [showCloseout, setShowCloseout] = useState(false);
  const [closeoutForm, setCloseoutForm] = useState({
    scopeStatus: "complete" as "complete" | "incomplete",
    documentationStatus: "complete" as "complete" | "incomplete",
    exceptions: "",
    advisedFor: "",
    advisedAgainst: "",
    deviations: "",
    outstandingIssues: "",
    plannedNextShift: "",
  });

  const [expandedStations, setExpandedStations] = useState<Record<string, boolean>>({});

  const toggleStation = (station: string) => {
    setExpandedStations(prev => ({ ...prev, [station]: !prev[station] }));
  };

  const currentDay = activeDay;

  const { data: events = [], isLoading } = useQuery<LogEvent[]>({
    queryKey: ["log-events", currentDay?.id],
    queryFn: async () => {
      if (!currentDay?.id) return [];
      const res = await fetch(`/api/days/${currentDay.id}/log-events`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentDay?.id,
    refetchInterval: 5000,
  });

  const { data: masterLogData } = useQuery<MasterLogData | null>({
    queryKey: ["master-log", currentDay?.id],
    queryFn: async () => {
      if (!currentDay?.id) return null;
      const res = await fetch(`/api/days/${currentDay.id}/master-log`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentDay?.id,
    refetchInterval: 5000,
  });

  const createEventMutation = useMutation({
    mutationFn: async (rawText: string) => {
      if (!currentDay || !activeProject) throw new Error("No active day or project");
      const res = await fetch("/api/log-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rawText,
          dayId: currentDay.id,
          projectId: activeProject.id,
          station: selectedStation || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create event");
      return res.json();
    },
    onSuccess: () => {
      setRawInput("");
      setPttPendingSubmit(false);
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days", currentDay?.id, "dives"] });
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      queryClient.invalidateQueries({ queryKey: ["dives"] });
      toast({ title: "Entry saved", description: "Log entry persisted to database" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save log entry", variant: "destructive" });
    },
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const editEventMutation = useMutation({
    mutationFn: async ({ id, rawText }: { id: string; rawText: string }) => {
      const res = await fetch(`/api/log-events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rawText, editReason: "Supervisor correction" }),
      });
      if (!res.ok) throw new Error("Failed to update event");
      return res.json();
    },
    onSuccess: () => {
      setEditingEventId(null);
      setEditingText("");
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days", currentDay?.id, "dives"] });
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      toast({ title: "Entry updated", description: "Log entry has been corrected" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update log entry", variant: "destructive" });
    },
  });

  const buildCloseoutPayload = () => {
    const risks = masterLogData?.risks || [];
    return {
      closeoutData: {
        ...closeoutForm,
        standingRisks: risks.map((r: any) => ({ riskId: r.riskId, status: r.status })),
      },
    };
  };

  const closeDayMutation = useMutation({
    mutationFn: async () => {
      if (!currentDay) throw new Error("No day");
      const res = await fetch(`/api/days/${currentDay.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildCloseoutPayload()),
      });
      if (!res.ok) throw new Error("Failed to close day");
      return res.json();
    },
    onSuccess: () => {
      setShowCloseout(false);
      refreshDay();
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      toast({ title: "Shift closed", description: "QC Closeout recorded. Master Log is now locked." });
    },
  });

  const closeAndExportMutation = useMutation({
    mutationFn: async () => {
      if (!currentDay) throw new Error("No day");
      const res = await fetch(`/api/days/${currentDay.id}/close-and-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildCloseoutPayload()),
      });
      if (!res.ok) throw new Error("Failed to close and export");
      return res.json();
    },
    onSuccess: (data) => {
      setShowCloseout(false);
      refreshDay();
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["library-exports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      const fileCount = data.exportedFiles?.length || 0;
      toast({ 
        title: "Shift closed & exported", 
        description: `${fileCount} documents saved to Library` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to export documents", variant: "destructive" });
    },
  });

  const reopenDayMutation = useMutation({
    mutationFn: async () => {
      if (!currentDay) throw new Error("No day");
      const res = await fetch(`/api/days/${currentDay.id}/reopen`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reopen day");
      return res.json();
    },
    onSuccess: () => {
      refreshDay();
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      toast({ title: "Day reopened", description: "Day is now active - reopening logged" });
    },
  });

  const createDayMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error("No project");
      const res = await fetch(`/api/projects/${activeProject.id}/days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date: new Date().toISOString().split('T')[0] }),
      });
      if (!res.ok) throw new Error("Failed to create day");
      return res.json();
    },
    onSuccess: (newDay) => {
      queryClient.invalidateQueries({ queryKey: ["days"] });
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["dives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/days"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-logs"] });
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      refreshDay();
      toast({ title: "New shift started", description: `Shift ${newDay.shift || ""} ready for logging` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create new day", variant: "destructive" });
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      setPttTranscript("");

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      const isSecurityError = (err as any)?.name === "NotAllowedError" || (err as any)?.name === "SecurityError";
      const description = isSecurityError 
        ? "Microphone access requires HTTPS or browser permission. Check your browser settings and allow microphone access for this site."
        : "Could not access microphone. Please check your browser permissions.";
      toast({ title: "Microphone Error", description, variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    setIsRecording(false);
    setIsTranscribing(true);

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const base64 = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            res(result.split(",")[1]);
          };
          reader.readAsDataURL(audioBlob);
        });

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64 }),
          });

          if (!response.ok) throw new Error("Transcription failed");

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullText = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split("\n").filter((l) => l.startsWith("data:"));

              for (const line of lines) {
                try {
                  const data = JSON.parse(line.replace("data: ", ""));
                  if (data.text) {
                    fullText += data.text;
                    setPttTranscript(fullText);
                  }
                  if (data.done && fullText.trim()) {
                    setRawInput((prev) => (prev ? prev + " " + fullText : fullText));
                    setPttTranscript("");
                    setPttPendingSubmit(true);
                  }
                } catch {}
              }
            }
          }
        } catch (err) {
          console.error("Transcription error:", err);
          toast({ title: "Transcription Error", description: "Failed to transcribe audio", variant: "destructive" });
        }

        setIsTranscribing(false);
        resolve();
      };

      mediaRecorderRef.current!.stop();
    });
  }, [toast]);

  const handlePttSubmit = useCallback(() => {
    if (rawInput.trim()) {
      handleSend();
      setPttPendingSubmit(false);
    }
  }, [rawInput]);

  const handlePttClick = useCallback(() => {
    if (pttPendingSubmit && rawInput.trim()) {
      handlePttSubmit();
    } else if (!isRecording && !isTranscribing) {
      startRecording();
    }
  }, [pttPendingSubmit, rawInput, isRecording, isTranscribing, handlePttSubmit, startRecording]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !e.repeat && canWriteLogEvents && currentDay?.status !== "CLOSED") {
        e.preventDefault();
        if (pttPendingSubmit && rawInput.trim()) {
          handlePttSubmit();
        } else if (!isRecording && !isTranscribing) {
          startRecording();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" && isRecording) {
        e.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isRecording, isTranscribing, pttPendingSubmit, rawInput, startRecording, stopRecording, handlePttSubmit, canWriteLogEvents, currentDay?.status]);

  const handleSend = async () => {
    if (!rawInput.trim()) return;
    
    const timePattern = /^\d{3,4}\b/;
    const dashTimePattern = /^(\d{3,4})-(.+)$/;
    let entries: string[] = [];
    
    let lines = rawInput.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 1) {
      let text = lines[0];
      
      const DIVE_PLACEHOLDERS: Record<string, string> = {
        'L/S': '%%LS%%',
        'R/S': '%%RS%%',
        'L/B': '%%LB%%',
        'R/B': '%%RB%%',
      };
      
      for (const [term, placeholder] of Object.entries(DIVE_PLACEHOLDERS)) {
        text = text.split(term).join(placeholder);
      }
      
      if (text.includes('/')) {
        const slashParts = text.split('/').map(p => p.trim()).filter(p => p);
        const parsedEntries: string[] = [];
        
        for (let part of slashParts) {
          for (const [term, placeholder] of Object.entries(DIVE_PLACEHOLDERS)) {
            part = part.split(placeholder).join(term);
          }
          
          const dashMatch = part.match(dashTimePattern);
          if (dashMatch) {
            const time = dashMatch[1];
            const rest = dashMatch[2].replace(/-/g, ' ').trim();
            parsedEntries.push(`${time} ${rest}`);
          } else if (timePattern.test(part)) {
            parsedEntries.push(part.replace(/-/g, ' '));
          } else {
            parsedEntries.push(part.replace(/-/g, ' '));
          }
        }
        
        if (parsedEntries.length >= 1) {
          entries = parsedEntries.filter(e => e.trim());
        }
      }
      
      if (entries.length === 0) {
        const timestampSplit = text.split(/(?=\s+\d{3,4}\b)/);
        const cleanedParts = timestampSplit
          .map(p => p.trim())
          .filter(p => p && timePattern.test(p));
        
        if (cleanedParts.length >= 2) {
          entries = cleanedParts;
        }
      }
    }
    
    if (entries.length === 0) {
      const timestampedLines = lines.filter(line => timePattern.test(line.trim()));
      if (timestampedLines.length >= 2) {
        entries = lines.filter(line => line.trim());
      }
    }
    
    if (entries.length >= 2) {
      let savedCount = 0;
      for (const entry of entries) {
        if (entry.trim()) {
          await createEventMutation.mutateAsync(entry.trim());
          savedCount++;
        }
      }
      setRawInput("");
      toast({ title: `${savedCount} entries saved`, description: "All log entries persisted to database" });
    } else if (entries.length === 1) {
      createEventMutation.mutate(entries[0].trim());
    } else {
      createEventMutation.mutate(rawInput.trim());
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "dive_op": return "btn-gold-metallic";
      case "directive": return "bg-purple-600";
      case "safety": return "bg-red-600";
      case "ops": return "bg-teal-600";
      default: return "bg-gray-600";
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "--:--";
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const sections = masterLogData?.sections || { ops: [], dive: [], directives: [], safety: [], risk: [] };
  const summary = masterLogData?.summary || { totalDives: 0, totalDivers: 0, maxDepth: 0, safetyIncidents: 0, directivesCount: 0, extractedDiverInitials: [] as string[] };
  const dives = masterLogData?.dives || [];
  const stationLogs = masterLogData?.stationLogs || [];
  const directiveEntries = masterLogData?.directiveEntries || sections.directives;
  const conflictEntries = masterLogData?.conflictEntries || [];
  const operationalNotes = masterLogData?.operationalNotes || [];
  const riskEntries = masterLogData?.riskEntries || sections.risk;
  const risks = masterLogData?.risks || [];

  return (
    <div className="h-full flex overflow-hidden">
      {/* LEFT PANE: Supervisor Daily Log */}
      <div className="w-1/2 border-r border-navy-600 flex flex-col overflow-hidden">
        <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">Supervisor Daily Log</h2>
            {currentDay && (
              <>
                <Badge className="text-xs bg-navy-600">
                  {currentDay.date} {currentDay.shift ? `Shift ${currentDay.shift}` : ""}
                </Badge>
                <Badge
                  className={`text-xs ${
                    currentDay.status === "CLOSED"
                      ? "bg-red-600"
                      : currentDay.status === "ACTIVE"
                      ? "bg-green-600"
                      : "bg-yellow-600"
                  }`}
                >
                  {currentDay.status}
                </Badge>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {isSupervisor && currentDay?.status !== "CLOSED" && currentDay && (
              <>
                <Button
                  data-testid="button-close-day"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCloseout(true)}
                  className="text-xs border-red-500 text-red-400 hover:bg-red-500/20"
                >
                  Close Shift
                </Button>
                {showCloseout && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-navy-800 border border-navy-600 rounded-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 mx-4">
                      <h2 className="text-lg font-bold text-amber-400 mb-1">QC Closeout — {currentDay.date}</h2>
                      <p className="text-navy-400 text-xs mb-4">Complete the final QC closeout before locking the 24-hour operational record.</p>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-navy-300 block mb-1">Scope</label>
                            <div className="flex gap-2">
                              {(["complete", "incomplete"] as const).map(v => (
                                <button
                                  key={v}
                                  data-testid={`closeout-scope-${v}`}
                                  onClick={() => setCloseoutForm(f => ({ ...f, scopeStatus: v }))}
                                  className={`px-3 py-1.5 rounded text-xs font-medium border ${
                                    closeoutForm.scopeStatus === v
                                      ? v === "complete" ? "bg-green-600/30 border-green-500 text-green-300" : "bg-red-600/30 border-red-500 text-red-300"
                                      : "bg-navy-700 border-navy-600 text-navy-400"
                                  }`}
                                >
                                  {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-navy-300 block mb-1">Documentation</label>
                            <div className="flex gap-2">
                              {(["complete", "incomplete"] as const).map(v => (
                                <button
                                  key={v}
                                  data-testid={`closeout-docs-${v}`}
                                  onClick={() => setCloseoutForm(f => ({ ...f, documentationStatus: v }))}
                                  className={`px-3 py-1.5 rounded text-xs font-medium border ${
                                    closeoutForm.documentationStatus === v
                                      ? v === "complete" ? "bg-green-600/30 border-green-500 text-green-300" : "bg-red-600/30 border-red-500 text-red-300"
                                      : "bg-navy-700 border-navy-600 text-navy-400"
                                  }`}
                                >
                                  {v.charAt(0).toUpperCase() + v.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-navy-300 block mb-1">Exceptions</label>
                          <input
                            data-testid="closeout-exceptions"
                            value={closeoutForm.exceptions}
                            onChange={e => setCloseoutForm(f => ({ ...f, exceptions: e.target.value }))}
                            placeholder="None Noted"
                            className="w-full bg-navy-900 border border-navy-600 rounded px-3 py-1.5 text-sm text-white placeholder:text-navy-500"
                          />
                        </div>

                        <div className="border border-amber-700/40 rounded p-3 bg-amber-900/10">
                          <p className="text-xs font-semibold text-amber-400 mb-2">SEI Advisories (Record Only)</p>
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-navy-300 block mb-1">Advised FOR</label>
                              <input
                                data-testid="closeout-advised-for"
                                value={closeoutForm.advisedFor}
                                onChange={e => setCloseoutForm(f => ({ ...f, advisedFor: e.target.value }))}
                                placeholder="None"
                                className="w-full bg-navy-900 border border-navy-600 rounded px-3 py-1.5 text-sm text-white placeholder:text-navy-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-navy-300 block mb-1">Advised AGAINST</label>
                              <input
                                data-testid="closeout-advised-against"
                                value={closeoutForm.advisedAgainst}
                                onChange={e => setCloseoutForm(f => ({ ...f, advisedAgainst: e.target.value }))}
                                placeholder="None"
                                className="w-full bg-navy-900 border border-navy-600 rounded px-3 py-1.5 text-sm text-white placeholder:text-navy-500"
                              />
                            </div>
                          </div>
                        </div>

                        {masterLogData?.risks && masterLogData.risks.length > 0 && (
                          <div>
                            <p className="text-xs text-navy-300 mb-1">Standing Risks Referenced</p>
                            <div className="space-y-1">
                              {masterLogData.risks.map((risk: any) => (
                                <div key={risk.id} className="flex items-center gap-2 text-xs bg-navy-900/50 rounded px-2 py-1">
                                  <span className="font-mono text-amber-400">{risk.riskId}</span>
                                  <span className="text-navy-300 flex-1 truncate">{risk.description}</span>
                                  <Badge className={`text-[10px] ${risk.status === "open" ? "bg-red-600" : risk.status === "mitigated" ? "bg-amber-600" : "bg-green-600"}`}>
                                    {risk.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="text-xs text-navy-300 block mb-1">Deviations / Stop-Work / Lessons Learned</label>
                          <Textarea
                            data-testid="closeout-deviations"
                            value={closeoutForm.deviations}
                            onChange={e => setCloseoutForm(f => ({ ...f, deviations: e.target.value }))}
                            placeholder="None"
                            rows={2}
                            className="bg-navy-900 border-navy-600 text-white text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-navy-300 block mb-1">Outstanding Issues</label>
                            <Textarea
                              data-testid="closeout-outstanding"
                              value={closeoutForm.outstandingIssues}
                              onChange={e => setCloseoutForm(f => ({ ...f, outstandingIssues: e.target.value }))}
                              placeholder="None"
                              rows={2}
                              className="bg-navy-900 border-navy-600 text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-navy-300 block mb-1">Planned Work Next Shift</label>
                            <Textarea
                              data-testid="closeout-next-shift"
                              value={closeoutForm.plannedNextShift}
                              onChange={e => setCloseoutForm(f => ({ ...f, plannedNextShift: e.target.value }))}
                              placeholder="Describe planned work..."
                              rows={2}
                              className="bg-navy-900 border-navy-600 text-white text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-navy-600">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCloseout(false)}
                          className="bg-navy-700 text-white border-navy-600 hover:bg-navy-600"
                        >
                          Cancel
                        </Button>
                        <Button
                          data-testid="button-confirm-close"
                          size="sm"
                          onClick={() => closeDayMutation.mutate()}
                          disabled={closeDayMutation.isPending}
                          className="bg-amber-600 text-white hover:bg-amber-700"
                        >
                          {closeDayMutation.isPending ? "Closing..." : "Close Shift"}
                        </Button>
                        <Button
                          data-testid="button-close-export"
                          size="sm"
                          onClick={() => closeAndExportMutation.mutate()}
                          disabled={closeAndExportMutation.isPending}
                          className="bg-green-600 text-white hover:bg-green-700"
                        >
                          {closeAndExportMutation.isPending ? "Exporting..." : "Close & Export"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {isSupervisor && currentDay?.status === "CLOSED" && (
              <>
                <Button
                  data-testid="button-reopen-day"
                  size="sm"
                  variant="outline"
                  onClick={() => reopenDayMutation.mutate()}
                  className="text-xs border-green-500 text-green-400 hover:bg-green-500/20"
                >
                  Reopen Shift
                </Button>
                <Button
                  data-testid="button-new-day"
                  size="sm"
                  variant="outline"
                  onClick={() => createDayMutation.mutate()}
                  disabled={createDayMutation.isPending}
                  className="text-xs border-amber-500 text-amber-400 hover:bg-amber-500/20"
                >
                  {createDayMutation.isPending ? "Creating..." : "New Shift"}
                </Button>
              </>
            )}
            {isSupervisor && !currentDay && (
              <Button
                data-testid="button-start-day"
                size="sm"
                variant="outline"
                onClick={() => createDayMutation.mutate()}
                disabled={createDayMutation.isPending}
                className="text-xs border-amber-500 text-amber-400 hover:bg-amber-500/20"
              >
                {createDayMutation.isPending ? "Creating..." : "Start Shift"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-4 space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                data-testid={`event-${event.id}`}
                className="bg-navy-800/50 rounded p-3 border border-navy-700"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono text-navy-300">
                    {formatTime(event.eventTime)}
                  </span>
                  <Badge className={`text-xs ${getCategoryColor(event.category)}`}>
                    {event.category.replace("_", " ").toUpperCase()}
                  </Badge>
                  {event.station && (
                    <Badge data-testid={`badge-station-${event.id}`} className="text-xs bg-cyan-700 text-cyan-100">
                      {event.station}
                    </Badge>
                  )}
                  {canWriteLogEvents && currentDay?.status !== "CLOSED" && editingEventId !== event.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`edit-event-${event.id}`}
                      className="ml-auto h-6 px-2 text-navy-400 hover:text-amber-400 hover:bg-navy-700"
                      onClick={() => {
                        setEditingEventId(event.id);
                        setEditingText(event.rawText);
                      }}
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      <span className="text-xs">Edit</span>
                    </Button>
                  )}
                </div>
                {editingEventId === event.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="bg-navy-900 border-amber-500/50 text-white font-mono text-sm min-h-[60px]"
                      data-testid={`edit-textarea-${event.id}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        data-testid={`save-edit-${event.id}`}
                        className="bg-amber-600 hover:bg-amber-500 text-black text-xs h-7"
                        disabled={editEventMutation.isPending || editingText.trim() === event.rawText}
                        onClick={() => editEventMutation.mutate({ id: event.id, rawText: editingText })}
                      >
                        {editEventMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`cancel-edit-${event.id}`}
                        className="text-navy-400 hover:text-white text-xs h-7"
                        onClick={() => { setEditingEventId(null); setEditingText(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-white font-mono">{event.rawText}</p>
                    {event.renders && event.renders.length > 0 ? (() => {
                      const masterRender = event.renders!.find(r => r.renderType === "master_log_line");
                      if (!masterRender || masterRender.renderText === event.rawText) return null;
                      return (
                        <div className="mt-1.5 pl-3 border-l-2 border-amber-500/30">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${masterRender.status === "ok" ? "bg-green-500" : masterRender.status === "needs_review" ? "bg-yellow-500" : "bg-red-500"}`} />
                            <span className="text-[10px] text-navy-500 uppercase">{masterRender.section} — AI render</span>
                          </div>
                          <p className="text-xs text-navy-200 italic">{masterRender.renderText}</p>
                        </div>
                      );
                    })() : (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 text-amber-400/60 animate-spin" />
                        <span className="text-[10px] text-navy-500">AI processing...</span>
                      </div>
                    )}
                  </div>
                )}
                {event.aiAnnotations && event.aiAnnotations.length > 0 && (
                  <div className="mt-1.5 space-y-1" data-testid={`annotations-${event.id}`}>
                    {event.aiAnnotations.filter((ann: AIAnnotation) => ann.type !== "typo").map((ann, i) => {
                      const isDepthMissing = ann.type === "missing_info" && ann.message.includes("no depth (FSW)");
                      if (isDepthMissing) {
                        return (
                          <DepthPrompt key={i} eventId={event.id} />
                        );
                      }
                      return (
                        <div key={i} className={`flex items-start gap-1.5 text-xs rounded px-2 py-1 ${
                          ann.type === "typo" ? "bg-blue-900/30 text-blue-300" :
                          ann.type === "missing_info" ? "bg-yellow-900/30 text-yellow-300" :
                          ann.type === "safety_flag" ? "bg-red-900/30 text-red-300" :
                          ann.type === "ambiguous" ? "bg-orange-900/30 text-orange-300" :
                          "bg-navy-700/50 text-navy-300"
                        }`}>
                          <span className="font-semibold shrink-0">
                            {ann.type === "typo" ? "TYPO" :
                             ann.type === "missing_info" ? "MISSING" :
                             ann.type === "safety_flag" ? "SAFETY" :
                             ann.type === "ambiguous" ? "CHECK" : "NOTE"}:
                          </span>
                          <span>{ann.message}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && !isLoading && (
              <p className="text-navy-400 text-center py-8">No log entries yet</p>
            )}
          </div>
        </div>

        {canWriteLogEvents && currentDay?.status !== "CLOSED" && (
          <div className="p-3 border-t border-navy-600 bg-navy-800 shrink-0">
            {(isRecording || isTranscribing || pttTranscript) && (
              <div className="mb-2 px-3 py-2 bg-orange-900/30 border border-orange-500/50 rounded-lg">
                <div className="flex items-center gap-2">
                  {isRecording && (
                    <>
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-xs text-orange-300 font-medium">Recording — release to stop</span>
                    </>
                  )}
                  {isTranscribing && !isRecording && (
                    <>
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                      <span className="text-xs text-orange-300 font-medium">Transcribing...</span>
                    </>
                  )}
                </div>
                {pttTranscript && (
                  <p className="text-sm text-white font-mono mt-1">{pttTranscript}</p>
                )}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <select
                    data-testid="select-station"
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="bg-navy-900 border border-navy-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-amber-500 w-44"
                  >
                    <option value="">No station</option>
                    {COMMON_STATIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-navy-500">Enter to send • Shift+Enter for new line • Hold mic to dictate</span>
                </div>
                <Textarea
                  data-testid="input-raw-text"
                  placeholder="0800 commenced ops, safety brief held / 0830 JM L/S 42 fsw pier 7 bracing..."
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  className="bg-navy-900 border-navy-600 text-white font-mono text-sm min-h-[48px] max-h-[120px] resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5 pb-0.5">
                <Button
                  data-testid="button-ptt"
                  size="sm"
                  onMouseDown={() => {
                    if (!pttPendingSubmit) startRecording();
                  }}
                  onMouseUp={() => {
                    if (isRecording) stopRecording();
                  }}
                  onMouseLeave={() => isRecording && stopRecording()}
                  onClick={() => {
                    if (pttPendingSubmit && rawInput.trim()) {
                      handleSend();
                      setPttPendingSubmit(false);
                    }
                  }}
                  disabled={isTranscribing}
                  className={`h-9 w-9 p-0 ${
                    isRecording 
                      ? "bg-red-600 hover:bg-red-700" 
                      : pttPendingSubmit 
                        ? "bg-green-600 hover:bg-green-700 animate-pulse" 
                        : "bg-navy-600 hover:bg-navy-500 border border-navy-500"
                  }`}
                  title={pttPendingSubmit ? "Click to submit" : "Hold to talk"}
                >
                  {isRecording ? <Square className="h-3.5 w-3.5" /> : pttPendingSubmit ? <CheckCircle className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  data-testid="button-send"
                  size="sm"
                  onClick={handleSend}
                  disabled={!rawInput.trim() || createEventMutation.isPending}
                  className="h-9 w-9 p-0 btn-gold-metallic hover:btn-gold-metallic"
                  title="Send (Enter)"
                >
                  {createEventMutation.isPending ? (
                    <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANE: Daily Master Log (Real-time Preview) */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-amber-400">DAILY OPERATIONS MASTER LOG</h2>
            <p className="text-xs text-navy-400">24-hour format • Updates in real-time</p>
          </div>
          {masterLogData && (
            <Badge className={masterLogData.isLocked ? "bg-red-600" : "bg-green-600"}>
              {masterLogData.isLocked ? "LOCKED" : "DRAFT"}
            </Badge>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-4 space-y-4">
            {/* 1. Header */}
            <header className="text-center border-b border-navy-600 pb-4" data-testid="master-log-header">
              <h1 className="text-lg font-bold text-amber-400 mb-1">DAILY OPERATIONS MASTER LOG</h1>
              <p className="text-sm text-navy-300">{formatDate(masterLogData?.day?.date)}</p>
              <p className="text-xs text-navy-400 mt-1">Precision Subsea Group LLC - DiveOps™</p>
            </header>

            {/* 2. 24-Hour Summary */}
            <section data-testid="section-24hr-summary">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-400 text-sm">24-Hour Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-navy-100 leading-relaxed">
                    {(summary.totalDives > 0 || summary.totalDivers > 0 || events.length > 0) ? (
                      <>
                        On {formatDate(masterLogData?.day?.date)}, diving operations were conducted with{' '}
                        <strong>{summary.totalDives} dive evolution(s)</strong> completed by{' '}
                        <strong>{summary.totalDivers} diver(s)</strong>
                        {(summary as any).extractedDiverInitials?.length > 0 && (
                          <> ({(summary as any).extractedDiverInitials.join(', ')})</>
                        )}
                        .
                        {summary.maxDepth > 0 && (
                          <> Maximum depth reached was <strong>{summary.maxDepth} fsw</strong>.</>
                        )}
                        {summary.directivesCount > 0 && (
                          <> <strong>{summary.directivesCount} client/DHO directive(s)</strong> were received and actioned.</>
                        )}
                        {summary.safetyIncidents > 0 ? (
                          <> <span className="text-yellow-400"><strong>{summary.safetyIncidents} safety incident(s)</strong> were logged.</span></>
                        ) : (
                          <> No safety incidents were reported.</>
                        )}
                        <> Total log entries: <strong>{events.length}</strong>.</>
                      </>
                    ) : (
                      <span className="text-navy-400 italic">
                        Summary will be generated as operations are logged.
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* 3. Client Directives and Changes */}
            <section data-testid="section-directives">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-600" />
                    <CardTitle className="text-amber-400 text-sm">Client Directives and Changes</CardTitle>
                    <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                      {directiveEntries.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {directiveEntries.length > 0 ? (
                    <ul className="space-y-2">
                      {directiveEntries.map((entry, idx) => (
                        <li key={entry.id} className="border-l-2 border-purple-500/50 pl-2 py-0.5">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge className="bg-purple-600 text-[9px] px-1 py-0 font-mono">
                              CD-{String(idx + 1).padStart(3, "0")}
                            </Badge>
                            <span className="text-xs font-mono text-navy-400">
                              {formatTime(entry.eventTime)}
                            </span>
                          </div>
                          <p className="text-xs text-navy-100">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-navy-500 italic">No directives received</p>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* 4. Conflicting / Reversed Direction */}
            <section data-testid="section-conflicts">
              <Card className="bg-navy-800/50 border-red-900/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <CardTitle className="text-amber-400 text-sm">CONFLICTING DIRECTION / REVERSED DIRECTION</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {conflictEntries.length > 0 ? (
                    <ul className="space-y-2">
                      {conflictEntries.map((entry: any) => (
                        <li key={entry.id} className="border-l-2 border-red-500/60 pl-2 py-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge className={`text-[9px] px-1.5 py-0 font-mono ${
                              entry.directiveTag === "REVERSED DIRECTION" ? "bg-orange-600" : "bg-red-600"
                            }`}>
                              {entry.directiveTag || "CONFLICT"}
                            </Badge>
                            <span className="text-xs font-mono text-navy-400">
                              {formatTime(entry.eventTime)}
                            </span>
                          </div>
                          <p className="text-xs text-red-200">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-navy-500 italic">None identified</p>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* 5. Operational Notes (non-timestamped) */}
            <section data-testid="section-operational-notes">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-teal-600" />
                    <CardTitle className="text-amber-400 text-sm">Operational Notes</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {operationalNotes.length > 0 ? (
                    <ul className="space-y-1 list-disc list-inside">
                      {operationalNotes.map((entry) => (
                        <li key={entry.id} className="text-xs text-navy-100">
                          {entry.masterLogLine || entry.rawText}
                        </li>
                      ))}
                    </ul>
                  ) : sections.ops.length > 0 ? (
                    <ul className="space-y-1">
                      {sections.ops.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-xs text-navy-100">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-navy-500 italic">No operational notes</p>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* 6. Station Logs */}
            {stationLogs.length > 0 && (
              <section data-testid="section-station-logs">
                <div className="space-y-3">
                  {stationLogs.map((stationLog) => {
                    const isExpanded = expandedStations[stationLog.station] !== false;
                    return (
                      <Card key={stationLog.station} className="bg-navy-700/50 border-navy-500">
                        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleStation(stationLog.station)}>
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-amber-400" /> : <ChevronRight className="h-4 w-4 text-amber-400" />}
                            <CardTitle className="text-amber-500 text-sm font-bold">{stationLog.station}</CardTitle>
                            <Badge variant="outline" className="text-xs border-navy-400 text-navy-300">
                              {stationLog.entries.length} entries
                            </Badge>
                          </div>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="space-y-3">
                            <div>
                              <h4 className="text-xs font-semibold text-amber-400/80 mb-1 uppercase tracking-wide">Work Executed</h4>
                              {stationLog.entries.length > 0 ? (
                                <ul className="space-y-1">
                                  {stationLog.entries.map((entry) => (
                                    <li key={entry.id} className="flex gap-3 py-1">
                                      <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                                        {formatTime(entry.eventTime)}
                                      </span>
                                      <p className="text-xs text-navy-100">{entry.masterLogLine}</p>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-navy-500 italic">No entries</p>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-navy-600">
                              <div>
                                <h4 className="text-xs font-semibold text-navy-400 mb-1">Production Notes</h4>
                                <p className="text-xs text-navy-500 italic">Not captured</p>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-navy-400 mb-1">Constraints</h4>
                                <p className="text-xs text-navy-500 italic">Not captured</p>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-navy-400 mb-1">QA/QC</h4>
                                <p className="text-xs text-navy-500 italic">Not captured</p>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-navy-400 mb-1">Carryover</h4>
                                <p className="text-xs text-navy-500 italic">Not captured</p>
                              </div>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Dive Operations Table (kept as its own section) */}
            {dives.length > 0 && (
              <section data-testid="section-dive-table">
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full btn-gold-metallic" />
                      <CardTitle className="text-amber-400 text-sm">Dive Operations Log</CardTitle>
                      <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                        {dives.length} dives
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-navy-600 hover:bg-transparent">
                          <TableHead className="text-navy-300 text-xs">Dive #</TableHead>
                          <TableHead className="text-navy-300 text-xs">Diver</TableHead>
                          <TableHead className="text-navy-300 text-xs">L/S</TableHead>
                          <TableHead className="text-navy-300 text-xs">R/B</TableHead>
                          <TableHead className="text-navy-300 text-xs">L/B</TableHead>
                          <TableHead className="text-navy-300 text-xs">R/S</TableHead>
                          <TableHead className="text-navy-300 text-xs">Depth</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dives.map((dive) => (
                          <TableRow key={dive.id} className="border-navy-700 hover:bg-navy-700/30">
                            <TableCell className="text-white font-mono text-xs">#{dive.diveNumber}</TableCell>
                            <TableCell className="text-navy-100 text-xs">{dive.diverName || dive.diverId}</TableCell>
                            <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.lsTime)}</TableCell>
                            <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.rbTime)}</TableCell>
                            <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.lbTime)}</TableCell>
                            <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.rsTime)}</TableCell>
                            <TableCell className="text-navy-100 font-mono text-xs">
                              {dive.maxDepthFsw ? `${dive.maxDepthFsw} fsw` : '--'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Safety section */}
            {sections.safety.length > 0 && (
              <section data-testid="section-safety">
                <Card className="bg-navy-800/50 border-red-900/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-600" />
                      <CardTitle className="text-amber-400 text-sm">Safety & Incidents</CardTitle>
                      <Badge className="bg-red-600 text-xs">
                        {sections.safety.length} entries
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {sections.safety.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-xs text-red-200">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* 7. Risk Register Updates */}
            <section data-testid="section-risk">
              <Card className="bg-navy-800/50 border-orange-900/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-600" />
                    <CardTitle className="text-amber-400 text-sm">Risk Register Updates</CardTitle>
                    {(risks.length > 0 || riskEntries.length > 0) && (
                      <Badge className="bg-orange-600 text-xs">
                        {risks.length || riskEntries.length} items
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {risks.length > 0 ? (
                    <ul className="space-y-2">
                      {risks.map((risk) => (
                        <li key={risk.id} className="p-2 bg-navy-700/50 rounded border border-navy-600">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="text-xs bg-orange-700">{risk.riskId}</Badge>
                            <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">{risk.status}</Badge>
                            {risk.category && <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">{risk.category}</Badge>}
                          </div>
                          <p className="text-xs text-navy-100">{risk.description}</p>
                          {risk.owner && <p className="text-xs text-navy-400 mt-1">Owner: {risk.owner}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : riskEntries.length > 0 ? (
                    <ul className="space-y-1">
                      {riskEntries.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-xs text-orange-200">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-navy-500 italic">No risk updates</p>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* 8. Advisory Block */}
            <section data-testid="section-advisory">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-400 text-sm">Advisory Block</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold text-navy-300 w-24 shrink-0">Advised For:</span>
                      <span className="text-xs text-navy-500 italic">Not provided</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold text-navy-300 w-24 shrink-0">Advised Against:</span>
                      <span className="text-xs text-navy-500 italic">Not provided</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold text-navy-300 w-24 shrink-0">Outcome:</span>
                      <span className="text-xs text-navy-500 italic">Not provided</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 9. Closeout Block */}
            <section data-testid="section-closeout">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-400 text-sm">Closeout</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold text-navy-300 w-36 shrink-0">Scope Complete:</span>
                      <span className="text-xs text-navy-500 italic">Not provided</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold text-navy-300 w-36 shrink-0">Documentation Complete:</span>
                      <span className="text-xs text-navy-500 italic">Not provided</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold text-navy-300 w-36 shrink-0">Exceptions:</span>
                      <span className="text-xs text-navy-500 italic">Not provided</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {!isLoading && sections.ops.length === 0 && sections.dive.length === 0 && 
             sections.directives.length === 0 && sections.safety.length === 0 && dives.length === 0 && 
             stationLogs.length === 0 && (
              <div className="text-center py-8">
                <p className="text-navy-400">No log entries yet</p>
                <p className="text-xs text-navy-500 mt-1">
                  The master log will populate as entries are added
                </p>
              </div>
            )}

            <footer className="text-center border-t border-navy-600 pt-4 mt-6">
              <p className="text-xs text-navy-500">
                Auto-generated from DiveOps™ event log. All times local. 
                Document is {masterLogData?.isLocked ? "LOCKED" : "DRAFT"}.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
