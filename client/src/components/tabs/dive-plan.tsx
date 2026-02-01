import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, MapPin, Users, ClipboardList, Anchor, FileText, Download, Send, CheckCircle, History, ChevronDown, ChevronRight } from "lucide-react";
import type { DivePlan, Station, StationCrew, ProjectDivePlan, ProjectDivePlanData } from "@shared/schema";

interface StationFormData {
  stationId: string;
  plannedDives: number;
  plannedTasks: string[];
  targetDepthFsw: number | null;
  plannedBottomTimeMin: number | null;
  crew: StationCrew;
  notes: string;
}

const emptyStation: StationFormData = {
  stationId: "",
  plannedDives: 1,
  plannedTasks: [],
  targetDepthFsw: null,
  plannedBottomTimeMin: null,
  crew: { supervisor: "", divers: [] },
  notes: "",
};

export function DivePlanTab() {
  const { isSupervisor, isAdmin, user } = useAuth();
  const { activeProject, activeDay } = useProject();
  const queryClient = useQueryClient();
  
  const [editingStation, setEditingStation] = useState<StationFormData | null>(null);
  const [newTask, setNewTask] = useState("");
  const [newDiver, setNewDiver] = useState("");
  const [planNotes, setPlanNotes] = useState("");

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

  const activePlan = plans.find(p => p.status === "Active") || plans.find(p => p.status === "Draft") || plans[0];

  const { data: stations = [] } = useQuery<Station[]>({
    queryKey: ["stations", activePlan?.id],
    queryFn: async () => {
      if (!activePlan?.id) return [];
      const res = await fetch(`/api/dive-plans/${activePlan.id}/stations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activePlan?.id,
  });

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject?.id) throw new Error("No active project");
      const res = await fetch(`/api/projects/${activeProject.id}/dive-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          planJson: { notes: planNotes },
          dayId: activeDay?.id 
        }),
      });
      if (!res.ok) throw new Error("Failed to create plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dive-plans"] });
      setPlanNotes("");
    },
  });

  const createStationMutation = useMutation({
    mutationFn: async (station: StationFormData) => {
      if (!activePlan?.id) throw new Error("No active plan");
      const res = await fetch(`/api/dive-plans/${activePlan.id}/stations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(station),
      });
      if (!res.ok) throw new Error("Failed to create station");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      setEditingStation(null);
    },
  });

  const deleteStationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/stations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete station");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
    },
  });

  const addTaskToStation = () => {
    if (newTask.trim() && editingStation) {
      setEditingStation({
        ...editingStation,
        plannedTasks: [...editingStation.plannedTasks, newTask.trim()],
      });
      setNewTask("");
    }
  };

  const removeTaskFromStation = (index: number) => {
    if (editingStation) {
      setEditingStation({
        ...editingStation,
        plannedTasks: editingStation.plannedTasks.filter((_, i) => i !== index),
      });
    }
  };

  const addDiverToCrew = () => {
    if (newDiver.trim() && editingStation) {
      setEditingStation({
        ...editingStation,
        crew: {
          ...editingStation.crew,
          divers: [...editingStation.crew.divers, newDiver.trim().toUpperCase()],
        },
      });
      setNewDiver("");
    }
  };

  const removeDiverFromCrew = (index: number) => {
    if (editingStation) {
      setEditingStation({
        ...editingStation,
        crew: {
          ...editingStation.crew,
          divers: editingStation.crew.divers.filter((_, i) => i !== index),
        },
      });
    }
  };

  const handleSaveStation = () => {
    if (editingStation && editingStation.stationId) {
      createStationMutation.mutate(editingStation);
    }
  };

  const canEdit = isSupervisor || isAdmin;
  const [activeTab, setActiveTab] = useState<string>("daily");

  return (
    <div className="h-full flex flex-col">
      <div className="bg-navy-800 p-3 border-b border-navy-600">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-navy-700">
            <TabsTrigger value="daily" className="data-[state=active]:bg-navy-600">
              <Anchor className="w-4 h-4 mr-2" />
              Daily Stations
            </TabsTrigger>
            <TabsTrigger value="project-docs" className="data-[state=active]:bg-navy-600">
              <FileText className="w-4 h-4 mr-2" />
              Project Dive Plan
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "project-docs" ? (
        <ProjectDivePlanSection />
      ) : (
        <div className="flex-1 flex">
          <div className="w-1/2 border-r border-navy-600 flex flex-col">
            <div className="bg-navy-800/50 p-3 border-b border-navy-600">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Station Builder
              </h2>
              <p className="text-xs text-navy-400">Define stations with crews and tasks</p>
            </div>

        {canEdit ? (
          <ScrollArea className="flex-1 p-4">
            {!activePlan ? (
              <div className="space-y-4">
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">Create New Dive Plan</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      data-testid="input-plan-notes"
                      value={planNotes}
                      onChange={(e) => setPlanNotes(e.target.value)}
                      placeholder="Overall plan notes, objectives, or safety considerations..."
                      className="bg-navy-900 border-navy-600 text-white min-h-[100px]"
                    />
                    <Button
                      data-testid="button-create-plan"
                      onClick={() => createPlanMutation.mutate()}
                      disabled={createPlanMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 w-full"
                    >
                      Create Dive Plan
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : editingStation ? (
              <div className="space-y-4">
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      New Station
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Station ID</label>
                      <Input
                        data-testid="input-station-id"
                        value={editingStation.stationId}
                        onChange={(e) => setEditingStation({ ...editingStation, stationId: e.target.value.toUpperCase() })}
                        placeholder="e.g., STN-01, PIER-A"
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Target Depth (fsw)</label>
                        <Input
                          data-testid="input-target-depth"
                          type="number"
                          value={editingStation.targetDepthFsw ?? ""}
                          onChange={(e) => setEditingStation({ 
                            ...editingStation, 
                            targetDepthFsw: e.target.value ? parseInt(e.target.value) : null 
                          })}
                          placeholder="40"
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Planned Dives</label>
                        <Input
                          data-testid="input-planned-dives"
                          type="number"
                          min="1"
                          value={editingStation.plannedDives}
                          onChange={(e) => setEditingStation({ 
                            ...editingStation, 
                            plannedDives: parseInt(e.target.value) || 1 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-navy-400 mb-1 block flex items-center gap-1">
                        <Users className="w-3 h-3" /> Crew
                      </label>
                      <div className="space-y-2">
                        <Input
                          data-testid="input-supervisor"
                          value={editingStation.crew.supervisor}
                          onChange={(e) => setEditingStation({ 
                            ...editingStation, 
                            crew: { ...editingStation.crew, supervisor: e.target.value.toUpperCase() }
                          })}
                          placeholder="Supervisor initials (e.g., JS)"
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                        <div className="flex gap-2">
                          <Input
                            data-testid="input-diver"
                            value={newDiver}
                            onChange={(e) => setNewDiver(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && addDiverToCrew()}
                            placeholder="Add diver initials"
                            className="bg-navy-900 border-navy-600 text-white flex-1"
                          />
                          <Button
                            data-testid="button-add-diver"
                            onClick={addDiverToCrew}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {editingStation.crew.divers.map((diver, i) => (
                            <Badge 
                              key={i} 
                              className="bg-blue-600 cursor-pointer hover:bg-red-600"
                              onClick={() => removeDiverFromCrew(i)}
                            >
                              {diver} ×
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-navy-400 mb-1 block flex items-center gap-1">
                        <ClipboardList className="w-3 h-3" /> Planned Tasks
                      </label>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            data-testid="input-task"
                            value={newTask}
                            onChange={(e) => setNewTask(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && addTaskToStation()}
                            placeholder="Add a task..."
                            className="bg-navy-900 border-navy-600 text-white flex-1"
                          />
                          <Button
                            data-testid="button-add-task"
                            onClick={addTaskToStation}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {editingStation.plannedTasks.map((task, i) => (
                            <div key={i} className="flex items-center justify-between bg-navy-900/50 rounded px-2 py-1">
                              <span className="text-sm text-navy-200">{task}</span>
                              <button
                                onClick={() => removeTaskFromStation(i)}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Notes</label>
                      <Textarea
                        data-testid="input-station-notes"
                        value={editingStation.notes}
                        onChange={(e) => setEditingStation({ ...editingStation, notes: e.target.value })}
                        placeholder="Additional notes for this station..."
                        className="bg-navy-900 border-navy-600 text-white min-h-[60px]"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setEditingStation(null)}
                        className="border-navy-500 flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        data-testid="button-save-station"
                        onClick={handleSaveStation}
                        disabled={!editingStation.stationId || createStationMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 flex-1"
                      >
                        Save Station
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-4">
                <Button
                  data-testid="button-new-station"
                  onClick={() => setEditingStation({ ...emptyStation })}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Station
                </Button>

                {stations.length === 0 && (
                  <div className="text-center py-8">
                    <MapPin className="w-12 h-12 mx-auto text-navy-600 mb-2" />
                    <p className="text-navy-400">No stations defined yet</p>
                    <p className="text-xs text-navy-500 mt-1">Add stations to organize your dive operations</p>
                  </div>
                )}

                {stations.map((station) => (
                  <Card key={station.id} className="bg-navy-800/50 border-navy-600">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-blue-400" />
                          {station.stationId}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStationMutation.mutate(station.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {station.targetDepthFsw && (
                        <div className="flex justify-between text-navy-300">
                          <span>Depth:</span>
                          <span className="text-blue-400">{station.targetDepthFsw} fsw</span>
                        </div>
                      )}
                      <div className="flex justify-between text-navy-300">
                        <span>Planned Dives:</span>
                        <span>{station.plannedDives}</span>
                      </div>
                      {station.crew && (
                        <div className="pt-1">
                          <span className="text-navy-400 text-xs">Crew:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(station.crew as StationCrew).supervisor && (
                              <Badge className="bg-amber-600">{(station.crew as StationCrew).supervisor} (SUP)</Badge>
                            )}
                            {(station.crew as StationCrew).divers.map((d, i) => (
                              <Badge key={i} variant="outline" className="border-blue-500 text-blue-300">{d}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {Array.isArray(station.plannedTasks) && station.plannedTasks.length > 0 && (
                        <div className="pt-1">
                          <span className="text-navy-400 text-xs">Tasks:</span>
                          <ul className="text-navy-200 text-xs mt-1 space-y-1">
                            {(station.plannedTasks as string[]).map((task, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-green-400">•</span>
                                {task}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-navy-400">Only supervisors can manage dive plans</p>
          </div>
        )}
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Dive Plan Canvas</h2>
            <p className="text-xs text-navy-400">Current plan overview</p>
          </div>
          {activePlan && (
            <Badge className={
              activePlan.status === "Closed" ? "bg-red-600" : 
              activePlan.status === "Active" ? "bg-green-600" : "bg-amber-600"
            }>
              {activePlan.status} v{activePlan.planVersion}
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          {activePlan ? (
            <div className="space-y-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base">Plan Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-navy-400">Total Stations:</span>
                      <span className="text-white ml-2">{stations.length}</span>
                    </div>
                    <div>
                      <span className="text-navy-400">Total Planned Dives:</span>
                      <span className="text-white ml-2">
                        {stations.reduce((sum, s) => sum + (s.plannedDives || 0), 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-navy-400">Version:</span>
                      <span className="text-white ml-2">{activePlan.planVersion}</span>
                    </div>
                    <div>
                      <span className="text-navy-400">Day:</span>
                      <span className="text-white ml-2">{activeDay?.date || "Not linked"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {stations.length > 0 && (
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-base">Stations Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stations.map((station) => (
                        <div 
                          key={station.id} 
                          className="border border-navy-600 rounded-lg p-3 bg-navy-900/30"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-blue-400">{station.stationId}</span>
                            {station.targetDepthFsw && (
                              <Badge variant="outline" className="border-blue-500 text-blue-300">
                                {station.targetDepthFsw} fsw
                              </Badge>
                            )}
                          </div>
                          
                          {station.crew && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {(station.crew as StationCrew).supervisor && (
                                <span className="text-xs text-amber-400">
                                  SUP: {(station.crew as StationCrew).supervisor}
                                </span>
                              )}
                              {(station.crew as StationCrew).divers.length > 0 && (
                                <span className="text-xs text-navy-300 ml-2">
                                  Divers: {(station.crew as StationCrew).divers.join(", ")}
                                </span>
                              )}
                            </div>
                          )}

                          {Array.isArray(station.plannedTasks) && station.plannedTasks.length > 0 && (
                            <div className="text-xs text-navy-300">
                              {(station.plannedTasks as string[]).length} task(s) planned
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {activePlan.planJson && (activePlan.planJson as any).notes && (
                <Card className="bg-navy-800/50 border-navy-600">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-base">Plan Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-navy-200">{(activePlan.planJson as any).notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Anchor className="w-16 h-16 mx-auto text-navy-600 mb-4" />
              <p className="text-navy-400 text-lg">No active dive plan</p>
              <p className="text-sm text-navy-500 mt-1">
                Create a new dive plan to get started
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
        </div>
      )}
    </div>
  );
}

function ProjectDivePlanSection() {
  const { isSupervisor, isAdmin, user } = useAuth();
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ProjectDivePlan | null>(null);
  
  const [formData, setFormData] = useState<Partial<ProjectDivePlanData>>({
    projectName: activeProject?.name || "",
    projectNumber: activeProject?.id?.substring(0, 8).toUpperCase() || "",
    client: activeProject?.clientName || "",
    location: "",
    diveSupervisor: "",
    divingMode: "SCUBA",
    maxDepthFsw: 0,
    estimatedBottomTime: "",
    scopeOfWork: "",
    equipmentRequired: [],
    personnelRequired: [],
    emergencyProcedures: "Follow Emergency Action Plan (EAP) on file. Contact Dive Supervisor immediately for any emergency.",
    communicationPlan: "",
    decompProcedure: "All dives to be conducted within no-decompression limits per U.S. Navy Dive Tables. No in-water decompression planned.",
    safetyConsiderations: [],
    environmentalConditions: "",
    additionalNotes: "",
  });
  
  const [newEquipment, setNewEquipment] = useState("");
  const [newPersonnel, setNewPersonnel] = useState("");
  const [newSafety, setNewSafety] = useState("");

  const { data: projectPlans = [] } = useQuery<ProjectDivePlan[]>({
    queryKey: ["project-dive-plans", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const res = await fetch(`/api/projects/${activeProject.id}/project-dive-plans`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProject?.id,
  });

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject?.id) throw new Error("No active project");
      const res = await fetch(`/api/projects/${activeProject.id}/project-dive-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planData: formData }),
      });
      if (!res.ok) throw new Error("Failed to create project dive plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
      setIsCreating(false);
    },
  });

  const submitPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/project-dive-plans/${planId}/submit`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to submit plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
    },
  });

  const approvePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/project-dive-plans/${planId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to approve plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
    },
  });

  const downloadPlan = async (planId: string, revision: number) => {
    const res = await fetch(`/api/project-dive-plans/${planId}/download`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DivePlan_Rev${revision}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canEdit = isSupervisor || isAdmin;

  const addToList = (list: "equipmentRequired" | "personnelRequired" | "safetyConsiderations", value: string, setValue: (v: string) => void) => {
    if (value.trim()) {
      setFormData({
        ...formData,
        [list]: [...(formData[list] || []), value.trim()],
      });
      setValue("");
    }
  };

  const removeFromList = (list: "equipmentRequired" | "personnelRequired" | "safetyConsiderations", index: number) => {
    setFormData({
      ...formData,
      [list]: (formData[list] || []).filter((_, i) => i !== index),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Draft":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-400">Draft</Badge>;
      case "Submitted":
        return <Badge variant="outline" className="border-blue-500 text-blue-400">Submitted</Badge>;
      case "Approved":
        return <Badge className="bg-green-600">Approved</Badge>;
      case "Superseded":
        return <Badge variant="outline" className="border-gray-500 text-gray-400">Superseded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto text-navy-600 mb-4" />
          <p className="text-navy-400 text-lg">Select a project to manage dive plans</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      <div className="w-1/2 border-r border-navy-600 flex flex-col">
        <div className="bg-navy-800/50 p-3 border-b border-navy-600 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Project Dive Plan Document
            </h2>
            <p className="text-xs text-navy-400">Generate formal DD5 dive plan documents</p>
          </div>
          {canEdit && !isCreating && (
            <Button
              data-testid="button-new-project-plan"
              size="sm"
              onClick={() => setIsCreating(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Revision
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          {isCreating ? (
            <div className="space-y-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm">New Project Dive Plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Project Name</label>
                      <Input
                        data-testid="input-project-name"
                        value={formData.projectName}
                        onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Project Number</label>
                      <Input
                        data-testid="input-project-number"
                        value={formData.projectNumber}
                        onChange={(e) => setFormData({ ...formData, projectNumber: e.target.value })}
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Client</label>
                      <Input
                        data-testid="input-client"
                        value={formData.client}
                        onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Location</label>
                      <Input
                        data-testid="input-location"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Dive Supervisor</label>
                      <Input
                        data-testid="input-dive-supervisor"
                        value={formData.diveSupervisor}
                        onChange={(e) => setFormData({ ...formData, diveSupervisor: e.target.value })}
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Diving Mode</label>
                      <Input
                        data-testid="input-diving-mode"
                        value={formData.divingMode}
                        onChange={(e) => setFormData({ ...formData, divingMode: e.target.value })}
                        placeholder="SCUBA, Surface Supplied, etc."
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Max Depth (FSW)</label>
                      <Input
                        data-testid="input-max-depth"
                        type="number"
                        value={formData.maxDepthFsw || ""}
                        onChange={(e) => setFormData({ ...formData, maxDepthFsw: parseInt(e.target.value) || 0 })}
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-navy-400 mb-1 block">Est. Bottom Time</label>
                      <Input
                        data-testid="input-bottom-time"
                        value={formData.estimatedBottomTime}
                        onChange={(e) => setFormData({ ...formData, estimatedBottomTime: e.target.value })}
                        placeholder="e.g., 30 minutes"
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Scope of Work</label>
                    <Textarea
                      data-testid="input-scope"
                      value={formData.scopeOfWork}
                      onChange={(e) => setFormData({ ...formData, scopeOfWork: e.target.value })}
                      className="bg-navy-900 border-navy-600 text-white min-h-[80px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Equipment Required</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        data-testid="input-new-equipment"
                        value={newEquipment}
                        onChange={(e) => setNewEquipment(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addToList("equipmentRequired", newEquipment, setNewEquipment)}
                        placeholder="Add equipment item..."
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                      <Button size="sm" onClick={() => addToList("equipmentRequired", newEquipment, setNewEquipment)}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.equipmentRequired?.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("equipmentRequired", idx)}>
                          {item} <Trash2 className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Personnel Required</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        data-testid="input-new-personnel"
                        value={newPersonnel}
                        onChange={(e) => setNewPersonnel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addToList("personnelRequired", newPersonnel, setNewPersonnel)}
                        placeholder="Add personnel..."
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                      <Button size="sm" onClick={() => addToList("personnelRequired", newPersonnel, setNewPersonnel)}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.personnelRequired?.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("personnelRequired", idx)}>
                          {item} <Trash2 className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Decompression Procedure</label>
                    <Textarea
                      data-testid="input-decomp"
                      value={formData.decompProcedure}
                      onChange={(e) => setFormData({ ...formData, decompProcedure: e.target.value })}
                      className="bg-navy-900 border-navy-600 text-white min-h-[60px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Emergency Procedures</label>
                    <Textarea
                      data-testid="input-emergency"
                      value={formData.emergencyProcedures}
                      onChange={(e) => setFormData({ ...formData, emergencyProcedures: e.target.value })}
                      className="bg-navy-900 border-navy-600 text-white min-h-[60px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Communication Plan</label>
                    <Textarea
                      data-testid="input-communication"
                      value={formData.communicationPlan}
                      onChange={(e) => setFormData({ ...formData, communicationPlan: e.target.value })}
                      className="bg-navy-900 border-navy-600 text-white min-h-[60px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Environmental Conditions</label>
                    <Textarea
                      data-testid="input-environment"
                      value={formData.environmentalConditions}
                      onChange={(e) => setFormData({ ...formData, environmentalConditions: e.target.value })}
                      className="bg-navy-900 border-navy-600 text-white min-h-[60px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Safety Considerations</label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        data-testid="input-new-safety"
                        value={newSafety}
                        onChange={(e) => setNewSafety(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addToList("safetyConsiderations", newSafety, setNewSafety)}
                        placeholder="Add safety consideration..."
                        className="bg-navy-900 border-navy-600 text-white"
                      />
                      <Button size="sm" onClick={() => addToList("safetyConsiderations", newSafety, setNewSafety)}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.safetyConsiderations?.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="cursor-pointer" onClick={() => removeFromList("safetyConsiderations", idx)}>
                          {item} <Trash2 className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-navy-400 mb-1 block">Additional Notes</label>
                    <Textarea
                      data-testid="input-notes"
                      value={formData.additionalNotes}
                      onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
                      className="bg-navy-900 border-navy-600 text-white min-h-[60px]"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      data-testid="button-save-project-plan"
                      onClick={() => createPlanMutation.mutate()}
                      disabled={createPlanMutation.isPending}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Create Draft
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreating(false)}
                      className="border-navy-600"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-3">
              {projectPlans.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 mx-auto text-navy-600 mb-4" />
                  <p className="text-navy-400">No project dive plans yet</p>
                  <p className="text-sm text-navy-500 mt-1">
                    Create a new dive plan document to get started
                  </p>
                </div>
              ) : (
                projectPlans.map((plan) => (
                  <Card
                    key={plan.id}
                    data-testid={`card-project-plan-${plan.id}`}
                    className={`bg-navy-800/50 border-navy-600 cursor-pointer hover:border-navy-500 transition-colors ${
                      selectedPlan?.id === plan.id ? "border-blue-500" : ""
                    }`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-white font-medium">Rev {plan.revision}</h3>
                            {getStatusBadge(plan.status)}
                          </div>
                          <p className="text-sm text-navy-400 mt-1">
                            Created {new Date(plan.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadPlan(plan.id, plan.revision);
                            }}
                            className="border-navy-600"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {plan.status === "Draft" && canEdit && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                submitPlanMutation.mutate(plan.id);
                              }}
                              disabled={submitPlanMutation.isPending}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Submit
                            </Button>
                          )}
                          {plan.status === "Submitted" && isAdmin && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                approvePlanMutation.mutate(plan.id);
                              }}
                              disabled={approvePlanMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="bg-navy-800/50 p-3 border-b border-navy-600">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4" />
            Plan Details
          </h2>
          <p className="text-xs text-navy-400">View plan content and revision history</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          {selectedPlan ? (
            <div className="space-y-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-white text-base">
                      Dive Plan Rev {selectedPlan.revision}
                    </CardTitle>
                    {getStatusBadge(selectedPlan.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const data = selectedPlan.planData as ProjectDivePlanData;
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-navy-400">Project:</span>{" "}
                            <span className="text-white">{data.projectName}</span>
                          </div>
                          <div>
                            <span className="text-navy-400">Client:</span>{" "}
                            <span className="text-white">{data.client}</span>
                          </div>
                          <div>
                            <span className="text-navy-400">Location:</span>{" "}
                            <span className="text-white">{data.location}</span>
                          </div>
                          <div>
                            <span className="text-navy-400">Supervisor:</span>{" "}
                            <span className="text-white">{data.diveSupervisor}</span>
                          </div>
                          <div>
                            <span className="text-navy-400">Diving Mode:</span>{" "}
                            <span className="text-white">{data.divingMode}</span>
                          </div>
                          <div>
                            <span className="text-navy-400">Max Depth:</span>{" "}
                            <span className="text-white">{data.maxDepthFsw} FSW</span>
                          </div>
                        </div>
                        
                        {data.scopeOfWork && (
                          <div>
                            <h4 className="text-navy-400 text-xs mb-1">Scope of Work</h4>
                            <p className="text-white text-sm">{data.scopeOfWork}</p>
                          </div>
                        )}

                        {data.equipmentRequired && data.equipmentRequired.length > 0 && (
                          <div>
                            <h4 className="text-navy-400 text-xs mb-1">Equipment Required</h4>
                            <div className="flex flex-wrap gap-1">
                              {data.equipmentRequired.map((item, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">{item}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {data.personnelRequired && data.personnelRequired.length > 0 && (
                          <div>
                            <h4 className="text-navy-400 text-xs mb-1">Personnel Required</h4>
                            <div className="flex flex-wrap gap-1">
                              {data.personnelRequired.map((item, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">{item}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {data.safetyConsiderations && data.safetyConsiderations.length > 0 && (
                          <div>
                            <h4 className="text-navy-400 text-xs mb-1">Safety Considerations</h4>
                            <div className="flex flex-wrap gap-1">
                              {data.safetyConsiderations.map((item, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs border-yellow-500 text-yellow-400">{item}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {selectedPlan.status === "Approved" && (
                <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>This is the current approved dive plan</span>
                  </div>
                </div>
              )}

              {selectedPlan.status === "Superseded" && (
                <div className="bg-gray-900/20 border border-gray-600/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <History className="w-4 h-4" />
                    <span>This plan has been superseded by a newer revision</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-navy-600 mb-4" />
              <p className="text-navy-400">Select a plan to view details</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
