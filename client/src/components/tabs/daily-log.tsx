import { useState } from "react";
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

interface LogEvent {
  id: string;
  rawText: string;
  eventTime: string;
  captureTime: string;
  category: string;
  authorId: string;
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
  dives?: DiveRecord[];
  summary?: {
    totalDives: number;
    totalDivers: number;
    maxDepth: number;
    safetyIncidents: number;
    directivesCount: number;
  };
}

export function DailyLogTab() {
  const { canWriteLogEvents, isSupervisor } = useAuth();
  const { activeProject, activeDay, refreshDay } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rawInput, setRawInput] = useState("");

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
        }),
      });
      if (!res.ok) throw new Error("Failed to create event");
      return res.json();
    },
    onSuccess: () => {
      setRawInput("");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["days"] });
      refreshDay();
      toast({ title: "New day started", description: "Ready to log events" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create new day", variant: "destructive" });
    },
  });

  const handleSend = async () => {
    if (!rawInput.trim()) return;
    
    const timePattern = /^\d{3,4}\b/;
    let entries: string[] = [];
    
    let lines = rawInput.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 1) {
      const text = lines[0];
      const timestampSplit = text.split(/(?=\s+\d{3,4}\b)/);
      const cleanedParts = timestampSplit
        .map(p => p.trim())
        .filter(p => p && timePattern.test(p));
      
      if (cleanedParts.length >= 2) {
        entries = cleanedParts;
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
    } else {
      createEventMutation.mutate(rawInput.trim());
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "dive_op": return "bg-blue-600";
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
                  className="text-xs border-blue-500 text-blue-400 hover:bg-blue-500/20"
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
                className="text-xs border-blue-500 text-blue-400 hover:bg-blue-500/20"
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
            <div className="flex gap-2">
              <Textarea
                data-testid="input-raw-text"
                placeholder="Enter log entry (e.g., '0830 JS LS 40 fsw pier inspection')"
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
              <Button
                data-testid="button-send"
                onClick={handleSend}
                disabled={!rawInput.trim() || createEventMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Send
              </Button>
            </div>
            <p className="text-xs text-navy-400 mt-2">
              Entries are autosaved immediately. Press Enter to send.
            </p>
          </div>
        )}
      </div>

      {/* RIGHT PANE: Daily Master Log (Real-time Preview) */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Daily Master Log</h2>
            <p className="text-xs text-navy-400">24-hour format • Updates in real-time</p>
          </div>
          {masterLogData && (
            <Badge className={masterLogData.isLocked ? "bg-red-600" : "bg-green-600"}>
              {masterLogData.isLocked ? "LOCKED" : "DRAFT"}
            </Badge>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-4 space-y-6">
            <header className="text-center border-b border-navy-600 pb-4">
              <h1 className="text-xl font-bold text-white mb-1">DAILY OPERATIONS MASTER LOG</h1>
              <p className="text-sm text-navy-300">{formatDate(masterLogData?.day?.date)}</p>
              <p className="text-xs text-navy-400 mt-1">Precision Subsea Group LLC - DiveOps™</p>
            </header>

            <section data-testid="section-narrative">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm">Executive Summary</CardTitle>
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

            {dives.length > 0 && (
              <section data-testid="section-dive-table">
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                      <CardTitle className="text-white text-sm">Dive Operations Log</CardTitle>
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

            {sections.directives.length > 0 && (
              <section data-testid="section-directives">
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-600" />
                      <CardTitle className="text-white text-sm">Client Directives</CardTitle>
                      <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                        {sections.directives.length} entries
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {sections.directives.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-xs text-navy-100">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {sections.safety.length > 0 && (
              <section data-testid="section-safety">
                <Card className="bg-navy-800/50 border-red-900/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-600" />
                      <CardTitle className="text-white text-sm">Safety & Incidents</CardTitle>
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

            {sections.ops.length > 0 && (
              <section data-testid="section-ops">
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-teal-600" />
                      <CardTitle className="text-white text-sm">General Operations</CardTitle>
                      <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                        {sections.ops.length} entries
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              </section>
            )}

            {sections.risk.length > 0 && (
              <section data-testid="section-risk">
                <Card className="bg-navy-800/50 border-orange-900/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-600" />
                      <CardTitle className="text-white text-sm">Risk Register Updates</CardTitle>
                      <Badge className="bg-orange-600 text-xs">
                        {sections.risk.length} entries
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {sections.risk.map((entry) => (
                        <li key={entry.id} className="flex gap-3 py-1">
                          <span className="text-xs font-mono text-navy-400 w-12 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-xs text-orange-200">{entry.masterLogLine}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {!isLoading && sections.ops.length === 0 && sections.dive.length === 0 && 
             sections.directives.length === 0 && sections.safety.length === 0 && dives.length === 0 && (
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
