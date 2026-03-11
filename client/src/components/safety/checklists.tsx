import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ChecklistItem {
  id: string;
  checklistId: string;
  sortOrder: number;
  category: string | null;
  label: string;
  description: string | null;
  itemType: string;
  isRequired: boolean;
  equipmentCategory: string | null;
}

interface Checklist {
  id: string;
  projectId: string;
  checklistType: string;
  title: string;
  description: string | null;
  roleScope: string;
  isActive: boolean;
  items?: ChecklistItem[];
}

interface ChecklistCompletion {
  id: string;
  checklistId: string;
  projectId: string;
  completedBy: string;
  completedByName: string | null;
  status: string;
  responses: any[];
  digitalSignature: string | null;
  signedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ResponseEntry {
  itemId: string;
  label: string;
  value: string | boolean | number;
  status?: "pass" | "fail" | "flag";
  notes?: string;
}

const TYPE_LABELS: Record<string, string> = {
  pre_dive: "Pre-Dive",
  post_dive: "Post-Dive",
  equipment: "Equipment",
};

const TYPE_COLORS: Record<string, string> = {
  pre_dive: "bg-blue-500/20 text-blue-400",
  post_dive: "bg-emerald-500/20 text-emerald-400",
  equipment: "bg-amber-500/20 text-amber-400",
};

export function SafetyChecklists() {
  const { activeProject, activeDay } = useProject();
  const { isSupervisor, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [fillMode, setFillMode] = useState(false);
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({});
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showHistory, setShowHistory] = useState(false);

  const { data: checklists = [], isLoading } = useQuery<Checklist[]>({
    queryKey: ["safety-checklists", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/safety/${activeProject.id}/checklists`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const { data: completions = [] } = useQuery<ChecklistCompletion[]>({
    queryKey: ["safety-completions", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/safety/${activeProject.id}/completions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/safety/${activeProject!.id}/seed-checklists`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to seed checklists");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["safety-checklists"] });
    },
  });

  const loadChecklistDetail = async (id: string) => {
    const res = await fetch(`/api/safety/checklists/${id}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setSelectedChecklist(data);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChecklist || !activeProject) throw new Error("No checklist selected");
      const responseArray = Object.values(responses);
      const res = await fetch("/api/safety/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          checklistId: selectedChecklist.id,
          projectId: activeProject.id,
          dayId: activeDay?.id,
          responses: responseArray,
          notes: notes || undefined,
          digitalSignature: signature || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit checklist");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["safety-completions"] });
      queryClient.invalidateQueries({ queryKey: ["safety-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      setFillMode(false);
      setResponses({});
      setSignature("");
      setNotes("");
      setSelectedChecklist(null);
      toast({
        title: data?.savedToLibrary ? "Checklist saved to Library" : "Checklist submitted",
        description: data?.savedToLibrary
          ? "The completed checklist is now available in the Library tab."
          : "Checklist submitted successfully.",
      });
    },
  });

  const handleItemResponse = (item: ChecklistItem, value: string | boolean | number, status?: "pass" | "fail" | "flag") => {
    setResponses(prev => ({
      ...prev,
      [item.id]: {
        itemId: item.id,
        label: item.label,
        value,
        status,
        notes: prev[item.id]?.notes,
      },
    }));
  };

  const handleItemNotes = (itemId: string, itemNotes: string) => {
    setResponses(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        notes: itemNotes,
      },
    }));
  };

  const filteredChecklists = filterType === "all"
    ? checklists
    : checklists.filter(c => c.checklistType === filterType);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Loading checklists...</div>;
  }

  // Fill mode: show checklist items to complete
  if (fillMode && selectedChecklist?.items) {
    const items = selectedChecklist.items;
    const grouped = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
      const cat = item.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});

    return (
      <ScrollArea className="h-full">
        <div className="p-4 max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{selectedChecklist.title}</h2>
              <p className="text-sm text-muted-foreground">{selectedChecklist.description}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setFillMode(false); setResponses({}); }}>
              Cancel
            </Button>
          </div>

          {Object.entries(grouped).map(([category, catItems]) => (
            <Card key={category} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary">{category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {catItems.map((item) => (
                  <div key={item.id} className="border border-border/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <span className="text-sm text-white">{item.label}</span>
                        {item.isRequired && <span className="text-red-400 ml-1">*</span>}
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Render input based on item type */}
                    {item.itemType === "checkbox" && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-border"
                          checked={responses[item.id]?.value === true}
                          onChange={(e) => handleItemResponse(item, e.target.checked)}
                        />
                        <span className="text-xs text-muted-foreground">Confirmed</span>
                      </label>
                    )}

                    {item.itemType === "pass_fail_flag" && (
                      <div className="flex gap-2">
                        {(["pass", "fail", "flag"] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => handleItemResponse(item, status, status)}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                              responses[item.id]?.status === status
                                ? status === "pass" ? "bg-emerald-600 text-white"
                                  : status === "fail" ? "bg-red-600 text-white"
                                  : "bg-amber-600 text-white"
                                : "bg-secondary text-muted-foreground hover:text-white"
                            }`}
                          >
                            {status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "FLAG"}
                          </button>
                        ))}
                      </div>
                    )}

                    {item.itemType === "text_input" && (
                      <Textarea
                        placeholder="Enter details..."
                        className="text-sm"
                        rows={2}
                        value={typeof responses[item.id]?.value === "string" ? responses[item.id].value as string : ""}
                        onChange={(e) => handleItemResponse(item, e.target.value)}
                      />
                    )}

                    {item.itemType === "numeric_input" && (
                      <Input
                        type="number"
                        placeholder="Enter value..."
                        className="text-sm w-32"
                        value={typeof responses[item.id]?.value === "number" ? responses[item.id].value as number : ""}
                        onChange={(e) => handleItemResponse(item, parseFloat(e.target.value) || 0)}
                      />
                    )}

                    {item.itemType === "gas_analysis" && (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          placeholder="O2 %"
                          className="text-sm w-24"
                          step="0.1"
                          value={typeof responses[item.id]?.value === "string" ? responses[item.id].value as string : ""}
                          onChange={(e) => handleItemResponse(item, e.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">% O2</span>
                        <div className="flex gap-1 ml-2">
                          {(["pass", "fail"] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => handleItemResponse(item, String(responses[item.id]?.value || ""), status)}
                              className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                                responses[item.id]?.status === status
                                  ? status === "pass" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                                  : "bg-secondary text-muted-foreground hover:text-white"
                              }`}
                            >
                              {status.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes for any item */}
                    <Input
                      placeholder="Notes (optional)..."
                      className="text-xs"
                      value={responses[item.id]?.notes || ""}
                      onChange={(e) => handleItemNotes(item.id, e.target.value)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Notes and Signature */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-primary">Completion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Additional Notes</Label>
                <Textarea
                  placeholder="Any additional notes..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || !signature}
              >
                {submitMutation.isPending ? "Submitting..." : "Sign & Submit Checklist"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Safety Checklists</h2>
            <p className="text-sm text-muted-foreground">Pre-dive, post-dive, and equipment inspection checklists</p>
          </div>
          <div className="flex gap-2">
            {checklists.length === 0 && isSupervisor && (
              <Button
                size="sm"
                className="btn-gold-metallic"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending ? "Seeding..." : "Load Default Checklists"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? "Show Templates" : "View History"}
            </Button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {["all", "pre_dive", "post_dive", "equipment"].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                filterType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-white"
              }`}
            >
              {type === "all" ? "All" : TYPE_LABELS[type] || type}
            </button>
          ))}
        </div>

        {showHistory ? (
          /* Completion History */
          <div className="space-y-3">
            {completions.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No completed checklists yet
                </CardContent>
              </Card>
            ) : (
              completions.map((completion) => (
                <Card key={completion.id} className="bg-card border-border">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-white font-medium">
                          {completion.completedByName || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(completion.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <Badge className={
                        completion.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                        completion.status === "completed_with_issues" ? "bg-amber-500/20 text-amber-400" :
                        "bg-blue-500/20 text-blue-400"
                      }>
                        {completion.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {completion.digitalSignature && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Signed by: {completion.digitalSignature}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* Checklist Templates */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChecklists.length === 0 ? (
              <Card className="bg-card border-border col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  {checklists.length === 0
                    ? "No checklists configured. Use 'Load Default Checklists' to get started."
                    : "No checklists match the selected filter."}
                </CardContent>
              </Card>
            ) : (
              filteredChecklists.map((checklist) => (
                <Card key={checklist.id} className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={async () => {
                    await loadChecklistDetail(checklist.id);
                  }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-white">{checklist.title}</CardTitle>
                      <Badge className={TYPE_COLORS[checklist.checklistType] || "bg-gray-500/20 text-gray-400"}>
                        {TYPE_LABELS[checklist.checklistType] || checklist.checklistType}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">{checklist.description || "No description"}</p>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        Role: {checklist.roleScope}
                      </Badge>
                      <Button
                        size="sm"
                        className="btn-gold-metallic text-xs"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await loadChecklistDetail(checklist.id);
                          setFillMode(true);
                        }}
                      >
                        Start Checklist
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
