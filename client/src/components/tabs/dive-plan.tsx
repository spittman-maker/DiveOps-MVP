import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Send, FileText, Download, Trash2, CheckCircle, History,
  Save, Loader2, MessageSquare, Sparkles, ChevronDown, ChevronRight
} from "lucide-react";
import type { ProjectDivePlan, ProjectDivePlanData } from "@shared/schema";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIDivePlanData {
  coverPage?: {
    companyName?: string;
    projectTitle?: string;
    jobNumber?: string;
    client?: string;
    siteLocation?: string;
    submissionDate?: string;
    revisionNumber?: number;
  };
  projectContacts?: {
    primeContractor?: string;
    siteAddress?: string;
    keyContacts?: Array<{ name: string; role: string; phone: string; email?: string }>;
  };
  natureOfWork?: {
    selectedTasks?: string[];
  };
  scopeOfWork?: string;
  divingMode?: string;
  maxDepth?: string;
  estimatedDuration?: string;
  personnelCount?: string;
  equipmentNotes?: string;
  siteConditions?: string;
  hazardNotes?: string;
  additionalNotes?: string;
  revisionHistory?: Array<{ revision: number; date: string; description: string; section: string; changedBy: string }>;
}

function PlanCanvas({ planData, isGenerating }: { planData: AIDivePlanData | null; isGenerating: boolean }) {
  if (!planData) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <Sparkles className="w-16 h-16 mx-auto text-navy-600 mb-4" />
          <p className="text-navy-400 text-lg">Your dive plan will appear here</p>
          <p className="text-sm text-navy-500 mt-2">
            Start describing your operation on the left and the AI will build your professional DD5 dive plan in real-time
          </p>
        </div>
      </div>
    );
  }

  const cp = planData.coverPage;
  const pc = planData.projectContacts;
  const now = planData.natureOfWork;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="plan-canvas">
      {isGenerating && (
        <div className="flex items-center gap-2 text-amber-400 text-xs mb-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Updating plan...</span>
        </div>
      )}

      <div className="border border-navy-600 rounded-lg overflow-hidden">
        <div className="bg-gradient-to-r from-navy-800 to-navy-700 p-4 border-b border-navy-600">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                {cp?.companyName || "Precision Subsea Group LLC"}
              </h2>
              <p className="text-amber-400 text-sm font-medium mt-1">DD5 PROJECT DIVE PLAN</p>
            </div>
            <Badge className="btn-gold-metallic text-xs">DRAFT</Badge>
          </div>
        </div>

        {cp && (cp.projectTitle || cp.client || cp.siteLocation) && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-3">Cover Page</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {cp.projectTitle && (
                <div><span className="text-navy-400">Project:</span> <span className="text-white font-medium">{cp.projectTitle}</span></div>
              )}
              {cp.client && (
                <div><span className="text-navy-400">Client:</span> <span className="text-white font-medium">{cp.client}</span></div>
              )}
              {cp.jobNumber && (
                <div><span className="text-navy-400">Job #:</span> <span className="text-white font-mono">{cp.jobNumber}</span></div>
              )}
              {cp.siteLocation && (
                <div><span className="text-navy-400">Location:</span> <span className="text-white">{cp.siteLocation}</span></div>
              )}
              {cp.submissionDate && (
                <div><span className="text-navy-400">Date:</span> <span className="text-white">{cp.submissionDate}</span></div>
              )}
              {cp.revisionNumber != null && (
                <div><span className="text-navy-400">Revision:</span> <span className="text-white">{cp.revisionNumber}</span></div>
              )}
            </div>
          </div>
        )}

        {planData.scopeOfWork && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Scope of Work</h3>
            <p className="text-white text-sm leading-relaxed">{planData.scopeOfWork}</p>
          </div>
        )}

        {(planData.divingMode || planData.maxDepth || planData.estimatedDuration || planData.personnelCount) && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-3">Dive Operations Parameters</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {planData.divingMode && (
                <div><span className="text-navy-400">Diving Mode:</span> <span className="text-white font-medium">{planData.divingMode}</span></div>
              )}
              {planData.maxDepth && (
                <div><span className="text-navy-400">Max Depth:</span> <span className="text-white font-medium">{planData.maxDepth}</span></div>
              )}
              {planData.estimatedDuration && (
                <div><span className="text-navy-400">Est. Duration:</span> <span className="text-white">{planData.estimatedDuration}</span></div>
              )}
              {planData.personnelCount && (
                <div><span className="text-navy-400">Personnel:</span> <span className="text-white">{planData.personnelCount}</span></div>
              )}
            </div>
          </div>
        )}

        {now?.selectedTasks && now.selectedTasks.length > 0 && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-3">Section 2.9 - Nature of Work</h3>
            <div className="flex flex-wrap gap-1.5">
              {now.selectedTasks.map((task, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs bg-navy-700 text-white border border-navy-600">{task}</Badge>
              ))}
            </div>
          </div>
        )}

        {pc && (pc.primeContractor || (pc.keyContacts && pc.keyContacts.length > 0)) && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-3">Project Contacts</h3>
            {pc.primeContractor && (
              <div className="text-sm mb-2">
                <span className="text-navy-400">Prime Contractor:</span>{" "}
                <span className="text-white font-medium">{pc.primeContractor}</span>
              </div>
            )}
            {pc.siteAddress && (
              <div className="text-sm mb-2">
                <span className="text-navy-400">Site Address:</span>{" "}
                <span className="text-white">{pc.siteAddress}</span>
              </div>
            )}
            {pc.keyContacts && pc.keyContacts.length > 0 && pc.keyContacts.some(c => c.name) && (
              <div className="space-y-1 mt-2">
                {pc.keyContacts.filter(c => c.name).map((contact, idx) => (
                  <div key={idx} className="text-xs text-white bg-navy-800 rounded px-2 py-1">
                    <span className="font-medium">{contact.name}</span>
                    {contact.role && <span className="text-navy-400"> ({contact.role})</span>}
                    {contact.phone && <span className="text-navy-400">: {contact.phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {planData.equipmentNotes && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Equipment</h3>
            <p className="text-white text-sm">{planData.equipmentNotes}</p>
          </div>
        )}

        {planData.siteConditions && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Site Conditions</h3>
            <p className="text-white text-sm">{planData.siteConditions}</p>
          </div>
        )}

        {planData.hazardNotes && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Hazard Assessment</h3>
            <p className="text-white text-sm">{planData.hazardNotes}</p>
          </div>
        )}

        {planData.additionalNotes && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Additional Notes</h3>
            <p className="text-white text-sm">{planData.additionalNotes}</p>
          </div>
        )}

        <div className="p-3 bg-navy-900/50">
          <p className="text-[10px] text-navy-500 italic">
            Locked sections (2.5, 2.12, 4.9-4.18, Section 5) preserved from DD5 master template.
            Emergency procedures, EM385 tables, USN dive tables, and appendices included in final document.
          </p>
        </div>
      </div>
    </div>
  );
}

function SavedPlansDrawer({ 
  plans, 
  onSelect, 
  onDownload, 
  onDelete, 
  onSubmit, 
  onApprove,
  canEdit, 
  isAdmin,
  isGod,
}: {
  plans: ProjectDivePlan[];
  onSelect: (plan: ProjectDivePlan) => void;
  onDownload: (id: string, rev: number) => void;
  onDelete: (id: string, rev: number) => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  canEdit: boolean;
  isAdmin: boolean;
  isGod: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (plans.length === 0) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Draft": return <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-[10px]">Draft</Badge>;
      case "Submitted": return <Badge variant="outline" className="border-amber-500 text-amber-400 text-[10px]">Submitted</Badge>;
      case "Approved": return <Badge className="bg-green-600 text-[10px]">Approved</Badge>;
      case "Superseded": return <Badge variant="outline" className="border-gray-500 text-gray-400 text-[10px]">Superseded</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="border-t border-navy-600">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-sm text-navy-300 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4" />
          Saved Plans ({plans.length})
        </span>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 space-y-2 max-h-[300px] overflow-y-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-navy-800/50 border border-navy-600 rounded p-2 cursor-pointer hover:border-navy-500 transition-colors"
              onClick={() => onSelect(plan)}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs font-medium">Rev {plan.revision}</span>
                  {getStatusBadge(plan.status)}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onDownload(plan.id, plan.revision); }}>
                    <Download className="w-3 h-3 text-navy-400" />
                  </Button>
                  {plan.status === "Draft" && canEdit && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onSubmit(plan.id); }}>
                      <Send className="w-3 h-3 text-amber-400" />
                    </Button>
                  )}
                  {plan.status === "Submitted" && isAdmin && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onApprove(plan.id); }}>
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    </Button>
                  )}
                  {canEdit && (plan.status !== "Approved" || isGod) && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete Rev ${plan.revision}?`)) onDelete(plan.id, plan.revision);
                    }}>
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-navy-500 mt-1">
                {new Date(plan.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DivePlanTab() {
  const { isSupervisor, isAdmin, isGod, user } = useAuth();
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [planData, setPlanData] = useState<AIDivePlanData | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = isSupervisor || isAdmin;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const savePlanMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject?.id || !planData) throw new Error("No plan data");
      const fullPlanData: ProjectDivePlanData = {
        coverPage: {
          companyName: planData.coverPage?.companyName || "Precision Subsea Group LLC",
          projectTitle: planData.coverPage?.projectTitle || activeProject.name || "",
          jobNumber: planData.coverPage?.jobNumber || activeProject.id.substring(0, 8).toUpperCase(),
          client: planData.coverPage?.client || (activeProject as any).clientName || "",
          siteLocation: planData.coverPage?.siteLocation || "",
          submissionDate: planData.coverPage?.submissionDate || new Date().toISOString().split("T")[0],
          revisionNumber: planData.coverPage?.revisionNumber || 0,
        },
        projectContacts: {
          primeContractor: planData.projectContacts?.primeContractor || "",
          siteAddress: planData.projectContacts?.siteAddress || "",
          keyContacts: planData.projectContacts?.keyContacts || [],
        },
        natureOfWork: {
          selectedTasks: planData.natureOfWork?.selectedTasks || [],
        },
        revisionHistory: [{
          revision: 0,
          date: new Date().toISOString().split("T")[0],
          description: "AI-generated initial release",
          section: "All",
          changedBy: user?.fullName || user?.username || "System",
        }],
        scopeOfWork: planData.scopeOfWork || undefined,
        divingMode: planData.divingMode || undefined,
        maxDepth: planData.maxDepth || undefined,
        estimatedDuration: planData.estimatedDuration || undefined,
        personnelCount: planData.personnelCount || undefined,
        equipmentNotes: planData.equipmentNotes || undefined,
        siteConditions: planData.siteConditions || undefined,
        hazardNotes: planData.hazardNotes || undefined,
        additionalNotes: planData.additionalNotes || undefined,
      };

      const res = await fetch(`/api/projects/${activeProject.id}/project-dive-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planData: fullPlanData }),
      });
      if (!res.ok) throw new Error("Failed to save plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
      toast({ title: "Plan saved", description: "Your dive plan has been saved as a draft revision." });
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const submitPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/project-dive-plans/${planId}/submit`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to submit plan");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] }); },
  });

  const approvePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/project-dive-plans/${planId}/approve`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to approve plan");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] }); },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/project-dive-plans/${planId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({ message: "Failed" })); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans"] });
      toast({ title: "Plan deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
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

  const loadPlanToCanvas = (plan: ProjectDivePlan) => {
    const data = plan.planData as ProjectDivePlanData;
    setPlanData({
      coverPage: data.coverPage,
      projectContacts: data.projectContacts,
      natureOfWork: data.natureOfWork,
      revisionHistory: data.revisionHistory,
      scopeOfWork: data.scopeOfWork,
      divingMode: data.divingMode,
      maxDepth: data.maxDepth,
      estimatedDuration: data.estimatedDuration,
      personnelCount: data.personnelCount,
      equipmentNotes: data.equipmentNotes,
      siteConditions: data.siteConditions,
      hazardNotes: data.hazardNotes,
      additionalNotes: data.additionalNotes,
    });
    setMessages([{
      id: "loaded",
      role: "assistant",
      content: `Loaded Rev ${plan.revision} (${data.coverPage?.projectTitle || "Untitled"}) into the canvas. You can continue editing by describing any changes.`,
      timestamp: new Date(),
    }]);
  };

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isGenerating) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputText.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText("");
    setIsGenerating(true);

    try {
      const projectContext = activeProject ? {
        name: activeProject.name,
        clientName: (activeProject as any).clientName,
        jobsiteName: (activeProject as any).jobsiteName,
        jobsiteAddress: (activeProject as any).jobsiteAddress,
        jobNumber: activeProject.id.substring(0, 8).toUpperCase(),
      } : null;

      const res = await fetch("/api/dive-plan/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: newMessages.filter(m => m.id !== "loaded").map(m => ({
            role: m.role,
            content: m.role === "assistant" ? `[Previous plan update acknowledged]` : m.content,
          })),
          currentPlan: planData,
          projectContext,
        }),
      });

      if (!res.ok) throw new Error("AI generation failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "plan") {
              setPlanData(parsed.data);
            }
          } catch {}
        }
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I've updated the dive plan based on your input. You can see the changes on the right. Keep describing any additional details or modifications.",
        timestamp: new Date(),
      }]);
    } catch (error: any) {
      toast({ title: "AI Error", description: error.message, variant: "destructive" });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I had trouble processing that. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, isGenerating, messages, planData, activeProject, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto text-navy-600 mb-4" />
          <p className="text-navy-400 text-lg">Select a project to create dive plans</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-[400px] min-w-[350px] border-r border-navy-600 flex flex-col h-full bg-navy-900/30">
        <div className="bg-navy-800/50 p-3 border-b border-navy-600 shrink-0">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            Dive Plan Builder
          </h2>
          <p className="text-xs text-navy-400 mt-0.5">Describe your operation in plain language</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="w-10 h-10 mx-auto text-amber-400/40 mb-3" />
              <p className="text-navy-400 text-sm">Start typing to build your dive plan</p>
              <div className="mt-4 space-y-2 text-xs text-navy-500">
                <p className="bg-navy-800/50 rounded p-2 text-left">
                  "We're doing underwater welding on pier bravo at pearl harbor, 3 divers, max depth 45 feet, surface supplied"
                </p>
                <p className="bg-navy-800/50 rounded p-2 text-left">
                  "Client is NAVFAC Pacific, prime contractor is pacific shipyard. Add John Doe as safety officer 808-555-1234"
                </p>
                <p className="bg-navy-800/50 rounded p-2 text-left">
                  "We'll also be doing hull cleaning and cathodic protection survey"
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-amber-600/20 border border-amber-600/30 text-white"
                    : "bg-navy-800 border border-navy-700 text-navy-200"
                }`}
                data-testid={`chat-message-${msg.role}`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-navy-300 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Building your dive plan...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-navy-600 shrink-0">
          {planData && (
            <div className="flex gap-2 mb-2">
              <Button
                size="sm"
                onClick={() => savePlanMutation.mutate()}
                disabled={savePlanMutation.isPending}
                className="flex-1 btn-gold-metallic hover:btn-gold-metallic text-xs"
                data-testid="button-save-plan"
              >
                {savePlanMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Save as Draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setPlanData(null); setMessages([]); }}
                className="border-navy-600 text-xs"
                data-testid="button-clear-plan"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              data-testid="input-plan-chat"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your dive operation..."
              className="bg-navy-900 border-navy-600 text-white resize-none min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={isGenerating}
            />
            <Button
              onClick={sendMessage}
              disabled={!inputText.trim() || isGenerating}
              className="btn-gold-metallic hover:btn-gold-metallic shrink-0"
              data-testid="button-send-plan-message"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <SavedPlansDrawer
          plans={projectPlans}
          onSelect={loadPlanToCanvas}
          onDownload={downloadPlan}
          onDelete={(id, rev) => deletePlanMutation.mutate(id)}
          onSubmit={(id) => submitPlanMutation.mutate(id)}
          onApprove={(id) => approvePlanMutation.mutate(id)}
          canEdit={canEdit}
          isAdmin={isAdmin}
          isGod={isGod}
        />
      </div>

      <div className="flex-1 flex flex-col h-full bg-navy-900/20">
        <div className="bg-navy-800/50 p-3 border-b border-navy-600 shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              DD5 Dive Plan Document
            </h2>
            <p className="text-xs text-navy-400">Live preview - updates as you describe your operation</p>
          </div>
          {planData && (
            <Button
              size="sm"
              onClick={() => savePlanMutation.mutate()}
              disabled={savePlanMutation.isPending}
              className="btn-gold-metallic hover:btn-gold-metallic text-xs"
            >
              <Save className="w-3 h-3 mr-1" />
              Save
            </Button>
          )}
        </div>
        <PlanCanvas planData={planData} isGenerating={isGenerating} />
      </div>
    </div>
  );
}
