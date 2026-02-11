import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, FileText, Download, Send, CheckCircle, History, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProjectDivePlan, ProjectDivePlanData, DD5Contact } from "@shared/schema";
import { DD5_CONTROLLED_TASK_LIBRARY } from "@shared/schema";

export function DivePlanTab() {
  return (
    <div className="h-full flex flex-col">
      <ProjectDivePlanSection />
    </div>
  );
}

function ProjectDivePlanSection() {
  const { isSupervisor, isAdmin, user } = useAuth();
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ProjectDivePlan | null>(null);
  
  const today = new Date().toISOString().split("T")[0];
  const storageKey = `divePlanDraft_${activeProject?.id || 'default'}`;
  
  const getDefaultFormData = useCallback((): ProjectDivePlanData => ({
    coverPage: {
      companyName: "Precision Subsea Group LLC",
      projectTitle: activeProject?.name || "",
      jobNumber: activeProject?.id?.substring(0, 8).toUpperCase() || "",
      client: activeProject?.clientName || "",
      siteLocation: "",
      submissionDate: today,
      revisionNumber: 0,
    },
    projectContacts: {
      primeContractor: "",
      siteAddress: "",
      keyContacts: [],
    },
    natureOfWork: {
      selectedTasks: [],
    },
    revisionHistory: [{
      revision: 0,
      date: today,
      description: "Initial release",
      section: "All",
      changedBy: user?.fullName || user?.username || "",
    }],
  }), [activeProject, today, user]);

  const [formData, setFormData] = useState<ProjectDivePlanData>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load saved draft:", e);
    }
    return getDefaultFormData();
  });
  
  const [newContact, setNewContact] = useState<DD5Contact>({ name: "", role: "", phone: "", email: "" });

  useEffect(() => {
    if (isCreating && formData) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(formData));
      } catch (e) {
        console.error("Failed to save draft:", e);
      }
    }
  }, [formData, isCreating, storageKey]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isCreating && formData.natureOfWork.selectedTasks.length > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(formData));
        } catch (err) {
          console.error("Failed to save draft on unload:", err);
        }
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isCreating, formData, storageKey]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.error("Failed to clear draft:", e);
    }
  }, [storageKey]);

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
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
      setIsCreating(false);
      setFormData(getDefaultFormData());
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

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/project-dive-plans/${planId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to delete plan" }));
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
      setSelectedPlan(null);
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

  const toggleTask = (task: string) => {
    const currentTasks = formData.natureOfWork.selectedTasks;
    const newTasks = currentTasks.includes(task)
      ? currentTasks.filter(t => t !== task)
      : [...currentTasks, task];
    
    setFormData({
      ...formData,
      natureOfWork: { selectedTasks: newTasks },
    });
  };

  const addContact = () => {
    if (newContact.name && newContact.role && newContact.phone) {
      setFormData({
        ...formData,
        projectContacts: {
          ...formData.projectContacts,
          keyContacts: [...formData.projectContacts.keyContacts, { ...newContact }],
        },
      });
      setNewContact({ name: "", role: "", phone: "", email: "" });
    }
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      projectContacts: {
        ...formData.projectContacts,
        keyContacts: formData.projectContacts.keyContacts.filter((_, i) => i !== index),
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Draft":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-400">Draft</Badge>;
      case "Submitted":
        return <Badge variant="outline" className="border-amber-500 text-amber-400">Submitted</Badge>;
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
    <div className="flex-1 flex h-full overflow-hidden">
      <div className="w-1/2 border-r border-navy-600 flex flex-col h-full overflow-hidden">
        <div className="bg-navy-800/50 p-3 border-b border-navy-600 flex justify-between items-center shrink-0">
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
              className="btn-gold-metallic hover:btn-gold-metallic"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Revision
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isCreating ? (
            <div className="space-y-4">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm">DD5 Dive Plan - Controlled Fill Zones</CardTitle>
                  <p className="text-xs text-navy-400">Only editable fields shown. Locked boilerplate sections preserved from master template.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-navy-900/50 p-3 rounded border border-navy-700">
                    <h3 className="text-sm font-medium text-white mb-3">Cover Page</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Company Name</label>
                        <Input
                          data-testid="input-company-name"
                          value={formData.coverPage.companyName}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            coverPage: { ...formData.coverPage, companyName: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Project Title</label>
                        <Input
                          data-testid="input-project-title"
                          value={formData.coverPage.projectTitle}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            coverPage: { ...formData.coverPage, projectTitle: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Job Number</label>
                        <Input
                          data-testid="input-job-number"
                          value={formData.coverPage.jobNumber}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            coverPage: { ...formData.coverPage, jobNumber: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Client</label>
                        <Input
                          data-testid="input-client"
                          value={formData.coverPage.client}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            coverPage: { ...formData.coverPage, client: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Site Location</label>
                        <Input
                          data-testid="input-site-location"
                          value={formData.coverPage.siteLocation}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            coverPage: { ...formData.coverPage, siteLocation: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Submission Date</label>
                        <Input
                          data-testid="input-submission-date"
                          type="date"
                          value={formData.coverPage.submissionDate}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            coverPage: { ...formData.coverPage, submissionDate: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-navy-900/50 p-3 rounded border border-navy-700">
                    <h3 className="text-sm font-medium text-white mb-3">Project Contacts (Section 2.13-2.14)</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Prime Contractor</label>
                        <Input
                          data-testid="input-prime-contractor"
                          value={formData.projectContacts.primeContractor}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            projectContacts: { ...formData.projectContacts, primeContractor: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400 mb-1 block">Site Address</label>
                        <Input
                          data-testid="input-site-address"
                          value={formData.projectContacts.siteAddress || ""}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            projectContacts: { ...formData.projectContacts, siteAddress: e.target.value } 
                          })}
                          className="bg-navy-900 border-navy-600 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="text-xs text-navy-400 mb-2 block">Key Contacts</label>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          <Input
                            data-testid="input-contact-name"
                            value={newContact.name}
                            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                            placeholder="Name"
                            className="bg-navy-900 border-navy-600 text-white text-sm"
                          />
                          <Input
                            data-testid="input-contact-role"
                            value={newContact.role}
                            onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                            placeholder="Role"
                            className="bg-navy-900 border-navy-600 text-white text-sm"
                          />
                          <Input
                            data-testid="input-contact-phone"
                            value={newContact.phone}
                            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                            placeholder="Phone"
                            className="bg-navy-900 border-navy-600 text-white text-sm"
                          />
                          <Button size="sm" onClick={addContact} className="btn-gold-metallic hover:btn-gold-metallic">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {formData.projectContacts.keyContacts.map((contact, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-navy-900 p-2 rounded text-sm">
                              <span className="text-white">{contact.name} ({contact.role}): {contact.phone}</span>
                              <Button size="sm" variant="ghost" onClick={() => removeContact(idx)}>
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-navy-900/50 p-3 rounded border border-navy-700">
                    <h3 className="text-sm font-medium text-white mb-2">Section 2.9 - Nature of Work</h3>
                    <p className="text-xs text-navy-400 mb-3">Select authorized diver tasks from controlled library (no freewriting)</p>
                    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                      {DD5_CONTROLLED_TASK_LIBRARY.map((task) => (
                        <div
                          key={task}
                          data-testid={`task-${task.replace(/\s+/g, "-").toLowerCase()}`}
                          onClick={() => toggleTask(task)}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
                            formData.natureOfWork.selectedTasks.includes(task)
                              ? "btn-gold-metallic/20 border border-amber-500"
                              : "bg-navy-800 border border-navy-700 hover:border-navy-500"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center ${
                            formData.natureOfWork.selectedTasks.includes(task)
                              ? "btn-gold-metallic"
                              : "bg-navy-700"
                          }`}>
                            {formData.natureOfWork.selectedTasks.includes(task) && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <span className="text-white text-xs">{task}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-navy-400">
                      {formData.natureOfWork.selectedTasks.length} task(s) selected
                    </div>
                  </div>

                  <div className="bg-amber-900/20 border border-amber-600/30 rounded p-3">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-amber-400 mt-0.5" />
                      <div className="text-xs text-amber-200">
                        <strong>Locked Sections (preserved from DD5 template):</strong>
                        <ul className="mt-1 space-y-0.5 text-amber-300">
                          <li>Section 2.5 - Team Members and Duties</li>
                          <li>Section 2.12 - Equipment Procedures Checklist</li>
                          <li>Sections 4.9-4.18 - Emergency Procedures</li>
                          <li>Section 5 - Reporting + Forms</li>
                          <li>All EM385 tables, USN tables, appendices</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      data-testid="button-save-project-plan"
                      onClick={() => createPlanMutation.mutate()}
                      disabled={createPlanMutation.isPending || formData.natureOfWork.selectedTasks.length === 0}
                      className="flex-1 btn-gold-metallic hover:btn-gold-metallic"
                    >
                      Create Draft (Rev 0)
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
                      selectedPlan?.id === plan.id ? "border-amber-500" : ""
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
                              className="btn-gold-metallic hover:btn-gold-metallic"
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
                          {canEdit && (plan.status !== "Approved" || isAdmin) && (
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`button-delete-plan-${plan.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete Rev ${plan.revision}? This cannot be undone.`)) {
                                  deletePlanMutation.mutate(plan.id);
                                }
                              }}
                              disabled={deletePlanMutation.isPending}
                              className="border-red-600/50 text-red-400 hover:bg-red-600/20"
                            >
                              <Trash2 className="w-4 h-4" />
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
        </div>
      </div>

      <div className="w-1/2 flex flex-col h-full overflow-hidden">
        <div className="bg-navy-800/50 p-3 border-b border-navy-600 shrink-0">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <History className="w-4 h-4" />
            Plan Details
          </h2>
          <p className="text-xs text-navy-400">View plan content and revision history</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
                        <div className="bg-navy-900/50 p-2 rounded">
                          <h4 className="text-navy-400 text-xs mb-2">Cover Page</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-navy-400">Company:</span>{" "}
                              <span className="text-white">{data.coverPage?.companyName}</span>
                            </div>
                            <div>
                              <span className="text-navy-400">Project:</span>{" "}
                              <span className="text-white">{data.coverPage?.projectTitle}</span>
                            </div>
                            <div>
                              <span className="text-navy-400">Job #:</span>{" "}
                              <span className="text-white">{data.coverPage?.jobNumber}</span>
                            </div>
                            <div>
                              <span className="text-navy-400">Client:</span>{" "}
                              <span className="text-white">{data.coverPage?.client}</span>
                            </div>
                            <div>
                              <span className="text-navy-400">Location:</span>{" "}
                              <span className="text-white">{data.coverPage?.siteLocation}</span>
                            </div>
                            <div>
                              <span className="text-navy-400">Submitted:</span>{" "}
                              <span className="text-white">{data.coverPage?.submissionDate}</span>
                            </div>
                          </div>
                        </div>

                        {data.projectContacts && (
                          <div className="bg-navy-900/50 p-2 rounded">
                            <h4 className="text-navy-400 text-xs mb-2">Project Contacts</h4>
                            <div className="text-sm">
                              <div className="mb-1">
                                <span className="text-navy-400">Prime Contractor:</span>{" "}
                                <span className="text-white">{data.projectContacts.primeContractor}</span>
                              </div>
                              {data.projectContacts.keyContacts?.map((contact, idx) => (
                                <div key={idx} className="text-white text-xs">
                                  {contact.name} ({contact.role}): {contact.phone}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {data.natureOfWork?.selectedTasks && data.natureOfWork.selectedTasks.length > 0 && (
                          <div className="bg-navy-900/50 p-2 rounded">
                            <h4 className="text-navy-400 text-xs mb-2">Section 2.9 - Nature of Work</h4>
                            <div className="flex flex-wrap gap-1">
                              {data.natureOfWork.selectedTasks.map((task, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">{task}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {data.revisionHistory && data.revisionHistory.length > 0 && (
                          <div className="bg-navy-900/50 p-2 rounded">
                            <h4 className="text-navy-400 text-xs mb-2">Revision History</h4>
                            <div className="space-y-1">
                              {data.revisionHistory.map((entry, idx) => (
                                <div key={idx} className="text-xs text-white flex justify-between">
                                  <span>Rev {entry.revision}: {entry.description}</span>
                                  <span className="text-navy-400">{entry.section} - {entry.date}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-navy-500 italic">
                          Locked sections (2.5, 2.12, 4.9-4.18, Section 5) preserved from DD5 template
                        </div>
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
        </div>
      </div>
    </div>
  );
}
