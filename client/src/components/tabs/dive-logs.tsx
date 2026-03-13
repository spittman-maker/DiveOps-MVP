import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Sparkles, ChevronDown, ChevronRight, BookOpen, ArrowDown, X, Clock, Anchor, Wind, Activity, CheckCircle2, AlertTriangle, User } from "lucide-react";
import { NO_DECOM_TABLE, AIR_DECOM_TABLE, TABLE_DEPTHS, calculateEAD } from "@shared/navy-dive-tables";

interface RelatedLog {
  id: string;
  eventTime: string;
  rawText: string;
  masterLogLine?: string;
  category: string;
  station?: string;
}

interface Dive {
  id: string;
  dayId: string;
  projectId: string;
  diverId?: string;
  diverDisplayName?: string;
  diverBadgeId?: string;
  diveNumber: number;
  station?: string;
  workLocation?: string;
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  maxDepthFsw?: number;
  breathingGas?: string;
  fo2Percent?: number;
  eadFsw?: number;
  tableUsed?: string;
  scheduleUsed?: string;
  repetitiveGroup?: string;
  taskSummary?: string;
  toolsEquipment?: string;
  installMaterialIds?: string;
  qcDisposition?: string;
  verifier?: string;
  decompRequired?: string;
  decompMethod?: string;
  decompStops?: string;
  tableCitation?: string;
  postDiveStatus?: string;
  photoVideoRefs?: string;
  supervisorInitials?: string;
  notes?: string;
  relatedLogs?: RelatedLog[];
}

function calculateDiveMinutes(lsTime?: string, lbTime?: string, rsTime?: string): { minutes: number; label: string } | null {
  if (!lsTime) return null;
  const ls = new Date(lsTime).getTime();
  if (lbTime) {
    let diff = new Date(lbTime).getTime() - ls;
    if (diff < 0) diff += 24 * 60 * 60 * 1000;
    return { minutes: Math.round(diff / 60000), label: "bottom" };
  }
  if (rsTime) {
    let diff = new Date(rsTime).getTime() - ls;
    if (diff < 0) diff += 24 * 60 * 60 * 1000;
    return { minutes: Math.round(diff / 60000), label: "total" };
  }
  return null;
}

function formatTime24(timeStr?: string): string {
  if (!timeStr) return "—";
  const d = new Date(timeStr);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}${m}`;
}

function deriveInitials(name?: string): string {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getEditableValue(fieldName: string, value: string | number | undefined | null): string {
  const timeFields = ["lsTime", "rbTime", "lbTime", "rsTime"];
  if (timeFields.includes(fieldName) && value) {
    return formatTime24(String(value));
  }
  return String(value ?? "");
}

function InlineEdit({
  diveId,
  fieldName,
  value,
  displayValue,
  onSave,
  className = "",
  placeholder = "",
  missingClass = "text-amber-400/60 italic",
}: {
  diveId: string;
  fieldName: string;
  value: string | number | undefined | null;
  displayValue: string;
  onSave: (fieldName: string, value: string) => void;
  className?: string;
  placeholder?: string;
  missingClass?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isMissing = !value && value !== 0;

  const isTimeField = ["lsTime", "rbTime", "lbTime", "rsTime"].includes(fieldName);

  const commit = useCallback(() => {
    setEditing(false);
    const editVal = getEditableValue(fieldName, value);
    if (draft !== editVal) {
      if (isTimeField && draft && !/^\d{3,4}$/.test(draft.replace(":", ""))) {
        return;
      }
      onSave(fieldName, draft);
    }
  }, [draft, value, fieldName, onSave, isTimeField]);

  if (editing) {
    return (
      <input
        data-testid={`field-${fieldName}-${diveId}-input`}
        autoFocus
        className="bg-navy-900 border border-amber-400/50 text-white px-1.5 py-0.5 rounded text-xs w-full outline-none focus:border-amber-400"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      data-testid={`field-${fieldName}-${diveId}`}
      className={`cursor-pointer inline-flex items-center gap-1 group ${isMissing ? missingClass : className}`}
      onClick={() => {
        setDraft(getEditableValue(fieldName, value));
        setEditing(true);
      }}
    >
      {displayValue}
      <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

function getDiveStatus(dive: Dive): { label: string; color: string; bgColor: string } {
  if (!dive.lsTime) return { label: "PENDING", color: "text-navy-400", bgColor: "bg-navy-600/30" };
  if (dive.lsTime && !dive.rsTime && dive.lbTime) return { label: "ASCENDING", color: "text-cyan-400", bgColor: "bg-cyan-500/20" };
  if (dive.lsTime && !dive.rsTime) return { label: "IN WATER", color: "text-blue-400", bgColor: "bg-blue-500/20" };
  if (dive.rsTime && !dive.tableUsed) return { label: "NEEDS TABLE", color: "text-amber-400", bgColor: "bg-amber-500/20" };
  if (dive.decompRequired === "Y") return { label: "DECOMP REQ", color: "text-red-400", bgColor: "bg-red-500/20" };
  return { label: "COMPLETE", color: "text-green-400", bgColor: "bg-green-500/20" };
}

function getCompleteness(dive: Dive): number {
  let filled = 0;
  let total = 6;
  if (dive.diverDisplayName && dive.diverDisplayName.length > 2) filled++;
  if (dive.maxDepthFsw) filled++;
  if (dive.lsTime) filled++;
  if (dive.rsTime) filled++;
  if (dive.breathingGas) filled++;
  if (dive.tableUsed) filled++;
  return Math.round((filled / total) * 100);
}

export function DiveLogsTab() {
  const { activeDay } = useProject();
  const queryClient = useQueryClient();
  const [expandedDives, setExpandedDives] = useState<Set<string>>(new Set());
  const [showNoDecompTable, setShowNoDecompTable] = useState(false);
  const [showDecompTable, setShowDecompTable] = useState(false);
  const [showEadTable, setShowEadTable] = useState(false);
  const [showNitroxNoDTable, setShowNitroxNoDTable] = useState(false);
  const diveLogsRef = useRef<HTMLDivElement>(null);

  const anyTableOpen = showNoDecompTable || showDecompTable || showEadTable || showNitroxNoDTable;
  const closeAllTables = () => {
    setShowNoDecompTable(false);
    setShowDecompTable(false);
    setShowEadTable(false);
    setShowNitroxNoDTable(false);
  };

  const toggleExpanded = (id: string) => {
    setExpandedDives(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: dives = [], isLoading } = useQuery<Dive[]>({
    queryKey: ["/api/days", activeDay?.id, "dives"],
    queryFn: async () => {
      if (!activeDay?.id) return [];
      const res = await fetch(`/api/days/${activeDay.id}/dives`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeDay?.id,
  });

  const patchDive = useMutation({
    mutationFn: async ({ diveId, field, value }: { diveId: string; field: string; value: string }) => {
      await apiRequest("PATCH", `/api/dives/${diveId}`, { [field]: value });
    },
    onSuccess: () => {
      // Invalidate dive logs and master log so changes propagate (Bug 10, 12)
      queryClient.invalidateQueries({ queryKey: ["/api/days", activeDay?.id, "dives"] });
      queryClient.invalidateQueries({ queryKey: ["master-log", activeDay?.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const generateSummary = useMutation({
    mutationFn: async (diveId: string) => {
      await apiRequest("POST", `/api/dives/${diveId}/generate-summary`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", activeDay?.id, "dives"] });
    },
  });

  const computeTable = useMutation({
    mutationFn: async ({ diveId, breathingGas, fo2Percent }: { diveId: string; breathingGas?: string; fo2Percent?: number }) => {
      await apiRequest("POST", `/api/dives/${diveId}/compute-table`, { breathingGas, fo2Percent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/days", activeDay?.id, "dives"] });
    },
  });

  const handleSave = useCallback(
    (diveId: string, field: string, value: string) => {
      if (field === "breathingGas" || field === "fo2Percent") {
        apiRequest("PATCH", `/api/dives/${diveId}`, { [field]: value, breathingGasOverride: true }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/days", activeDay?.id, "dives"] });
        });
      } else {
        patchDive.mutate({ diveId, field, value });
      }
    },
    [patchDive, activeDay?.id, queryClient],
  );

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 data-testid="text-dive-logs-title" className="text-lg font-semibold text-white">
            ADCI Dive Log
          </h2>
          <p className="text-sm text-navy-400">
            {activeDay
              ? `${dives.length} dive${dives.length !== 1 ? "s" : ""} recorded — ${activeDay.date}`
              : "Select an active day to view dive logs"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button
            data-testid="btn-toggle-no-decomp-table"
            size="sm"
            variant="outline"
            className={`text-xs ${showNoDecompTable ? "border-amber-400 text-amber-300 bg-amber-500/10" : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`}
            onClick={() => setShowNoDecompTable(!showNoDecompTable)}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            No-D (9-7)
            {showNoDecompTable ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
          </Button>
          <Button
            data-testid="btn-toggle-decomp-table"
            size="sm"
            variant="outline"
            className={`text-xs ${showDecompTable ? "border-red-400 text-red-300 bg-red-500/10" : "border-red-500/40 text-red-400 hover:bg-red-500/10"}`}
            onClick={() => setShowDecompTable(!showDecompTable)}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            Decomp (9-8)
            {showDecompTable ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
          </Button>
          <Button
            data-testid="btn-toggle-ead-table"
            size="sm"
            variant="outline"
            className={`text-xs ${showEadTable ? "border-cyan-400 text-cyan-300 bg-cyan-500/10" : "border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"}`}
            onClick={() => setShowEadTable(!showEadTable)}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            EAD
            {showEadTable ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
          </Button>
          <Button
            data-testid="btn-toggle-nitrox-nod-table"
            size="sm"
            variant="outline"
            className={`text-xs ${showNitroxNoDTable ? "border-green-400 text-green-300 bg-green-500/10" : "border-green-500/40 text-green-400 hover:bg-green-500/10"}`}
            onClick={() => setShowNitroxNoDTable(!showNitroxNoDTable)}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            Nitrox No-D
            {showNitroxNoDTable ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
          </Button>
        </div>
      </div>

      {showNoDecompTable && (
        <Card className="bg-navy-900/80 border-amber-500/30 mb-4" data-testid="no-decomp-reference-table">
          <div className="p-3 border-b border-navy-600">
            <h3 className="text-amber-400 text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              TABLE 9-7 — No-Decompression Limits & Repetitive Group Designators
            </h3>
            <p className="text-[10px] text-navy-400 mt-0.5">
              U.S. Navy Diving Manual, Rev 7 — Verbatim. Depth in fsw. Bottom time in minutes. Group letters A–O.
            </p>
          </div>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-navy-600">
                  <th className="text-left px-2 py-1.5 text-amber-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[70px]">Depth</th>
                  <th className="text-center px-2 py-1.5 text-cyan-400 font-semibold min-w-[50px]">No-D Limit</th>
                  {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"].map(g => (
                    <th key={g} className="text-center px-1.5 py-1.5 text-navy-300 font-mono font-bold min-w-[32px]">{g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NO_DECOM_TABLE.map(row => {
                  const groupMap: Record<string, number> = {};
                  row.entries.forEach(e => { groupMap[e.group] = e.maxBottomTime; });
                  return (
                    <tr key={row.depth} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10">{row.depth} fsw</td>
                      <td className="text-center px-2 py-1.5 text-cyan-300 font-mono font-bold">{row.noStopLimit}</td>
                      {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"].map(g => (
                        <td key={g} className={`text-center px-1.5 py-1.5 font-mono ${
                          groupMap[g] != null
                            ? groupMap[g] === row.noStopLimit ? "text-cyan-300 font-bold" : "text-navy-200"
                            : "text-navy-700"
                        }`}>
                          {groupMap[g] != null ? groupMap[g] : "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {showDecompTable && (
        <Card className="bg-navy-900/80 border-red-500/30 mb-4" data-testid="decomp-reference-table">
          <div className="p-3 border-b border-navy-600">
            <h3 className="text-red-400 text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              TABLE 9-8 — U.S. Navy Standard Air Decompression Table
            </h3>
            <p className="text-[10px] text-navy-400 mt-0.5">
              U.S. Navy Diving Manual, Rev 7 — Verbatim. Depth in fsw. Bottom time & stop times in minutes. Group letters A–O.
            </p>
          </div>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-navy-600">
                  <th className="text-left px-2 py-1.5 text-red-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[70px]">Depth</th>
                  <th className="text-center px-2 py-1.5 text-navy-300 font-semibold min-w-[55px]">BT (min)</th>
                  <th className="text-center px-2 py-1.5 text-navy-300 font-semibold min-w-[110px]">Decompression Stops</th>
                  <th className="text-center px-2 py-1.5 text-cyan-400 font-semibold min-w-[65px]">Total Decomp</th>
                  <th className="text-center px-2 py-1.5 text-amber-400 font-semibold min-w-[50px]">Group</th>
                </tr>
              </thead>
              <tbody>
                {AIR_DECOM_TABLE.map(depthRow => (
                  depthRow.entries.map((entry, idx) => (
                    <tr key={`${depthRow.depth}-${entry.bottomTime}`} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      {idx === 0 ? (
                        <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10 align-top" rowSpan={depthRow.entries.length}>{depthRow.depth} fsw</td>
                      ) : null}
                      <td className="text-center px-2 py-1.5 text-white font-mono">{entry.bottomTime}</td>
                      <td className="text-center px-2 py-1.5 font-mono">
                        {entry.decompStops.length > 0 ? (
                          <span className="text-red-300">{entry.decompStops.map(s => `${s.depth}ft/${s.time}min`).join(", ")}</span>
                        ) : (
                          <span className="text-green-400">No stops</span>
                        )}
                      </td>
                      <td className={`text-center px-2 py-1.5 font-mono font-bold ${entry.totalDecompTime > 0 ? "text-red-300" : "text-green-400"}`}>
                        {entry.totalDecompTime > 0 ? `${entry.totalDecompTime} min` : "0"}
                      </td>
                      <td className="text-center px-2 py-1.5 text-amber-300 font-mono font-bold">{entry.group}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {showEadTable && (() => {
        const nitroxMixes = [
          { label: "EAN28", fo2: 0.28 }, { label: "EAN30", fo2: 0.30 }, { label: "EAN32", fo2: 0.32 },
          { label: "EAN34", fo2: 0.34 }, { label: "EAN36", fo2: 0.36 }, { label: "EAN40", fo2: 0.40 },
        ];
        const depths = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
        return (
          <Card className="bg-navy-900/80 border-cyan-500/30 mb-4" data-testid="ead-reference-table">
            <div className="p-3 border-b border-navy-600">
              <h3 className="text-cyan-400 text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4" />Equivalent Air Depth (EAD) Reference Table
              </h3>
              <p className="text-[10px] text-navy-400 mt-0.5">EAD = (D + 33) x (1 - FO2) / 0.79 - 33. Values rounded up (conservative).</p>
            </div>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-navy-600">
                    <th className="text-left px-2 py-1.5 text-cyan-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[80px]">Actual Depth</th>
                    {nitroxMixes.map(mix => (
                      <th key={mix.label} className="text-center px-3 py-1.5 min-w-[80px]">
                        <div className="text-green-400 font-bold">{mix.label}</div>
                        <div className="text-navy-400 text-[9px]">{(mix.fo2 * 100).toFixed(0)}% O2</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depths.map(depth => (
                    <tr key={depth} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10">{depth} fsw</td>
                      {nitroxMixes.map(mix => {
                        const ead = calculateEAD(depth, mix.fo2);
                        const tableDepth = TABLE_DEPTHS.find(d => d >= ead) || TABLE_DEPTHS[TABLE_DEPTHS.length - 1];
                        const benefit = depth - ead;
                        return (
                          <td key={mix.label} className="text-center px-3 py-1.5 font-mono">
                            <span className="text-cyan-300">{ead}</span>
                            <span className="text-navy-500 mx-1">→</span>
                            <span className="text-white font-bold">{tableDepth}</span>
                            {benefit > 0 && <span className="text-green-400 text-[9px] ml-1">-{benefit}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })()}

      {showNitroxNoDTable && (() => {
        const nitroxMixes = [
          { label: "Air", fo2: 0.21 }, { label: "EAN28", fo2: 0.28 }, { label: "EAN32", fo2: 0.32 },
          { label: "EAN36", fo2: 0.36 }, { label: "EAN40", fo2: 0.40 },
        ];
        const depths = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
        return (
          <Card className="bg-navy-900/80 border-green-500/30 mb-4" data-testid="nitrox-nod-reference-table">
            <div className="p-3 border-b border-navy-600">
              <h3 className="text-green-400 text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4" />Nitrox No-Decompression Limits (via EAD)
              </h3>
              <p className="text-[10px] text-navy-400 mt-0.5">No-D limits derived from EAD applied to USN Table 9-7.</p>
            </div>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-navy-600">
                    <th className="text-left px-2 py-1.5 text-green-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[80px]">Actual Depth</th>
                    {nitroxMixes.map(mix => (
                      <th key={mix.label} className="text-center px-3 py-1.5 min-w-[80px]">
                        <div className={mix.label === "Air" ? "text-navy-300 font-bold" : "text-green-400 font-bold"}>{mix.label}</div>
                        <div className="text-navy-400 text-[9px]">{(mix.fo2 * 100).toFixed(0)}% O2</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depths.map(depth => (
                    <tr key={depth} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10">{depth} fsw</td>
                      {nitroxMixes.map(mix => {
                        const ead = mix.fo2 === 0.21 ? depth : calculateEAD(depth, mix.fo2);
                        const tableDepth = TABLE_DEPTHS.find(d => d >= ead) || TABLE_DEPTHS[TABLE_DEPTHS.length - 1];
                        const noDecompRow = NO_DECOM_TABLE.find(r => r.depth === tableDepth);
                        const noStopLimit = noDecompRow ? noDecompRow.noStopLimit : 0;
                        const airRow = NO_DECOM_TABLE.find(r => r.depth === (TABLE_DEPTHS.find(d => d >= depth) || TABLE_DEPTHS[TABLE_DEPTHS.length - 1]));
                        const airLimit = airRow ? airRow.noStopLimit : 0;
                        const bonus = noStopLimit - airLimit;
                        return (
                          <td key={mix.label} className="text-center px-3 py-1.5 font-mono">
                            <span className={`font-bold ${mix.label === "Air" ? "text-navy-200" : "text-green-300"}`}>{noStopLimit}</span>
                            {mix.label !== "Air" && bonus > 0 && <span className="text-green-500 text-[9px] ml-1">+{bonus}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })()}

      {anyTableOpen && (
        <div className="flex justify-center mb-4 gap-3">
          <Button data-testid="btn-back-to-logs" size="sm" variant="outline" className="border-navy-500 text-navy-300 hover:bg-navy-700/30 text-xs" onClick={closeAllTables}>
            <X className="w-3 h-3 mr-1" />Close Tables
          </Button>
          <Button data-testid="btn-scroll-to-logs" size="sm" variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 text-xs" onClick={() => diveLogsRef.current?.scrollIntoView({ behavior: "smooth" })}>
            <ArrowDown className="w-3 h-3 mr-1" />Jump to Dive Logs
          </Button>
        </div>
      )}

      <div ref={diveLogsRef} className="space-y-3">
        {dives.map((dive) => {
          const diveMin = calculateDiveMinutes(dive.lsTime, dive.lbTime, dive.rsTime);
          const status = getDiveStatus(dive);
          const completeness = getCompleteness(dive);
          const isExpanded = expandedDives.has(dive.id);
          const saveFn = (field: string, value: string) => handleSave(dive.id, field, value);
          const initials = deriveInitials(dive.diverDisplayName);

          return (
            <Card
              key={dive.id}
              data-testid={`dive-psg-${dive.id}`}
              className="bg-navy-800/60 border-navy-600/80 overflow-hidden"
            >
              {/* Compact Header Bar */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-navy-700/30 transition-colors"
                onClick={() => toggleExpanded(dive.id)}
                data-testid={`dive-header-${dive.id}`}
              >
                {/* Dive Number Circle */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <span className="text-amber-400 font-bold text-sm font-mono">{dive.diveNumber}</span>
                </div>

                {/* Diver Name & Station */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${dive.diverDisplayName && dive.diverDisplayName.length > 2 ? "text-white" : "text-amber-400/70 italic"}`}>
                      {dive.diverDisplayName && dive.diverDisplayName.length > 2 ? dive.diverDisplayName : `Diver ${initials}`}
                    </span>
                    <span className="text-navy-500 text-xs font-mono">({initials})</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-navy-400">
                    {dive.station && <span className="flex items-center gap-1"><Anchor className="w-3 h-3" />{dive.station}</span>}
                    {dive.taskSummary && (
                      <span className="truncate max-w-[300px]">{dive.taskSummary.split("|")[0]?.trim()}</span>
                    )}
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="flex items-center gap-4 shrink-0">
                  {/* Times */}
                  <div className="text-center">
                    <div className="text-[9px] text-navy-500 uppercase tracking-wider">LS / RS</div>
                    <div className="text-xs font-mono text-white">
                      {formatTime24(dive.lsTime)} / {formatTime24(dive.rsTime)}
                    </div>
                  </div>

                  {/* Depth */}
                  <div className="text-center">
                    <div className="text-[9px] text-navy-500 uppercase tracking-wider">Depth</div>
                    <div className={`text-xs font-mono font-bold ${dive.maxDepthFsw ? "text-cyan-400" : "text-navy-500"}`}>
                      {dive.maxDepthFsw ? `${dive.maxDepthFsw} fsw` : "—"}
                    </div>
                  </div>

                  {/* Bottom Time */}
                  <div className="text-center">
                    <div className="text-[9px] text-navy-500 uppercase tracking-wider">BT</div>
                    <div className={`text-xs font-mono font-bold ${diveMin ? "text-white" : "text-navy-500"}`}>
                      {diveMin ? `${diveMin.minutes} min` : "—"}
                    </div>
                  </div>

                  {/* Gas */}
                  <div className="text-center">
                    <div className="text-[9px] text-navy-500 uppercase tracking-wider">Gas</div>
                    <div className={`text-xs font-mono ${dive.breathingGas ? "text-green-400" : "text-navy-500"}`}>
                      {dive.breathingGas === "Nitrox" && dive.fo2Percent ? `EAN${dive.fo2Percent}` : dive.breathingGas || "—"}
                    </div>
                  </div>

                  {/* Rep Group */}
                  <div className="text-center">
                    <div className="text-[9px] text-navy-500 uppercase tracking-wider">Group</div>
                    <div className={`text-sm font-mono font-bold ${dive.repetitiveGroup ? "text-amber-400" : "text-navy-500"}`}>
                      {dive.repetitiveGroup || "—"}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <Badge data-testid={`status-dive-${dive.id}`} className={`${status.bgColor} ${status.color} border-0 text-[10px] font-semibold px-2`}>
                    {status.label}
                  </Badge>

                  {/* Completeness dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${completeness >= 100 ? "bg-green-500" : completeness >= 60 ? "bg-amber-500" : "bg-red-500/60"}`} title={`${completeness}% complete`} />

                  {/* Expand/Collapse */}
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-navy-400" /> : <ChevronRight className="w-4 h-4 text-navy-400" />}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <CardContent className="pt-0 pb-4 px-4 border-t border-navy-700/50">
                  <div className="grid grid-cols-2 gap-6 mt-3">
                    {/* Left Column */}
                    <div className="space-y-4">
                      {/* Diver ID */}
                      <div>
                        <h4 className="text-[10px] text-amber-400/80 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                          <User className="w-3 h-3" />Diver Identification
                        </h4>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Name</span>
                            <InlineEdit diveId={dive.id} fieldName="diverDisplayName" value={dive.diverDisplayName} displayValue={dive.diverDisplayName || "Click to set"} onSave={saveFn} className="text-white" placeholder="Full name" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Station</span>
                            <InlineEdit diveId={dive.id} fieldName="station" value={dive.station} displayValue={dive.station || "Click to set"} onSave={saveFn} className="text-white" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Work Location</span>
                            <InlineEdit diveId={dive.id} fieldName="workLocation" value={dive.workLocation} displayValue={dive.workLocation || "Click to set"} onSave={saveFn} className="text-white" />
                          </div>
                        </div>
                      </div>

                      {/* Timekeeping */}
                      <div>
                        <h4 className="text-[10px] text-amber-400/80 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />Timekeeping (24-hr)
                        </h4>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: "LS", field: "lsTime" as const, value: dive.lsTime },
                            { label: "RB", field: "rbTime" as const, value: dive.rbTime },
                            { label: "LB", field: "lbTime" as const, value: dive.lbTime },
                            { label: "RS", field: "rsTime" as const, value: dive.rsTime },
                          ].map(t => (
                            <div key={t.field} className="bg-navy-900/60 rounded px-2 py-1.5 text-center border border-navy-700/40">
                              <div className="text-[9px] text-navy-500 uppercase">{t.label}</div>
                              <InlineEdit
                                diveId={dive.id}
                                fieldName={t.field}
                                value={t.value}
                                displayValue={formatTime24(t.value)}
                                onSave={saveFn}
                                className="text-white font-mono text-sm font-bold"
                                missingClass="text-navy-500 font-mono text-sm"
                                placeholder="HHMM"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs mt-2">
                          <span className="text-navy-400">Dive Time</span>
                          <span className={diveMin ? "text-white font-mono" : "text-navy-500"}>
                            {diveMin ? `${diveMin.minutes} min (${diveMin.label === "total" ? "LS→RS" : "LS→LB"})` : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Task / Work */}
                      <div>
                        <h4 className="text-[10px] text-amber-400/80 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                          <Activity className="w-3 h-3" />Task / Work Accomplished
                        </h4>
                        <div className="bg-navy-900/40 rounded px-3 py-2 border border-navy-700/30 text-xs">
                          <InlineEdit
                            diveId={dive.id}
                            fieldName="taskSummary"
                            value={dive.taskSummary}
                            displayValue={dive.taskSummary || "Click to add task description"}
                            onSave={saveFn}
                            className="text-navy-200"
                          />
                        </div>
                        <Button
                          data-testid={`btn-generate-summary-${dive.id}`}
                          size="sm"
                          variant="outline"
                          className="mt-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-[10px] h-6"
                          disabled={generateSummary.isPending}
                          onClick={() => generateSummary.mutate(dive.id)}
                        >
                          <Sparkles className="w-3 h-3 mr-1" />AI Summary
                        </Button>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                      {/* Dive Table & Gas */}
                      <div>
                        <h4 className="text-[10px] text-amber-400/80 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                          <Wind className="w-3 h-3" />Dive Table & Gas
                        </h4>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Max Depth</span>
                            <InlineEdit diveId={dive.id} fieldName="maxDepthFsw" value={dive.maxDepthFsw} displayValue={dive.maxDepthFsw ? `${dive.maxDepthFsw} fsw` : "Click to set"} onSave={saveFn} className="text-cyan-400 font-mono font-bold" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Breathing Gas</span>
                            <InlineEdit diveId={dive.id} fieldName="breathingGas" value={dive.breathingGas} displayValue={dive.breathingGas || "Click to set"} onSave={saveFn} className="text-green-400" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">FO2 %</span>
                            <InlineEdit diveId={dive.id} fieldName="fo2Percent" value={dive.fo2Percent} displayValue={dive.fo2Percent != null ? `${dive.fo2Percent}%` : "—"} onSave={saveFn} className="text-green-400 font-mono" />
                          </div>
                          {dive.eadFsw != null && (
                            <div className="flex justify-between text-xs">
                              <span className="text-navy-400">EAD</span>
                              <span className="text-cyan-400 font-mono">{dive.eadFsw} fsw</span>
                            </div>
                          )}
                        </div>

                        {/* Table Result Card */}
                        {dive.tableUsed ? (
                          <div className="mt-2 bg-navy-900/60 rounded border border-navy-600/50 p-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-navy-400 uppercase">Table</span>
                              <span className="text-xs text-white">{dive.tableUsed}</span>
                            </div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-navy-400 uppercase">Schedule</span>
                              <span className="text-xs text-white font-mono">{dive.scheduleUsed}</span>
                            </div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-navy-400 uppercase">Rep Group</span>
                              <span className="text-lg text-amber-400 font-bold font-mono leading-none">{dive.repetitiveGroup}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-navy-400 uppercase">Decompression</span>
                              {dive.decompRequired === "Y" ? (
                                <span className="text-red-400 font-bold text-xs flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />REQUIRED
                                </span>
                              ) : (
                                <span className="text-green-400 text-xs flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />No Stops
                                </span>
                              )}
                            </div>
                            {dive.decompStops && (
                              <div className="mt-1.5 text-red-300 font-mono text-[10px] bg-red-500/10 px-2 py-1 rounded">
                                {dive.decompStops}
                              </div>
                            )}
                            {/* Citation from USN Diving Manual */}
                            {dive.tableCitation && (() => {
                              try {
                                const cit = typeof dive.tableCitation === 'string' ? JSON.parse(dive.tableCitation) : dive.tableCitation;
                                return (
                                  <div className="mt-1.5 text-[9px] text-navy-500 border-t border-navy-700/30 pt-1">
                                    <span className="text-navy-400">Ref:</span> USN Diving Manual {cit.manualRevision}, Table {cit.tableNumber} (p. {cit.chapterPage})
                                  </div>
                                );
                              } catch { return null; }
                            })()}
                          </div>
                        ) : (
                          <Button
                            data-testid={`btn-compute-table-${dive.id}`}
                            size="sm"
                            variant="outline"
                            className="mt-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-[10px] h-6 w-full"
                            disabled={computeTable.isPending || !dive.maxDepthFsw || !dive.breathingGas}
                            onClick={() => computeTable.mutate({ diveId: dive.id, breathingGas: dive.breathingGas!, fo2Percent: dive.fo2Percent ?? undefined })}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            {!dive.maxDepthFsw ? "Set Depth First" : !dive.breathingGas ? "Set Gas First" : "Compute Table"}
                          </Button>
                        )}
                      </div>

                      {/* Post-Dive & Work Controls */}
                      <div>
                        <h4 className="text-[10px] text-amber-400/80 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" />Post-Dive & QC
                        </h4>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Post-Dive Status</span>
                            <InlineEdit diveId={dive.id} fieldName="postDiveStatus" value={dive.postDiveStatus} displayValue={dive.postDiveStatus || "OK"} onSave={saveFn} className="text-green-400" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Tools / Equipment</span>
                            <InlineEdit diveId={dive.id} fieldName="toolsEquipment" value={dive.toolsEquipment} displayValue={dive.toolsEquipment || "Click to set"} onSave={saveFn} className="text-white" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">QC Disposition</span>
                            <InlineEdit diveId={dive.id} fieldName="qcDisposition" value={dive.qcDisposition} displayValue={dive.qcDisposition || "Click to set"} onSave={saveFn} className="text-white" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Verifier</span>
                            <InlineEdit diveId={dive.id} fieldName="verifier" value={dive.verifier} displayValue={dive.verifier || "Click to set"} onSave={saveFn} className="text-white" />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-navy-400">Notes / Refs</span>
                            <InlineEdit diveId={dive.id} fieldName="notes" value={dive.notes} displayValue={dive.notes || "Click to set"} onSave={saveFn} className="text-white" />
                          </div>
                        </div>
                      </div>

                      {/* Sign-off */}
                      <div className="flex items-center gap-4 bg-navy-900/40 rounded px-3 py-2 border border-navy-700/30">
                        <div className="flex-1">
                          <div className="text-[9px] text-navy-500 uppercase">Diver</div>
                          <span className="text-white font-mono text-sm">{initials}</span>
                        </div>
                        <div className="flex-1">
                          <div className="text-[9px] text-navy-500 uppercase">Supervisor</div>
                          <InlineEdit diveId={dive.id} fieldName="supervisorInitials" value={dive.supervisorInitials} displayValue={dive.supervisorInitials || "—"} onSave={saveFn} className="text-white font-mono text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Related Logs */}
                  {dive.relatedLogs && dive.relatedLogs.length > 0 && (
                    <div className="mt-4 border-t border-navy-700/30 pt-3">
                      <h4 className="text-[10px] text-navy-500 uppercase tracking-widest mb-2">Linked Log Entries ({dive.relatedLogs.length})</h4>
                      <div className="space-y-1">
                        {dive.relatedLogs.map(log => (
                          <div key={log.id} className="flex items-center gap-2 text-[11px] bg-navy-900/30 rounded px-2 py-1">
                            <span className="text-amber-400 font-mono shrink-0">{formatTime24(log.eventTime)}</span>
                            <Badge className="text-[8px] px-1 py-0 bg-navy-700 border-0 shrink-0">{log.category === "dive_op" ? "DIVE" : log.category.toUpperCase()}</Badge>
                            <span className="text-navy-300 truncate">{log.masterLogLine || log.rawText}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completeness Bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-navy-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${completeness >= 100 ? "bg-green-500" : completeness >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${completeness}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-navy-500">{completeness}% complete</span>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {dives.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Anchor className="w-8 h-8 text-navy-600 mx-auto mb-3" />
            <p className="text-navy-400">No dives recorded today</p>
            <p className="text-sm text-navy-500 mt-1">Dive records are automatically created from log entries</p>
          </div>
        )}
      </div>
    </div>
  );
}
