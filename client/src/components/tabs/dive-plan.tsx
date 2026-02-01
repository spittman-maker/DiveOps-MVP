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
import { Plus, Trash2, MapPin, Users, ClipboardList, Anchor } from "lucide-react";
import type { DivePlan, Station, StationCrew } from "@shared/schema";

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

  return (
    <div className="h-full flex">
      <div className="w-1/2 border-r border-navy-600 flex flex-col">
        <div className="bg-navy-800 p-3 border-b border-navy-600">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Anchor className="w-4 h-4" />
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
  );
}
