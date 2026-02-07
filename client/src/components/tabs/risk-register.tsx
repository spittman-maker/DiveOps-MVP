import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RiskItem {
  id: string;
  dayId: string;
  riskId: string;
  category: string;
  source?: string;
  description: string;
  affectedTask?: string;
  initialRiskLevel?: string;
  residualRisk?: string;
  status: "open" | "mitigated" | "closed";
  owner?: string;
  mitigation?: string;
  closureAuthority?: string;
  linkedDirectiveId?: string;
  createdAt: string;
  triggerEventId?: string;
}

export function RiskRegisterTab() {
  const { isSupervisor } = useAuth();
  const { activeDay } = useProject();
  const queryClient = useQueryClient();
  const [selectedRisk, setSelectedRisk] = useState<RiskItem | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editOwner, setEditOwner] = useState("");
  const [editMitigation, setEditMitigation] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editClosureAuthority, setEditClosureAuthority] = useState("");
  const [editResidualRisk, setEditResidualRisk] = useState("");

  const { activeProject } = useProject();

  const { data: risks = [], isLoading } = useQuery<RiskItem[]>({
    queryKey: ["risks", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/projects/${activeProject.id}/risks`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const updateRiskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, string> }) => {
      const res = await fetch(`/api/risks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update risk");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      setSelectedRisk(null);
    },
  });

  const selectRisk = (risk: RiskItem) => {
    setSelectedRisk(risk);
    setEditStatus(risk.status);
    setEditOwner(risk.owner || "");
    setEditMitigation(risk.mitigation || "");
    setEditReason("");
    setEditClosureAuthority(risk.closureAuthority || "");
    setEditResidualRisk(risk.residualRisk || "");
  };

  const handleSave = () => {
    if (!selectedRisk || !editReason) return;
    updateRiskMutation.mutate({
      id: selectedRisk.id,
      updates: {
        status: editStatus,
        owner: editOwner,
        mitigation: editMitigation,
        editReason,
        closureAuthority: editClosureAuthority,
        residualRisk: editResidualRisk,
      },
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-red-600";
      case "mitigated": return "bg-yellow-600";
      case "closed": return "bg-green-600";
      default: return "bg-gray-600";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "safety": return "border-red-500";
      case "environmental": return "border-green-500";
      case "operational": return "border-amber-500";
      default: return "border-gray-500";
    }
  };

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case "jha": return "JHA";
      case "field_observation": return "Field Observation";
      case "client_directive": return "Client Directive";
      case "equipment_issue": return "Equipment Issue";
      default: return source || "—";
    }
  };

  const getRiskLevelColor = (level?: string) => {
    switch (level) {
      case "high": return "text-red-400";
      case "med": return "text-yellow-400";
      case "low": return "text-green-400";
      default: return "text-navy-400";
    }
  };

  const openRisks = risks.filter(r => r.status === "open");
  const mitigatedRisks = risks.filter(r => r.status === "mitigated");
  const closedRisks = risks.filter(r => r.status === "closed");

  const renderRiskCard = (risk: RiskItem, opacity: string) => (
    <Card
      key={risk.id}
      data-testid={`risk-card-${risk.id}`}
      onClick={() => selectRisk(risk)}
      className={`bg-navy-800/${opacity} border-l-4 ${getCategoryColor(risk.category)} cursor-pointer hover:bg-navy-800/70`}
    >
      <CardContent className="py-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-navy-400">{risk.riskId}</span>
              <Badge className={getStatusColor(risk.status)} variant="outline">
                {risk.status.toUpperCase()}
              </Badge>
              {risk.initialRiskLevel && (
                <span className={`text-xs font-semibold uppercase ${getRiskLevelColor(risk.initialRiskLevel)}`}>
                  {risk.initialRiskLevel} RISK
                </span>
              )}
              {risk.source && (
                <span className="text-xs text-navy-500">{getSourceLabel(risk.source)}</span>
              )}
              {risk.linkedDirectiveId && (
                <span className="text-xs text-blue-400 font-mono">{risk.linkedDirectiveId}</span>
              )}
            </div>
            <p className={`text-sm ${risk.status === "closed" ? "text-navy-400 line-through" : "text-white"}`}>
              {risk.description}
            </p>
            {risk.affectedTask && (
              <p className="text-xs text-navy-400 mt-1">Task: {risk.affectedTask}</p>
            )}
            {risk.mitigation && risk.status !== "open" && (
              <p className="text-xs text-navy-400 mt-1">Controls: {risk.mitigation}</p>
            )}
            {risk.residualRisk && (
              <p className="text-xs text-navy-400 mt-0.5">Residual: {risk.residualRisk}</p>
            )}
          </div>
          {risk.owner && (
            <span className="text-xs text-navy-400 ml-2">{risk.owner}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full flex">
      <div className="flex-1 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white" data-testid="text-risk-register-title">Risk Register</h2>
            <p className="text-sm text-navy-400">
              Rolling cumulative register — risks persist across days
            </p>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-red-600" data-testid="badge-open-risks">{openRisks.length} Open</Badge>
            <Badge className="bg-yellow-600" data-testid="badge-mitigated-risks">{mitigatedRisks.length} Mitigated</Badge>
            <Badge className="bg-green-600" data-testid="badge-closed-risks">{closedRisks.length} Closed</Badge>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {openRisks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-400 mb-2 uppercase tracking-wide">
                  Open Risks
                </h3>
                <div className="space-y-2">
                  {openRisks.map((risk) => renderRiskCard(risk, "50"))}
                </div>
              </div>
            )}

            {mitigatedRisks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-400 mb-2 uppercase tracking-wide">
                  Mitigated Risks
                </h3>
                <div className="space-y-2">
                  {mitigatedRisks.map((risk) => renderRiskCard(risk, "30"))}
                </div>
              </div>
            )}

            {closedRisks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-green-400 mb-2 uppercase tracking-wide">
                  Closed Risks
                </h3>
                <div className="space-y-2">
                  {closedRisks.map((risk) => renderRiskCard(risk, "20"))}
                </div>
              </div>
            )}

            {risks.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <p className="text-navy-400">No risks identified</p>
                <p className="text-sm text-navy-500 mt-1">
                  Risks are automatically created from client directives, condition changes, deviations, and equipment issues
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {selectedRisk && isSupervisor && (
        <div className="w-96 border-l border-navy-600 bg-navy-850 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Edit Risk</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedRisk(null)}
              className="text-navy-400"
              data-testid="button-close-risk-edit"
            >
              Close
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-4">
              <div>
                <Label className="text-navy-400">Risk ID</Label>
                <p className="text-white font-mono">{selectedRisk.riskId}</p>
              </div>

              <div>
                <Label className="text-navy-400">Description</Label>
                <p className="text-white text-sm">{selectedRisk.description}</p>
              </div>

              {selectedRisk.source && (
                <div>
                  <Label className="text-navy-400">Source</Label>
                  <p className="text-white text-sm">{getSourceLabel(selectedRisk.source)}</p>
                </div>
              )}

              {selectedRisk.affectedTask && (
                <div>
                  <Label className="text-navy-400">Affected Task</Label>
                  <p className="text-white text-sm">{selectedRisk.affectedTask}</p>
                </div>
              )}

              {selectedRisk.initialRiskLevel && (
                <div>
                  <Label className="text-navy-400">Initial Risk Level</Label>
                  <p className={`text-sm font-semibold uppercase ${getRiskLevelColor(selectedRisk.initialRiskLevel)}`}>
                    {selectedRisk.initialRiskLevel}
                  </p>
                </div>
              )}

              {selectedRisk.linkedDirectiveId && (
                <div>
                  <Label className="text-navy-400">Linked Directive</Label>
                  <p className="text-blue-400 text-sm font-mono">{selectedRisk.linkedDirectiveId}</p>
                </div>
              )}

              <div>
                <Label className="text-navy-400">Owner</Label>
                <Input
                  data-testid="input-risk-owner"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  className="bg-navy-900 border-navy-600 text-white"
                  placeholder="Assign owner"
                />
              </div>

              <div>
                <Label className="text-navy-400">Controls / Mitigation</Label>
                <Textarea
                  data-testid="input-risk-mitigation"
                  value={editMitigation}
                  onChange={(e) => setEditMitigation(e.target.value)}
                  className="bg-navy-900 border-navy-600 text-white"
                  placeholder="Describe controls in place"
                />
              </div>

              <div>
                <Label className="text-navy-400">Residual Risk</Label>
                <Input
                  data-testid="input-residual-risk"
                  value={editResidualRisk}
                  onChange={(e) => setEditResidualRisk(e.target.value)}
                  className="bg-navy-900 border-navy-600 text-white"
                  placeholder="Residual risk after controls"
                />
              </div>

              <div>
                <Label className="text-navy-400">Status</Label>
                <div className="flex gap-2 mt-1">
                  {["open", "mitigated", "closed"].map((status) => (
                    <Button
                      key={status}
                      data-testid={`button-status-${status}`}
                      variant={editStatus === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditStatus(status)}
                      className={editStatus === status ? getStatusColor(status) : "border-navy-500"}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {editStatus === "closed" && (
                <div>
                  <Label className="text-navy-400">Closure Authority</Label>
                  <Input
                    data-testid="input-closure-authority"
                    value={editClosureAuthority}
                    onChange={(e) => setEditClosureAuthority(e.target.value)}
                    className="bg-navy-900 border-navy-600 text-white"
                    placeholder="Name / role authorizing closure"
                  />
                </div>
              )}

              <div>
                <Label className="text-navy-400">Edit Reason (required)</Label>
                <Textarea
                  data-testid="input-edit-reason"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="bg-navy-900 border-navy-600 text-white"
                  placeholder="Document why this change is being made"
                />
              </div>

              <Button
                data-testid="button-save-risk"
                className="w-full btn-gold-metallic hover:btn-gold-metallic"
                onClick={handleSave}
                disabled={!editReason || updateRiskMutation.isPending}
              >
                {updateRiskMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
