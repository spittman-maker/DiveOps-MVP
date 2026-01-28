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

interface RiskItem {
  id: string;
  dayId: string;
  riskId: string;
  category: string;
  description: string;
  status: "open" | "mitigated" | "closed";
  owner?: string;
  mitigation?: string;
  createdAt: string;
  triggerEventId?: string;
}

export function RiskRegisterTab() {
  const { isSupervisor } = useAuth();
  const { activeDay } = useProject();
  const queryClient = useQueryClient();
  const [selectedRisk, setSelectedRisk] = useState<RiskItem | null>(null);

  const { data: risks = [], isLoading } = useQuery<RiskItem[]>({
    queryKey: ["risks", activeDay?.id],
    queryFn: async () => {
      if (!activeDay?.id) return [];
      const res = await fetch(`/api/days/${activeDay.id}/risks`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeDay?.id,
  });

  const updateRiskMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RiskItem> & { editReason: string } }) => {
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
      case "operational": return "border-blue-500";
      default: return "border-gray-500";
    }
  };

  const openRisks = risks.filter(r => r.status === "open");
  const mitigatedRisks = risks.filter(r => r.status === "mitigated");
  const closedRisks = risks.filter(r => r.status === "closed");

  return (
    <div className="h-full flex">
      <div className="flex-1 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Risk Register</h2>
            <p className="text-sm text-navy-400">
              Track and manage identified risks
            </p>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-red-600">{openRisks.length} Open</Badge>
            <Badge className="bg-yellow-600">{mitigatedRisks.length} Mitigated</Badge>
            <Badge className="bg-green-600">{closedRisks.length} Closed</Badge>
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
                  {openRisks.map((risk) => (
                    <Card
                      key={risk.id}
                      data-testid={`risk-card-${risk.id}`}
                      onClick={() => setSelectedRisk(risk)}
                      className={`bg-navy-800/50 border-l-4 ${getCategoryColor(risk.category)} cursor-pointer hover:bg-navy-800/70`}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-navy-400">{risk.riskId}</span>
                              <Badge className={getStatusColor(risk.status)} variant="outline">
                                {risk.status.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-sm text-white">{risk.description}</p>
                          </div>
                          {risk.owner && (
                            <span className="text-xs text-navy-400">{risk.owner}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {mitigatedRisks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-400 mb-2 uppercase tracking-wide">
                  Mitigated Risks
                </h3>
                <div className="space-y-2">
                  {mitigatedRisks.map((risk) => (
                    <Card
                      key={risk.id}
                      data-testid={`risk-card-${risk.id}`}
                      onClick={() => setSelectedRisk(risk)}
                      className={`bg-navy-800/30 border-l-4 ${getCategoryColor(risk.category)} cursor-pointer hover:bg-navy-800/50`}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-navy-400">{risk.riskId}</span>
                          <Badge className={getStatusColor(risk.status)} variant="outline">
                            {risk.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-navy-200">{risk.description}</p>
                        {risk.mitigation && (
                          <p className="text-xs text-navy-400 mt-1">
                            Mitigation: {risk.mitigation}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {closedRisks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-green-400 mb-2 uppercase tracking-wide">
                  Closed Risks
                </h3>
                <div className="space-y-2">
                  {closedRisks.map((risk) => (
                    <Card
                      key={risk.id}
                      data-testid={`risk-card-${risk.id}`}
                      onClick={() => setSelectedRisk(risk)}
                      className="bg-navy-800/20 border-navy-700 cursor-pointer hover:bg-navy-800/30"
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-navy-500">{risk.riskId}</span>
                          <Badge className={getStatusColor(risk.status)} variant="outline">
                            CLOSED
                          </Badge>
                        </div>
                        <p className="text-sm text-navy-400 line-through">{risk.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {risks.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <p className="text-navy-400">No risks identified</p>
                <p className="text-sm text-navy-500 mt-1">
                  Risks are automatically created from safety-related log entries
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
            >
              Close
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-navy-400">Risk ID</Label>
              <p className="text-white font-mono">{selectedRisk.riskId}</p>
            </div>

            <div>
              <Label className="text-navy-400">Description</Label>
              <p className="text-white text-sm">{selectedRisk.description}</p>
            </div>

            <div>
              <Label className="text-navy-400">Owner</Label>
              <Input
                data-testid="input-risk-owner"
                defaultValue={selectedRisk.owner || ""}
                className="bg-navy-900 border-navy-600 text-white"
                placeholder="Assign owner"
              />
            </div>

            <div>
              <Label className="text-navy-400">Mitigation</Label>
              <Textarea
                data-testid="input-risk-mitigation"
                defaultValue={selectedRisk.mitigation || ""}
                className="bg-navy-900 border-navy-600 text-white"
                placeholder="Describe mitigation measures"
              />
            </div>

            <div>
              <Label className="text-navy-400">Status</Label>
              <div className="flex gap-2 mt-1">
                {["open", "mitigated", "closed"].map((status) => (
                  <Button
                    key={status}
                    data-testid={`button-status-${status}`}
                    variant={selectedRisk.status === status ? "default" : "outline"}
                    size="sm"
                    className={selectedRisk.status === status ? getStatusColor(status) : "border-navy-500"}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              data-testid="button-save-risk"
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
