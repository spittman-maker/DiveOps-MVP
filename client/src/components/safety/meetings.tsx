import { useState } from "react";
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

interface MeetingAgenda {
  safetyTopicOfDay: string;
  previousShiftSummary: {
    workCompleted: string[];
    issues: string[];
    nearMisses: string[];
  };
  todaysHazards: { hazard: string; mitigation: string }[];
  openDiscussionPoints: string[];
  supervisorQuestions: { question: string; answer?: string }[];
  weatherConditions?: string;
  equipmentStatusFlags?: string[];
  plannedOperations?: string[];
}

interface SafetyMeeting {
  id: string;
  projectId: string;
  dayId: string | null;
  title: string;
  meetingDate: string;
  status: string;
  agenda: MeetingAgenda;
  aiGenerated: boolean;
  conductedBy: string;
  conductedByName: string | null;
  attendees: string[];
  duration: number | null;
  notes: string | null;
  digitalSignature: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
};

export function SafetyMeetings() {
  const { activeProject, activeDay } = useProject();
  const { isSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMeeting, setSelectedMeeting] = useState<SafetyMeeting | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editingAgenda, setEditingAgenda] = useState<MeetingAgenda | null>(null);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [signature, setSignature] = useState("");

  // AI generation form state
  const [genOps, setGenOps] = useState("");
  const [genWeather, setGenWeather] = useState("");
  const [genNotes, setGenNotes] = useState("");

  const { data: meetings = [], isLoading } = useQuery<SafetyMeeting[]>({
    queryKey: ["safety-meetings", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/safety/${activeProject.id}/meetings`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error("No project");
      const res = await fetch("/api/safety/meetings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          dayId: activeDay?.id,
          plannedOperations: genOps ? genOps.split("\n").filter(Boolean) : [],
          weatherConditions: genWeather || undefined,
          supervisorNotes: genNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI generation failed" }));
        throw new Error(err.error || "AI generation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["safety-meetings"] });
      queryClient.invalidateQueries({ queryKey: ["safety-metrics"] });
      setShowGenerate(false);
      setSelectedMeeting(data);
      setGenOps("");
      setGenWeather("");
      setGenNotes("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await fetch(`/api/safety/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update meeting");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["safety-meetings"] });
      setSelectedMeeting(data);
      setEditingAgenda(null);
    },
  });

  // AI Generation Form
  if (showGenerate) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Generate Morning Safety Meeting</h2>
              <p className="text-sm text-muted-foreground">
                AI will create a 10-minute meeting agenda based on your inputs
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowGenerate(false)}>Cancel</Button>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-xs">Planned Operations for Today (one per line)</Label>
                <Textarea
                  placeholder="e.g., Hull inspection at Berth 3&#10;Cathodic protection survey&#10;Equipment maintenance"
                  rows={4}
                  value={genOps}
                  onChange={(e) => setGenOps(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Current Weather Conditions</Label>
                <Input
                  placeholder="e.g., Partly cloudy, 72°F, winds 8kt NW, seas 1-2ft"
                  value={genWeather}
                  onChange={(e) => setGenWeather(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Supervisor Notes / Safety Concerns</Label>
                <Textarea
                  placeholder="Any specific concerns, recent incidents, or topics to address..."
                  rows={3}
                  value={genNotes}
                  onChange={(e) => setGenNotes(e.target.value)}
                />
              </div>
              <Button
                className="w-full btn-gold-metallic"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating with AI..." : "Generate Meeting Agenda"}
              </Button>
              {generateMutation.isError && (
                <p className="text-xs text-red-400">{(generateMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  // Meeting Detail View
  if (selectedMeeting) {
    const agenda = editingAgenda || selectedMeeting.agenda;
    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { setSelectedMeeting(null); setEditingAgenda(null); }}>
                Back
              </Button>
              <div>
                <h2 className="text-lg font-bold text-white">{selectedMeeting.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={STATUS_COLORS[selectedMeeting.status] || "bg-gray-500/20"}>
                    {selectedMeeting.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  {selectedMeeting.aiGenerated && (
                    <Badge className="bg-purple-500/20 text-purple-400">AI Generated</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {selectedMeeting.meetingDate} | By: {selectedMeeting.conductedByName}
                  </span>
                </div>
              </div>
            </div>
            {isSupervisor && (
              <div className="flex gap-2">
                {selectedMeeting.status !== "completed" && !editingAgenda && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingAgenda({ ...selectedMeeting.agenda })}
                  >
                    Edit Agenda
                  </Button>
                )}
                {editingAgenda && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingAgenda(null)}
                    >
                      Cancel Edit
                    </Button>
                    <Button
                      size="sm"
                      className="btn-gold-metallic"
                      onClick={() => updateMutation.mutate({
                        id: selectedMeeting.id,
                        updates: { agenda: editingAgenda },
                      })}
                      disabled={updateMutation.isPending}
                    >
                      Save Changes
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Safety Topic of the Day */}
          <Card className="bg-card border-border border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-primary">Safety Topic of the Day</CardTitle>
            </CardHeader>
            <CardContent>
              {editingAgenda ? (
                <Textarea
                  className="text-sm"
                  rows={2}
                  value={editingAgenda.safetyTopicOfDay}
                  onChange={(e) => setEditingAgenda({ ...editingAgenda, safetyTopicOfDay: e.target.value })}
                />
              ) : (
                <p className="text-sm text-white">{agenda.safetyTopicOfDay}</p>
              )}
            </CardContent>
          </Card>

          {/* Weather & Ops */}
          <div className="grid grid-cols-2 gap-4">
            {agenda.weatherConditions && (
              <Card className="bg-card border-border">
                <CardContent className="pt-4">
                  <span className="text-xs text-muted-foreground">Weather Conditions</span>
                  <p className="text-sm text-white mt-1">{agenda.weatherConditions}</p>
                </CardContent>
              </Card>
            )}
            {agenda.plannedOperations && agenda.plannedOperations.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="pt-4">
                  <span className="text-xs text-muted-foreground">Planned Operations</span>
                  <ul className="list-disc list-inside mt-1">
                    {agenda.plannedOperations.map((op, i) => (
                      <li key={i} className="text-sm text-white/80">{op}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Previous Shift Summary */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-primary">Previous Shift Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">Work Completed</span>
                <ul className="list-disc list-inside">
                  {agenda.previousShiftSummary.workCompleted.map((item, i) => (
                    <li key={i} className="text-sm text-white/80">{item}</li>
                  ))}
                </ul>
              </div>
              {agenda.previousShiftSummary.issues.length > 0 && (
                <div>
                  <span className="text-xs text-amber-400">Issues</span>
                  <ul className="list-disc list-inside">
                    {agenda.previousShiftSummary.issues.map((item, i) => (
                      <li key={i} className="text-sm text-amber-300/80">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {agenda.previousShiftSummary.nearMisses.length > 0 && (
                <div>
                  <span className="text-xs text-red-400">Near-Misses</span>
                  <ul className="list-disc list-inside">
                    {agenda.previousShiftSummary.nearMisses.map((item, i) => (
                      <li key={i} className="text-sm text-red-300/80">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Hazards */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-primary">Today's Hazards & Mitigation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {agenda.todaysHazards.map((h, idx) => (
                  <div key={idx} className="border border-border/50 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{h.hazard}</p>
                        <p className="text-xs text-emerald-400 mt-1">Mitigation: {h.mitigation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Supervisor Questions */}
          {agenda.supervisorQuestions && agenda.supervisorQuestions.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Discussion Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {agenda.supervisorQuestions.map((q, idx) => (
                    <div key={idx} className="border border-border/50 rounded-lg p-3">
                      <p className="text-sm text-white">{q.question}</p>
                      {q.answer && (
                        <p className="text-xs text-muted-foreground mt-1">Response: {q.answer}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Open Discussion */}
          {agenda.openDiscussionPoints && agenda.openDiscussionPoints.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Open Discussion Points</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1">
                  {agenda.openDiscussionPoints.map((point, idx) => (
                    <li key={idx} className="text-sm text-white/80">{point}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Complete Meeting */}
          {isSupervisor && selectedMeeting.status !== "completed" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Complete Meeting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Meeting Notes</Label>
                  <Textarea
                    placeholder="Capture any additional discussion notes..."
                    rows={3}
                    value={meetingNotes}
                    onChange={(e) => setMeetingNotes(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Digital Signature (type your full name)</Label>
                  <Input
                    placeholder="Type your full name to sign..."
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full btn-gold-metallic"
                  onClick={() => updateMutation.mutate({
                    id: selectedMeeting.id,
                    updates: {
                      status: "completed",
                      notes: meetingNotes || undefined,
                      digitalSignature: signature || undefined,
                    },
                  })}
                  disabled={updateMutation.isPending || !signature}
                >
                  {updateMutation.isPending ? "Completing..." : "Sign & Complete Meeting"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    );
  }

  // Meeting List View
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Safety Meetings</h2>
            <p className="text-sm text-muted-foreground">Morning safety meetings and toolbox talks</p>
          </div>
          {isSupervisor && (
            <Button
              size="sm"
              className="btn-gold-metallic"
              onClick={() => setShowGenerate(true)}
            >
              Generate Morning Meeting
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading meetings...</div>
        ) : meetings.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No safety meetings recorded yet.</p>
              {isSupervisor && (
                <p className="text-xs mt-2">Click "Generate Morning Meeting" to create one using AI.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <Card
                key={meeting.id}
                className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedMeeting(meeting)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{meeting.title}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{meeting.meetingDate}</span>
                        <span className="text-xs text-muted-foreground">
                          By: {meeting.conductedByName || "Unknown"}
                        </span>
                        {meeting.attendees && meeting.attendees.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {meeting.attendees.length} attendees
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {meeting.aiGenerated && (
                        <Badge className="bg-purple-500/20 text-purple-400 text-xs">AI</Badge>
                      )}
                      <Badge className={STATUS_COLORS[meeting.status] || "bg-gray-500/20"}>
                        {meeting.status.replace(/_/g, " ")}
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
