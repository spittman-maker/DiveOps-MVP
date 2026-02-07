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
import { Mic, Square, AlertTriangle, CheckCircle, Edit2, ChevronDown, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const COMMON_STATIONS = ["LWT Big House", "LWT Maui Box", "West ATC Wall", "Night Shift", "GDS"];

interface ValidationEntry {
  entry: string;
  valid: boolean;
  payload: {
    directives: Array<{ time: string; text: string }>;
    station_logs: Array<{ text: string }>;
    risks: Array<{ description: string }>;
  };
  errors: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  entries?: ValidationEntry[];
  totalEntries?: number;
}

interface LogEvent {
  id: string;
  rawText: string;
  eventTime: string;
  captureTime: string;
  category: string;
  authorId: string;
  station?: string;
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

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showValidationPreview, setShowValidationPreview] = useState(false);

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
      toast({ title: "Entry saved", description: "Log entry persisted to database" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save log entry", variant: "destructive" });
    },
  });

  const closeDayMutation = useMutation({
    mutationFn: async () => {
      if (!currentDay) throw new Error("No day");
      const res = await fetch(`/api/days/${currentDay.id}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to close day");
      return res.json();
    },
    onSuccess: () => {
      refreshDay();
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      toast({ title: "Shift closed", description: "Master Log is now locked" });
    },
  });

  const closeAndExportMutation = useMutation({
    mutationFn: async () => {
      if (!currentDay) throw new Error("No day");
      const res = await fetch(`/api/days/${currentDay.id}/close-and-export`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to close and export");
      return res.json();
    },
    onSuccess: (data) => {
      refreshDay();
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["library-exports"] });
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
      toast({ title: "Microphone Error", description: "Could not access microphone", variant: "destructive" });
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

  const validateEntry = async (text: string): Promise<ValidationResult> => {
    setIsValidating(true);
    try {
      const res = await fetch("/api/log-events/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rawText: text }),
      });
      if (!res.ok) throw new Error("Validation failed");
      return await res.json();
    } catch (error) {
      return { valid: false, errors: ["Failed to validate entry"] };
    } finally {
      setIsValidating(false);
    }
  };

  const handleValidate = async () => {
    if (!rawInput.trim()) return;
    const result = await validateEntry(rawInput.trim());
    setValidationResult(result);
    setShowValidationPreview(true);
  };

  useEffect(() => {
    if (validationResult) {
      setValidationResult(null);
      setShowValidationPreview(false);
    }
  }, [rawInput]);

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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    data-testid="button-close-day"
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-500 text-red-400 hover:bg-red-500/20"
                  >
                    Close Shift
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-navy-800 border-navy-600">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Confirm Close Shift</AlertDialogTitle>
                    <AlertDialogDescription className="text-navy-300">
                      Are you sure you want to close this shift? The Master Log will be locked and no new entries can be added. You can reopen if needed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                    <AlertDialogCancel className="bg-navy-700 text-white border-navy-600 hover:bg-navy-600">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => closeDayMutation.mutate()}
                      className="bg-amber-600 text-white hover:bg-amber-700"
                    >
                      Close Shift
                    </AlertDialogAction>
                    <AlertDialogAction
                      onClick={() => closeAndExportMutation.mutate()}
                      disabled={closeAndExportMutation.isPending}
                      className="bg-green-600 text-white hover:bg-green-700"
                    >
                      {closeAndExportMutation.isPending ? "Exporting..." : "Close & Export to Library"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                </div>
                <p className="text-sm text-white font-mono">{event.rawText}</p>
              </div>
            ))}
            {events.length === 0 && !isLoading && (
              <p className="text-navy-400 text-center py-8">No log entries yet</p>
            )}
          </div>
        </div>

        {canWriteLogEvents && currentDay?.status !== "CLOSED" && (
          <div className="p-4 border-t border-navy-600 bg-navy-800 shrink-0">
            {(isRecording || isTranscribing || pttTranscript) && (
              <div className="mb-3 p-3 bg-orange-900/30 border border-orange-500/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {isRecording && (
                    <>
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-sm text-orange-300 font-medium">Recording...</span>
                    </>
                  )}
                  {isTranscribing && !isRecording && (
                    <>
                      <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
                      <span className="text-sm text-orange-300 font-medium">Transcribing...</span>
                    </>
                  )}
                </div>
                {pttTranscript && (
                  <p className="text-sm text-white font-mono">{pttTranscript}</p>
                )}
              </div>
            )}
            <div className="mb-2">
              <select
                data-testid="select-station"
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-amber-500"
              >
                <option value="">No station selected</option>
                {COMMON_STATIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Textarea
                data-testid="input-raw-text"
                placeholder="Enter log entry or batch with slashes (e.g., '0530-safety meeting/0600-crew briefing/0630-L/S-JS down')"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                className="bg-navy-900 border-navy-600 text-white font-mono text-sm min-h-[60px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex flex-col gap-2">
                <Button
                  data-testid="button-ptt"
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
                  className={`${
                    isRecording 
                      ? "bg-red-600 hover:bg-red-700" 
                      : pttPendingSubmit 
                        ? "bg-green-600 hover:bg-green-700 animate-pulse" 
                        : "bg-orange-600 hover:bg-orange-700"
                  } min-w-[60px]`}
                  title={pttPendingSubmit ? "Click to submit (or press Alt)" : "Hold to talk, release to review, click again to submit"}
                >
                  {isRecording ? <Square className="h-4 w-4" /> : pttPendingSubmit ? "Send" : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  data-testid="button-validate"
                  onClick={handleValidate}
                  disabled={!rawInput.trim() || isValidating}
                  variant="outline"
                  className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/20"
                  title="Check entry before saving"
                >
                  {isValidating ? "..." : <Edit2 className="h-4 w-4" />}
                </Button>
                <Button
                  data-testid="button-send"
                  onClick={handleSend}
                  disabled={!rawInput.trim() || createEventMutation.isPending}
                  className="btn-gold-metallic hover:btn-gold-metallic"
                >
                  Send
                </Button>
              </div>
            </div>

            {showValidationPreview && validationResult && (
              <Alert className={`mt-3 ${validationResult.valid ? "border-green-500 bg-green-500/10" : "border-yellow-500 bg-yellow-500/10"}`}>
                <div className="flex items-start gap-2">
                  {validationResult.valid ? (
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                  )}
                  <AlertDescription className="text-sm flex-1">
                    {validationResult.valid ? (
                      <span className="text-green-400">
                        {validationResult.totalEntries && validationResult.totalEntries > 1 
                          ? `${validationResult.totalEntries} entries validated. Ready to submit.`
                          : "Entry validated. Ready to submit."}
                      </span>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-yellow-400 font-medium">Please fix before submitting:</span>
                        <ul className="list-disc list-inside text-yellow-300 text-xs space-y-1">
                          {validationResult.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {validationResult.entries && validationResult.entries.length > 0 && (
                      <div className="mt-2 text-xs border-t border-navy-600 pt-2 space-y-2">
                        <span className="text-navy-400">Preview ({validationResult.entries.length} entries):</span>
                        {validationResult.entries.map((entry, idx) => (
                          <div key={idx} className={`p-2 rounded ${entry.valid ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              {entry.valid ? (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                              )}
                              <span className="font-mono text-navy-300">{entry.entry}</span>
                            </div>
                            {entry.payload.directives.map((d, i) => (
                              <div key={`d-${i}`} className="font-mono text-navy-200 ml-5">[{d.time}] {d.text}</div>
                            ))}
                            {entry.payload.station_logs.map((s, i) => (
                              <div key={`s-${i}`} className="font-mono text-navy-400 ml-5">{s.text}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            <p className="text-xs text-navy-400 mt-2">
              Entries are autosaved immediately. Press Enter to send. Click ✎ to validate before saving.
            </p>
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
                    <ul className="space-y-1">
                      {directiveEntries.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
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
                    <ul className="space-y-1">
                      {conflictEntries.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
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
