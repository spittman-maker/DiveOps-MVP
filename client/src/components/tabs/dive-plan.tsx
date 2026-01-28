import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface DivePlan {
  id: string;
  projectId: string;
  dayId?: string;
  status: "Draft" | "Active" | "Closed";
  planVersion: number;
  planJson: {
    dives?: Array<{
      diveNumber: number;
      diver: string;
      standby: string;
      depth: number;
      task: string;
    }>;
    safetyBriefing?: string;
    emergencyContacts?: string[];
    decompSchedule?: string;
    equipment?: string[];
  };
}

export function DivePlanTab() {
  const { isSupervisor, isAdmin } = useAuth();
  const { activeProject, activeDay } = useProject();
  const queryClient = useQueryClient();
  
  const [interviewStep, setInterviewStep] = useState(0);
  const [planDraft, setPlanDraft] = useState({
    divers: "",
    maxDepth: "",
    task: "",
    equipment: "",
    notes: "",
  });

  const { data: plans = [] } = useQuery<DivePlan[]>({
    queryKey: ["dive-plans", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/projects/${activeProject.id}/dive-plans`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const activePlan = plans.find(p => p.status === "Active") || plans[0];

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject?.id) throw new Error("No active project");
      const planJson = {
        dives: planDraft.divers.split(",").map((d, i) => ({
          diveNumber: i + 1,
          diver: d.trim(),
          standby: "",
          depth: parseInt(planDraft.maxDepth) || 0,
          task: planDraft.task,
        })),
        equipment: planDraft.equipment.split(",").map(e => e.trim()),
        safetyBriefing: planDraft.notes,
      };

      const res = await fetch(`/api/projects/${activeProject.id}/dive-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planJson, dayId: activeDay?.id }),
      });
      if (!res.ok) throw new Error("Failed to create plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dive-plans"] });
      setInterviewStep(0);
      setPlanDraft({ divers: "", maxDepth: "", task: "", equipment: "", notes: "" });
    },
  });

  const INTERVIEW_QUESTIONS = [
    { field: "divers", question: "Who are the divers for today? (comma-separated initials)", placeholder: "JS, MJ, KD" },
    { field: "maxDepth", question: "What is the maximum planned depth (fsw)?", placeholder: "40" },
    { field: "task", question: "What is the primary dive task?", placeholder: "Pier inspection - visual survey of pilings" },
    { field: "equipment", question: "What equipment is required? (comma-separated)", placeholder: "SCUBA, lights, cameras, measuring tape" },
    { field: "notes", question: "Any additional notes or safety considerations?", placeholder: "Visibility expected to be low. Buddy pairs required." },
  ];

  const currentQuestion = INTERVIEW_QUESTIONS[interviewStep];

  return (
    <div className="h-full flex">
      <div className="w-1/2 border-r border-navy-600 flex flex-col">
        <div className="bg-navy-800 p-3 border-b border-navy-600">
          <h2 className="text-sm font-semibold text-white">Plan Interview</h2>
          <p className="text-xs text-navy-400">Answer questions to build your dive plan</p>
        </div>

        {isSupervisor && (
          <ScrollArea className="flex-1 p-4">
            {interviewStep < INTERVIEW_QUESTIONS.length ? (
              <div className="space-y-4">
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-600">
                  <p className="text-sm text-navy-200 mb-3">
                    {currentQuestion.question}
                  </p>
                  <Input
                    data-testid={`input-plan-${currentQuestion.field}`}
                    value={planDraft[currentQuestion.field as keyof typeof planDraft]}
                    onChange={(e) =>
                      setPlanDraft((prev) => ({
                        ...prev,
                        [currentQuestion.field]: e.target.value,
                      }))
                    }
                    placeholder={currentQuestion.placeholder}
                    className="bg-navy-900 border-navy-600 text-white"
                  />
                </div>

                <div className="flex gap-2">
                  {interviewStep > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => setInterviewStep((s) => s - 1)}
                      className="border-navy-500"
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    data-testid="button-next-question"
                    onClick={() => setInterviewStep((s) => s + 1)}
                    disabled={!planDraft[currentQuestion.field as keyof typeof planDraft]}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {interviewStep === INTERVIEW_QUESTIONS.length - 1 ? "Complete" : "Next"}
                  </Button>
                </div>

                <div className="flex gap-1 mt-4">
                  {INTERVIEW_QUESTIONS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded ${
                        i <= interviewStep ? "bg-blue-500" : "bg-navy-700"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="bg-green-900/20 border-green-600">
                  <CardContent className="pt-4">
                    <p className="text-green-400 text-center">
                      Interview complete! Review your plan on the right and save when ready.
                    </p>
                  </CardContent>
                </Card>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setInterviewStep(0)}
                    className="border-navy-500"
                  >
                    Start Over
                  </Button>
                  <Button
                    data-testid="button-save-plan"
                    onClick={() => createPlanMutation.mutate()}
                    disabled={createPlanMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Save Plan
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        )}

        {!isSupervisor && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-navy-400">Only supervisors can create dive plans</p>
          </div>
        )}
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Live Plan Canvas</h2>
            <p className="text-xs text-navy-400">Current dive plan preview</p>
          </div>
          {activePlan && (
            <Badge className={activePlan.status === "Closed" ? "bg-red-600" : "bg-green-600"}>
              {activePlan.status} v{activePlan.planVersion}
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          {(activePlan?.planJson?.dives || Object.keys(planDraft).some(k => planDraft[k as keyof typeof planDraft])) ? (
            <div className="space-y-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">Planned Dives</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(activePlan?.planJson?.dives || planDraft.divers.split(",").filter(Boolean).map((d, i) => ({
                      diveNumber: i + 1,
                      diver: d.trim(),
                      depth: parseInt(planDraft.maxDepth) || 0,
                      task: planDraft.task,
                    }))).map((dive: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-navy-700 last:border-0">
                        <div>
                          <span className="text-white font-mono">Dive #{dive.diveNumber}</span>
                          <span className="text-navy-400 ml-2">- {dive.diver}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-blue-400">{dive.depth} fsw</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {(activePlan?.planJson?.safetyBriefing || planDraft.notes) && (
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-base">Safety Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-navy-200">
                      {activePlan?.planJson?.safetyBriefing || planDraft.notes}
                    </p>
                  </CardContent>
                </Card>
              )}

              {(activePlan?.planJson?.equipment || planDraft.equipment) && (
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-base">Equipment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(activePlan?.planJson?.equipment || planDraft.equipment.split(",").filter(Boolean).map(e => e.trim())).map((item: string, i: number) => (
                        <Badge key={i} variant="outline" className="border-navy-500 text-navy-300">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-navy-400">No active dive plan</p>
              <p className="text-sm text-navy-500 mt-1">
                Complete the interview to create a plan
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
