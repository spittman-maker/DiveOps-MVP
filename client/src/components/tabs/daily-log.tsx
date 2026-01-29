import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
      toast({ title: "Day closed", description: "Master Log is now locked" });
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
      toast({ title: "Day reopened", description: "Day is now active - reopening logged" });
    },
  });

  const handleSend = async () => {
    if (!rawInput.trim()) return;
    
    const timePattern = /^\d{3,4}\b/;
    let entries: string[] = [];
    
    // First try splitting by newlines
    let lines = rawInput.trim().split('\n').filter(line => line.trim());
    
    // Split ONLY on timestamp boundaries (space followed by 3-4 digit time)
    if (lines.length === 1) {
      const text = lines[0];
      // Split before any space + timestamp pattern like " 0630"
      const timestampSplit = text.split(/(?=\s+\d{3,4}\b)/);
      const cleanedParts = timestampSplit
        .map(p => p.trim())
        .filter(p => p && timePattern.test(p));
      
      if (cleanedParts.length >= 2) {
        entries = cleanedParts;
      }
    }
    
    // If no timestamp splitting worked, try newlines with timestamps
    if (entries.length === 0) {
      const timestampedLines = lines.filter(line => timePattern.test(line.trim()));
      if (timestampedLines.length >= 2) {
        entries = lines.filter(line => line.trim());
      }
    }
    
    // Save multiple entries or single entry
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

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-1/2 border-r border-navy-600 flex flex-col overflow-hidden">
        <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">Raw Event Stream</h2>
            {currentDay && (
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
            )}
          </div>
          {isSupervisor && currentDay?.status !== "CLOSED" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  data-testid="button-close-day"
                  size="sm"
                  variant="outline"
                  className="text-xs border-amber-500 text-amber-400 hover:bg-amber-500/20"
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
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-navy-700 text-white border-navy-600 hover:bg-navy-600">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => closeDayMutation.mutate()}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Close Shift
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isSupervisor && currentDay?.status === "CLOSED" && (
            <Button
              data-testid="button-reopen-day"
              size="sm"
              variant="outline"
              onClick={() => reopenDayMutation.mutate()}
              className="text-xs border-green-500 text-green-400 hover:bg-green-500/20"
            >
              Reopen Day
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-2">
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
          <div className="p-4 border-t border-navy-600 bg-navy-800">
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

      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="bg-navy-800 p-3 border-b border-navy-600">
          <h2 className="text-sm font-semibold text-white">Internal Canvas</h2>
          <p className="text-xs text-navy-400">AI-cleaned entries (derived from raw stream)</p>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-2">
            {events.map((event) => {
              const internalRender = event.renders?.find(r => r.renderType === "internal_canvas_line");
              return (
                <div
                  key={event.id}
                  data-testid={`canvas-${event.id}`}
                  className="bg-navy-800/30 rounded p-3 border border-navy-700/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono text-navy-300">
                      {formatTime(event.eventTime)}
                    </span>
                    {internalRender?.status === "failed" && (
                      <Badge className="bg-yellow-600 text-xs">AI Failed</Badge>
                    )}
                  </div>
                  <p className="text-sm text-navy-100">
                    {internalRender?.renderText || event.rawText}
                  </p>
                </div>
              );
            })}
            {events.length === 0 && !isLoading && (
              <p className="text-navy-400 text-center py-8">Canvas will populate from log entries</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
