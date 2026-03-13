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
  Save, Loader2, MessageSquare, Sparkles, ChevronDown, ChevronRight,
  Mic, Square, BookOpen, Library, CheckCircle2
} from "lucide-react";
import { usePTT } from "@/hooks/use-ptt";
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
  decompressionSchedules?: string;
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

        {planData.decompressionSchedules && (
          <div className="p-4 border-b border-navy-700">
            <h3 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Decompression Schedules</h3>
            <p className="text-white text-sm">{planData.decompressionSchedules}</p>
          </div>
        )}

        <div className="border-t border-navy-600 mt-2">
          <div className="p-3 bg-navy-900/30">
            <h3 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Locked Sections — Preserved from DD5 Master Template
            </h3>
            <div className="space-y-2">
              <LockedSection number="2.5" title="Applicable Codes & Standards" description="OSHA 29 CFR 1910 Subpart T, ADCI Consensus Standards, USCG regulations, EM385-1-1" />
              <LockedSection number="2.12" title="Emergency Procedures" description="Emergency action plan, evacuation routes, chamber procedures, emergency contacts, nearest hyperbaric facility" />
              <ChamberSearchButton />
              <LockedSection number="4.9" title="Pre-Dive Checklist" description="Equipment checks, communications test, gas analysis, dive supervisor briefing" />
              <LockedSection number="4.10" title="In-Water Procedures" description="Descent/ascent rates, bottom time management, decompression obligations, abort criteria" />
              <LockedSection number="4.11" title="Post-Dive Procedures" description="Diver debrief, equipment inspection, log completion, surface interval tracking" />
              <LockedSection number="4.12" title="Accident / Incident Reporting" description="Notification chain, incident documentation, near-miss reporting, OSHA recordkeeping" />
              <LockedSection number="4.13–4.18" title="Operational Safety Protocols" description="Lockout/tagout, confined space, hazardous materials, hot work permits, crane/rigging, vessel operations" />
              <LockedSection number="5.0" title="Appendices" description="USN dive tables, EM385 tables, JHA templates, equipment certifications, personnel qualifications" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LOCKED_SECTION_CONTENT: Record<string, string> = {
  "2.5": `Applicable Codes and Standards governing this dive operation:

• OSHA 29 CFR 1910 Subpart T — Commercial Diving Operations
• ADCI Consensus Standards for Commercial Diving and Underwater Operations (current edition)
• U.S. Navy Diving Manual (NAVSEA SS521-AG-PRO-010), current revision
• USACE EM 385-1-1 Safety and Health Requirements Manual
• U.S. Coast Guard regulations (33 CFR Parts 140–147) where applicable
• ANSI/ACDE-01 — American Commercial Diver Education Standards
• NFPA 70 (National Electrical Code) for underwater electrical work
• All applicable federal, state, and local regulations

Compliance with the above standards is mandatory. Where standards conflict, the more stringent requirement applies.`,

  "2.12": `Emergency Action Plan — All personnel must be briefed prior to dive operations.

1. DIVER IN DISTRESS: Pull diver immediately. Dive Supervisor assumes command. Initiate emergency ascent protocol per USN Dive Manual.
2. DECOMPRESSION SICKNESS (DCS): Administer 100% O₂ via demand mask. Contact nearest recompression chamber. Call DAN: +1-919-684-9111.
3. NEAR-DROWNING / UNCONSCIOUS DIVER: Remove from water, initiate CPR if no pulse. Call 911. Maintain O₂ administration.
4. FIRE / EXPLOSION: Evacuate all non-essential personnel. Pull divers. Activate vessel fire suppression. Call Coast Guard Ch. 16.
5. MAN OVERBOARD: Throw life ring. Mark GPS position. Assign lookout. Initiate recovery.
6. MEDICAL EMERGENCY (non-dive): Call 911. Administer first aid per trained responder. Do not move injured personnel unless in immediate danger.

Evacuation Routes: Designated muster point is [to be completed per site-specific plan].
Nearest Hospital: [to be completed per site-specific plan].
Nearest Recompression Chamber: See chamber search results above.
Emergency Contacts: Dive Supervisor, Project Manager, Client Safety Officer — see Section 2.11.`,

  "4.9": `Pre-Dive Checklist — Must be completed and signed by Dive Supervisor before any diver enters the water.

□ All diving equipment inspected and function-tested
□ Umbilical / SCUBA rig inspected for damage, kinks, and proper connections
□ Helmet / mask communications tested (both directions)
□ Breathing gas analyzed and documented (O₂%, CO%, CO₂%)
□ Standby diver dressed and ready
□ Dive Supervisor briefed all divers on task, hazards, and abort criteria
□ Emergency equipment staged and accessible (O₂ kit, first aid, throw bag)
□ Dive station exclusion zone established and communicated
□ Weather and sea state within operational limits
□ Dive tables / decompression schedule reviewed
□ All personnel aware of emergency procedures
□ Dive log opened and time recorded`,

  "4.10": `In-Water Procedures — Standard operating requirements for all dives.

• Descent Rate: Not to exceed 75 ft/min unless operationally required
• Ascent Rate: Not to exceed 30 ft/min per USN Dive Manual
• Bottom Time: Track from leaving surface to beginning final ascent
• Decompression Obligations: Strictly follow USN Table selected for depth/bottom time
• Communications: Continuous voice comms maintained throughout dive; check-in every 5 minutes minimum
• Abort Criteria: Abort dive immediately if — loss of comms, diver distress signal, equipment failure, weather deterioration, or Dive Supervisor order
• Standby Diver: Remains dressed and ready to enter water throughout all dives
• Umbilical Management: Tender maintains proper slack; no kinks or snags permitted`,

  "4.11": `Post-Dive Procedures — Required after every dive.

1. Diver surfaces and is assisted aboard; equipment secured
2. Dive Supervisor conducts post-dive debrief with diver
3. Diver monitored for DCS symptoms for minimum 1 hour post-dive
4. All equipment inspected, rinsed, and stowed
5. Breathing gas cylinders checked and logged
6. Dive log completed: RS time, max depth, bottom time, decompression completed, diver condition
7. Any equipment deficiencies reported and tagged out of service
8. Surface interval tracked for subsequent dives (repetitive dive planning)
9. Incident or near-miss reports completed if applicable`,

  "4.12": `Accident / Incident Reporting Requirements.

IMMEDIATE NOTIFICATION (within 1 hour):
• Dive Supervisor → Project Manager → Client Safety Officer
• Any injury requiring medical attention beyond first aid
• Any DCS case or pressure-related injury
• Any equipment failure that caused or could have caused injury
• Any near-miss event

OSHA RECORDKEEPING:
• OSHA 300 Log entry required for recordable incidents
• OSHA 301 Incident Report within 7 days
• Fatalities and hospitalizations: OSHA notification within 8 hours (1-800-321-OSHA)

DOCUMENTATION:
• Written incident report completed within 24 hours
• Witness statements collected
• Equipment involved tagged and preserved for investigation
• Photographs taken if safe to do so
• Root cause analysis completed within 72 hours`,

  "4.13–4.18": `Operational Safety Protocols — Applicable as required by site conditions.

§4.13 LOCKOUT/TAGOUT (LOTO): All energy sources isolated and verified zero-energy state before work begins on equipment. Written LOTO procedure required. Affected employees notified.

§4.14 CONFINED SPACE ENTRY: Permit-required confined space procedures per OSHA 29 CFR 1910.146. Atmospheric testing, ventilation, rescue plan, and attendant required.

§4.15 HAZARDOUS MATERIALS: SDS sheets on-site for all chemicals. PPE per SDS requirements. Spill containment plan in place. No hazmat disposal into waterway.

§4.16 HOT WORK PERMITS: Written permit required for all welding, cutting, and grinding operations. Fire watch for minimum 30 minutes post-work. Fire extinguisher staged at work site.

§4.17 CRANE / RIGGING OPERATIONS: Lift plan required for all lifts over 2,000 lbs or near power lines. Rigging inspected daily. Exclusion zone established. Signal person designated.

§4.18 VESSEL OPERATIONS: All vessel operators hold required USCG credentials. Pre-departure safety check completed. Navigation lights operational. PFDs accessible for all personnel.`,

  "5.0": `Appendices — The following documents are incorporated by reference and maintained on file.

Appendix A: U.S. Navy Standard Air Decompression Tables (USN Dive Manual, Rev 7)
Appendix B: USACE EM 385-1-1 Applicable Tables and Checklists
Appendix C: Job Hazard Analysis (JHA) — see Safety Tab
Appendix D: Equipment Certification Records (current)
Appendix E: Diver Qualification and Certification Records
Appendix F: Vessel Documentation and Insurance
Appendix G: Site-Specific Emergency Response Plan
Appendix H: Material Safety Data Sheets (as applicable)
Appendix I: Client-Supplied Permits and Authorizations

All appendices must be current and available for inspection at the dive site.`,
};

function LockedSection({ number, title, description }: { number: string; title: string; description: string }) {
  const [expanded, setExpanded] = useState(false);
  const fullContent = LOCKED_SECTION_CONTENT[number];

  return (
    <div className="bg-navy-800/40 border border-navy-700/50 rounded overflow-hidden">
      <button
        className="w-full px-3 py-2 flex items-start gap-3 text-left hover:bg-navy-700/20 transition-colors"
        onClick={() => setExpanded(prev => !prev)}
        title={expanded ? "Collapse section" : "Expand to read full content"}
      >
        <div className="shrink-0 mt-0.5">
          <span className="text-[10px] font-mono text-navy-500 bg-navy-800 rounded px-1.5 py-0.5 border border-navy-700">§{number}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-navy-300">{title}</p>
          <p className="text-[10px] text-navy-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-navy-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          {expanded
            ? <svg className="w-3 h-3 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            : <svg className="w-3 h-3 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          }
        </div>
      </button>
      {expanded && fullContent && (
        <div className="px-3 pb-3 border-t border-navy-700/40">
          <pre className="text-[10px] text-navy-300 leading-relaxed whitespace-pre-wrap font-sans mt-2">{fullContent}</pre>
          <p className="text-[9px] text-navy-600 mt-2 italic">Read-only — content locked per DD5 Master Template</p>
        </div>
      )}
    </div>
  );
}

interface ChamberResult {
  name: string;
  address: string;
  phone: string;
  travelTime: string;
  type: string;
  notes?: string;
}

function ChamberSearchButton() {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ChamberResult[] | null>(null);
  const { activeProject } = useProject();

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await fetch("/api/dive-plan/chamber-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          location: activeProject?.jobsiteAddress || activeProject?.jobsiteName || activeProject?.name,
          lat: activeProject?.jobsiteLat,
          lng: activeProject?.jobsiteLng,
        }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.chambers || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="ml-8 space-y-2">
      <Button
        size="sm"
        variant="outline"
        data-testid="btn-chamber-search"
        onClick={handleSearch}
        disabled={searching}
        className="border-amber-600/50 text-amber-400 hover:bg-amber-600/20 text-xs h-7"
      >
        {searching ? (
          <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Searching...</>
        ) : (
          <><Sparkles className="w-3 h-3 mr-1" /> Find Nearest Recompression Chambers</>
        )}
      </Button>
      {results !== null && (
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <p className="text-[10px] text-navy-500">No chamber data found. Contact DAN at +1-919-684-9111 for assistance.</p>
          ) : (
            results.map((chamber, i) => (
              <div key={i} className="bg-navy-800/60 border border-navy-700/50 rounded px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white">{chamber.name}</span>
                  <Badge className="text-[9px] bg-navy-700">{chamber.type}</Badge>
                </div>
                <p className="text-[10px] text-navy-400 mt-0.5">{chamber.address}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px]">
                  {chamber.phone && <span className="text-cyan-400">{chamber.phone}</span>}
                  {chamber.travelTime && <span className="text-amber-400">~{chamber.travelTime}</span>}
                </div>
                {chamber.notes && <p className="text-[9px] text-navy-500 mt-1">{chamber.notes}</p>}
              </div>
            ))
          )}
          <p className="text-[9px] text-red-400/80">DAN Emergency: +1-919-684-9111 | NEDU: 850-230-3100</p>
          <p className="text-[9px] text-navy-500">Always verify chamber availability before starting dive operations.</p>
        </div>
      )}
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
  const [pttPendingSubmit, setPttPendingSubmit] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isRecording, isTranscribing, transcript, startRecording, stopRecording } = usePTT(
    useCallback((fullText: string) => {
      setInputText(prev => prev ? prev + " " + fullText : fullText);
      setPttPendingSubmit(true);
    }, [])
  );

  const canEdit = isSupervisor || isAdmin;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore draft plan from DB on mount / project switch
  const restoredRef = useRef(false);
  useEffect(() => {
    restoredRef.current = false;
  }, [activeProject?.id]);

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

  // Restore the most recent Draft into canvas when plans load (only once per project)
  useEffect(() => {
    if (restoredRef.current) return;
    if (!projectPlans.length) return;
    if (planData) return; // don't overwrite if user already has something
    const draft = projectPlans.find(p => p.status === "Draft");
    if (draft) {
      restoredRef.current = true;
      loadPlanToCanvas(draft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPlans]);

  // Silent auto-save helper — called after every AI response
  const autoSavePlan = useCallback(async (data: AIDivePlanData) => {
    if (!activeProject?.id) return;
    setAutoSaveStatus("saving");
    try {
      const fullPlanData: ProjectDivePlanData = {
        coverPage: {
          companyName: data.coverPage?.companyName || "Precision Subsea Group LLC",
          projectTitle: data.coverPage?.projectTitle || activeProject.name || "",
          jobNumber: data.coverPage?.jobNumber || activeProject.id.substring(0, 8).toUpperCase(),
          client: data.coverPage?.client || (activeProject as any).clientName || "",
          siteLocation: data.coverPage?.siteLocation || "",
          submissionDate: data.coverPage?.submissionDate || new Date().toISOString().split("T")[0],
          revisionNumber: data.coverPage?.revisionNumber || 0,
        },
        projectContacts: {
          primeContractor: data.projectContacts?.primeContractor || "",
          siteAddress: data.projectContacts?.siteAddress || "",
          keyContacts: data.projectContacts?.keyContacts || [],
        },
        natureOfWork: { selectedTasks: data.natureOfWork?.selectedTasks || [] },
        revisionHistory: [{
          revision: 0,
          date: new Date().toISOString().split("T")[0],
          description: "AI-generated initial release",
          section: "All",
          changedBy: user?.fullName || user?.username || "System",
        }],
        scopeOfWork: data.scopeOfWork || undefined,
        divingMode: data.divingMode || undefined,
        maxDepth: data.maxDepth || undefined,
        estimatedDuration: data.estimatedDuration || undefined,
        personnelCount: data.personnelCount || undefined,
        equipmentNotes: data.equipmentNotes || undefined,
        siteConditions: data.siteConditions || undefined,
        hazardNotes: data.hazardNotes || undefined,
        additionalNotes: data.additionalNotes || undefined,
        decompressionSchedules: data.decompressionSchedules || undefined,
      };
      await fetch(`/api/projects/${activeProject.id}/project-dive-plans/autosave`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planData: fullPlanData }),
      });
      queryClient.invalidateQueries({ queryKey: ["project-dive-plans", activeProject.id] });
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    } catch {
      setAutoSaveStatus("idle");
    }
  }, [activeProject, user, queryClient]);

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
        decompressionSchedules: planData.decompressionSchedules || undefined,
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
      decompressionSchedules: data.decompressionSchedules,
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
      // BUG-LOCATION FIX: Derive siteLocation from project settings so the AI
      // doesn't invent a location from container IP / geolocation.
      // Priority: jobsiteAddress > jobsiteName > project name
      const projectJobsiteName = (activeProject as any)?.jobsiteName as string | undefined;
      const projectJobsiteAddress = (activeProject as any)?.jobsiteAddress as string | undefined;
      const derivedSiteLocation =
        projectJobsiteAddress?.trim() ||
        projectJobsiteName?.trim() ||
        activeProject?.name?.trim() ||
        "";

      const projectContext = activeProject ? {
        name: activeProject.name,
        clientName: (activeProject as any).clientName,
        jobsiteName: projectJobsiteName,
        jobsiteAddress: projectJobsiteAddress,
        jobNumber: activeProject.id.substring(0, 8).toUpperCase(),
        // Explicit hint so the AI rule "leave empty if not mentioned" doesn't blank it out
        siteLocation: derivedSiteLocation,
      } : null;

      // Also seed the current plan's siteLocation if it is blank, so the AI
      // preserves the project-derived value rather than leaving it empty.
      const seededPlanData = planData
        ? {
            ...planData,
            coverPage: {
              ...planData.coverPage,
              siteLocation:
                planData.coverPage?.siteLocation?.trim() ||
                derivedSiteLocation,
            },
          }
        : null;

      const res = await fetch("/api/dive-plan/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: newMessages.filter(m => m.id !== "loaded").map(m => ({
            role: m.role,
            content: m.role === "assistant" ? `[Previous plan update acknowledged]` : m.content,
          })),
          currentPlan: seededPlanData,
          projectContext,
        }),
      });

      if (!res.ok) throw new Error("AI generation failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantSummary = "";

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
              const summary = parsed.data?.chatSummary;
              if (summary) {
                assistantSummary = summary;
              }
              // Auto-save silently after every AI response
              autoSavePlan(parsed.data);
            }
          } catch {}
        }
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: assistantSummary || "Plan updated. Keep describing any additional details.",
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
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                {[
                  "Surface supplied, KM-37",
                  "SCUBA operation",
                  "Max depth 60 FSW",
                  "3 divers, 2 tenders",
                  "Hull inspection",
                  "Underwater welding",
                  "Pier repair",
                  "Cathodic protection survey",
                ].map((phrase) => (
                  <button
                    key={phrase}
                    data-testid={`quick-phrase-${phrase.replace(/\s+/g, "-").toLowerCase()}`}
                    onClick={() => {
                      setInputText(prev => prev ? prev + " " + phrase : phrase);
                      textareaRef.current?.focus();
                    }}
                    className="px-2 py-1 text-[10px] bg-navy-800/60 border border-navy-600 rounded text-navy-300 hover:text-white hover:border-amber-500/50 transition-colors"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-xs text-navy-500">
                <p className="bg-navy-800/50 rounded p-2 text-left">
                  "We're doing underwater welding on pier bravo at pearl harbor, 3 divers, max depth 45 feet, surface supplied"
                </p>
                <p className="bg-navy-800/50 rounded p-2 text-left">
                  "Client is NAVFAC Pacific, prime contractor is pacific shipyard. Add John Doe as safety officer 808-555-1234"
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
          {(isRecording || isTranscribing || transcript) && (
            <div className="flex items-center gap-2 mb-2 px-1">
              {isRecording && (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Recording...
                </span>
              )}
              {isTranscribing && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Transcribing...
                </span>
              )}
              {transcript && (
                <p className="text-xs text-white font-mono truncate">{transcript}</p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              data-testid="input-plan-chat"
              value={inputText}
              onChange={(e) => { setInputText(e.target.value); setPttPendingSubmit(false); }}
              onKeyDown={handleKeyDown}
              placeholder="Describe your dive operation..."
              className="bg-navy-900 border-navy-600 text-white resize-none min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={isGenerating}
            />
            <div className="flex flex-col gap-1 shrink-0">
              <Button
                data-testid="button-ptt-plan"
                onMouseDown={() => { if (!pttPendingSubmit) startRecording(); }}
                onMouseUp={() => { if (isRecording) stopRecording(); }}
                onMouseLeave={() => isRecording && stopRecording()}
                onClick={() => {
                  if (pttPendingSubmit && inputText.trim()) {
                    sendMessage();
                    setPttPendingSubmit(false);
                  }
                }}
                disabled={isTranscribing || isGenerating}
                className={`h-[44px] w-[44px] p-0 ${
                  isRecording
                    ? "bg-red-600 hover:bg-red-700"
                    : pttPendingSubmit
                      ? "bg-green-600 hover:bg-green-700 animate-pulse"
                      : "bg-orange-600 hover:bg-orange-700"
                }`}
                title={pttPendingSubmit ? "Click to send" : "Hold to talk"}
              >
                {isRecording ? <Square className="h-4 w-4" /> : pttPendingSubmit ? <Send className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              onClick={() => { sendMessage(); setPttPendingSubmit(false); }}
              disabled={!inputText.trim() || isGenerating}
              className="btn-gold-metallic hover:btn-gold-metallic shrink-0 h-[44px]"
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
            <div className="flex items-center gap-2">
              {autoSaveStatus === "saving" && (
                <span className="text-[10px] text-navy-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span className="text-[10px] text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Saved
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  // Save to library: save as draft first, then show confirmation
                  await savePlanMutation.mutateAsync();
                  toast({ title: "Saved to Library", description: "Your dive plan is now available in the Saved Plans list below." });
                }}
                disabled={savePlanMutation.isPending}
                className="border-navy-600 text-navy-300 hover:text-white text-xs"
                data-testid="button-save-to-library"
              >
                <Library className="w-3 h-3 mr-1" />
                Save to Library
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  // Export to Word: save first to get a plan ID, then download
                  try {
                    const savedPlan = await savePlanMutation.mutateAsync();
                    if (savedPlan?.id) {
                      await downloadPlan(savedPlan.id, savedPlan.revision);
                    } else {
                      // Fall back: find the draft plan and download it
                      const draft = projectPlans.find(p => p.status === "Draft");
                      if (draft) await downloadPlan(draft.id, draft.revision);
                    }
                  } catch {
                    toast({ title: "Export failed", description: "Could not export dive plan.", variant: "destructive" });
                  }
                }}
                disabled={savePlanMutation.isPending}
                className="btn-gold-metallic hover:btn-gold-metallic text-xs"
                data-testid="button-export-word"
              >
                <Download className="w-3 h-3 mr-1" />
                Export to Word
              </Button>
            </div>
          )}
        </div>
        <PlanCanvas planData={planData} isGenerating={isGenerating} />
      </div>
    </div>
  );
}
