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

interface JhaHazard {
  hazard: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  controls: string[];
  responsibleParty: string;
  ppe?: string[];
}

interface JhaContent {
  jobDescription: string;
  location: string;
  date: string;
  weatherConditions?: string;
  diveDepth?: number;
  equipmentInUse?: string[];
  plannedOperations?: string[];
  hazards: JhaHazard[];
  emergencyProcedures?: string[];
  additionalNotes?: string;
  historicalIncidentsSummary?: string;
  aiModel?: string;
}

interface JhaRecord {
  id: string;
  projectId: string;
  dayId: string | null;
  title: string;
  status: string;
  content: JhaContent;
  aiGenerated: boolean;
  generatedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  digitalSignature: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  pending_review: "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  superseded: "bg-red-500/20 text-red-400",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-amber-500/20 text-amber-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

export function SafetyJha() {
  const { activeProject, activeDay } = useProject();
  const { isSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const [selectedJha, setSelectedJha] = useState<JhaRecord | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editingContent, setEditingContent] = useState<JhaContent | null>(null);

  // AI generation form state
  const [genOps, setGenOps] = useState("");
  const [genWeather, setGenWeather] = useState("");
  const [genDepth, setGenDepth] = useState("");
  const [genEquipment, setGenEquipment] = useState("");
  const [genLocation, setGenLocation] = useState("");

  const { data: jhas = [], isLoading } = useQuery<JhaRecord[]>({
    queryKey: ["safety-jha", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/safety/${activeProject.id}/jha`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error("No project");
      const res = await fetch("/api/safety/jha/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: activeProject.id,
          dayId: activeDay?.id,
          plannedOperations: genOps ? genOps.split("\n").filter(Boolean) : [],
          weatherConditions: genWeather || undefined,
          diveDepth: genDepth ? parseFloat(genDepth) : undefined,
          equipmentInUse: genEquipment ? genEquipment.split(",").map(s => s.trim()).filter(Boolean) : [],
          location: genLocation || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI generation failed" }));
        throw new Error(err.error || "AI generation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["safety-jha"] });
      queryClient.invalidateQueries({ queryKey: ["safety-metrics"] });
      setShowGenerate(false);
      setSelectedJha(data);
      setGenOps("");
      setGenWeather("");
      setGenDepth("");
      setGenEquipment("");
      setGenLocation("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, content, signature }: { id: string; status?: string; content?: any; signature?: string }) => {
      const body: any = {};
      if (status) body.status = status;
      if (content) body.content = content;
      if (signature) body.digitalSignature = signature;
      const res = await fetch(`/api/safety/jha/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update JHA");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["safety-jha"] });
      setSelectedJha(data);
      setEditingContent(null);
    },
  });

  // AI Generation Form
  if (showGenerate) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Generate AI JHA</h2>
              <p className="text-sm text-muted-foreground">
                Provide context and AI will generate a comprehensive Job Hazard Analysis
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowGenerate(false)}>Cancel</Button>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-xs">Planned Operations (one per line)</Label>
                <Textarea
                  placeholder="e.g., Underwater hull inspection&#10;Cathodic protection survey&#10;Debris removal"
                  rows={4}
                  value={genOps}
                  onChange={(e) => setGenOps(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Current Weather Conditions</Label>
                  <Input
                    placeholder="e.g., Clear, 75°F, winds 10kt"
                    value={genWeather}
                    onChange={(e) => setGenWeather(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Dive Depth (feet)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 60"
                    value={genDepth}
                    onChange={(e) => setGenDepth(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Equipment in Use (comma-separated)</Label>
                <Input
                  placeholder="e.g., KM-37, Bailout bottle, Pneumo hose"
                  value={genEquipment}
                  onChange={(e) => setGenEquipment(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Input
                  placeholder="e.g., Pier 7, Norfolk Naval Shipyard"
                  value={genLocation}
                  onChange={(e) => setGenLocation(e.target.value)}
                />
              </div>
              <Button
                className="w-full btn-gold-metallic"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating with AI..." : "Generate JHA with AI"}
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

  // JHA Detail View
  if (selectedJha) {
    const content = editingContent || selectedJha.content;
    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { setSelectedJha(null); setEditingContent(null); }}>
                Back
              </Button>
              <div>
                <h2 className="text-lg font-bold text-white">{selectedJha.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={STATUS_COLORS[selectedJha.status] || "bg-gray-500/20"}>
                    {selectedJha.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  {selectedJha.aiGenerated && (
                    <Badge className="bg-purple-500/20 text-purple-400">AI Generated</Badge>
                  )}
                </div>
              </div>
            </div>
            {isSupervisor && (
              <div className="flex gap-2">
                {selectedJha.status === "pending_review" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => updateStatusMutation.mutate({ id: selectedJha.id, status: "approved" })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Approve JHA
                  </Button>
                )}
                {selectedJha.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate({ id: selectedJha.id, status: "pending_review" })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Submit for Review
                  </Button>
                )}
                {!editingContent && (selectedJha.status === "draft" || selectedJha.status === "pending_review") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingContent({ ...selectedJha.content })}
                  >
                    Edit
                  </Button>
                )}
                {editingContent && (
                  <Button
                    size="sm"
                    className="btn-gold-metallic"
                    onClick={() => updateStatusMutation.mutate({ id: selectedJha.id, content: editingContent })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Save Changes
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* JHA Content */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">Job Description</span>
                  {editingContent ? (
                    <Textarea
                      className="text-sm mt-1"
                      rows={3}
                      value={editingContent.jobDescription}
                      onChange={(e) => setEditingContent({ ...editingContent, jobDescription: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm text-white">{content.jobDescription}</p>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Location</span>
                  <p className="text-sm text-white">{content.location}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Date</span>
                  <p className="text-sm text-white">{content.date}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">Weather</span>
                  <p className="text-sm text-white">{content.weatherConditions || "Not specified"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Dive Depth</span>
                  <p className="text-sm text-white">{content.diveDepth ? `${content.diveDepth} ft` : "N/A"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Equipment</span>
                  <p className="text-sm text-white">{content.equipmentInUse?.join(", ") || "Not specified"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hazards Table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-primary">Identified Hazards</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {content.hazards.map((hazard, idx) => (
                  <div key={idx} className="border border-border/50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-white">{hazard.hazard}</span>
                      <Badge className={RISK_COLORS[hazard.riskLevel] || "bg-gray-500/20"}>
                        {hazard.riskLevel.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <span className="text-xs text-muted-foreground">Controls:</span>
                        <ul className="list-disc list-inside ml-2">
                          {hazard.controls.map((ctrl, i) => (
                            <li key={i} className="text-xs text-white/80">{ctrl}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground">Responsible: </span>
                          <span className="text-xs text-white">{hazard.responsibleParty}</span>
                        </div>
                        {hazard.ppe && hazard.ppe.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground">PPE: </span>
                            <span className="text-xs text-white">{hazard.ppe.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Emergency Procedures */}
          {content.emergencyProcedures && content.emergencyProcedures.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Emergency Procedures</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-1">
                  {content.emergencyProcedures.map((proc, idx) => (
                    <li key={idx} className="text-sm text-white/80">{proc}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Additional Notes */}
          {content.additionalNotes && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">Additional Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/80">{content.additionalNotes}</p>
              </CardContent>
            </Card>
          )}

          {/* AI Model Info */}
          {selectedJha.aiGenerated && content.aiModel && (
            <p className="text-xs text-muted-foreground text-center">
              Generated by {content.aiModel} | Version {selectedJha.version}
            </p>
          )}
        </div>
      </ScrollArea>
    );
  }

  // JHA List View
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Job Hazard Analysis (JHA)</h2>
            <p className="text-sm text-muted-foreground">AI-generated and manual JHA records</p>
          </div>
          {isSupervisor && (
            <Button
              size="sm"
              className="btn-gold-metallic"
              onClick={() => setShowGenerate(true)}
            >
              Generate AI JHA
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading JHAs...</div>
        ) : jhas.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No JHA records yet.</p>
              {isSupervisor && (
                <p className="text-xs mt-2">Click "Generate AI JHA" to create one using AI.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jhas.map((jha) => (
              <Card
                key={jha.id}
                className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedJha(jha)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{jha.title}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(jha.createdAt).toLocaleDateString()}
                        </span>
                        {jha.content.diveDepth && (
                          <span className="text-xs text-muted-foreground">
                            Depth: {jha.content.diveDepth}ft
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {jha.content.hazards.length} hazards identified
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {jha.aiGenerated && (
                        <Badge className="bg-purple-500/20 text-purple-400 text-xs">AI</Badge>
                      )}
                      <Badge className={STATUS_COLORS[jha.status] || "bg-gray-500/20"}>
                        {jha.status.replace(/_/g, " ")}
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
