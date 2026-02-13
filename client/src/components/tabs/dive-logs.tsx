import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Sparkles, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
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
  if (!timeStr) return "UNKNOWN";
  const d = new Date(timeStr);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function deriveInitials(name?: string): string {
  if (!name) return "UNKNOWN";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getEditableValue(fieldName: string, value: string | number | undefined | null): string {
  const timeFields = ["lsTime", "rbTime", "lbTime", "rsTime"];
  if (timeFields.includes(fieldName) && value) {
    return formatTime24(String(value)).replace(":", "");
  }
  return String(value ?? "");
}

function EditableField({
  diveId,
  fieldName,
  value,
  displayValue,
  onSave,
}: {
  diveId: string;
  fieldName: string;
  value: string | number | undefined | null;
  displayValue: string;
  onSave: (fieldName: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isUnknown = displayValue === "UNKNOWN" || displayValue === "Not Stated";
  const isTimeField = ["lsTime", "rbTime", "lbTime", "rsTime"].includes(fieldName);

  const commit = useCallback(() => {
    setEditing(false);
    const editVal = getEditableValue(fieldName, value);
    if (draft !== editVal) {
      onSave(fieldName, draft);
    }
  }, [draft, value, fieldName, onSave]);

  if (editing) {
    return (
      <input
        data-testid={`field-${fieldName}-${diveId}-input`}
        autoFocus
        className="bg-navy-900 border border-amber-400/50 text-white px-2 py-0.5 rounded text-sm w-full outline-none focus:border-amber-400"
        value={draft}
        placeholder={isTimeField ? "HHMM (e.g. 0705)" : ""}
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
      className={`cursor-pointer inline-flex items-center gap-1 group ${isUnknown ? "text-yellow-400 italic" : "text-white"}`}
      onClick={() => {
        setDraft(getEditableValue(fieldName, value));
        setEditing(true);
      }}
    >
      {displayValue}
      <Edit2 className="w-3 h-3 text-navy-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-amber-400 font-semibold text-xs uppercase tracking-wider border-b border-navy-600 pb-1 mb-2 mt-4 first:mt-0">
      {title}
    </h4>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center py-1 text-sm">
      <span className="text-navy-300">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export function DiveLogsTab() {
  const { activeDay } = useProject();
  const queryClient = useQueryClient();
  const [showNoDecompTable, setShowNoDecompTable] = useState(false);
  const [showDecompTable, setShowDecompTable] = useState(false);
  const [showEadTable, setShowEadTable] = useState(false);
  const [showNitroxNoDTable, setShowNitroxNoDTable] = useState(false);

  const { data: dives = [], isLoading } = useQuery<Dive[]>({
    queryKey: ["/api/days", activeDay?.id, "dives"],
    queryFn: async () => {
      if (!activeDay?.id) return [];
      const res = await fetch(`/api/days/${activeDay.id}/dives`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeDay?.id,
  });

  const patchDive = useMutation({
    mutationFn: async ({
      diveId,
      field,
      value,
    }: {
      diveId: string;
      field: string;
      value: string;
    }) => {
      await apiRequest("PATCH", `/api/dives/${diveId}`, { [field]: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/days", activeDay?.id, "dives"],
      });
    },
  });

  const generateSummary = useMutation({
    mutationFn: async (diveId: string) => {
      await apiRequest("POST", `/api/dives/${diveId}/generate-summary`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/days", activeDay?.id, "dives"],
      });
    },
  });

  const computeTable = useMutation({
    mutationFn: async ({ diveId, breathingGas, fo2Percent }: { diveId: string; breathingGas?: string; fo2Percent?: number }) => {
      await apiRequest("POST", `/api/dives/${diveId}/compute-table`, { breathingGas, fo2Percent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/days", activeDay?.id, "dives"],
      });
    },
  });

  const handleSave = useCallback(
    (diveId: string, field: string, value: string) => {
      patchDive.mutate({ diveId, field, value });
    },
    [patchDive],
  );

  return (
    <div className="h-full p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            PSG-LOG-01 — Dive Logs
          </h2>
          <p className="text-sm text-navy-400">
            {activeDay
              ? `All dives for ${activeDay.date}`
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
            No-D Table (9-7)
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
            Decomp Table (9-8)
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
            EAD Table
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
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-amber-400 text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              TABLE 9-7 — No-Decompression Limits & Repetitive Group Designators
            </CardTitle>
            <p className="text-[10px] text-navy-400 mt-0.5">
              U.S. Navy Diving Manual, Rev 7 — Verbatim. Depth in fsw. Bottom time in minutes. Group letters A–O.
            </p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-navy-600">
                  <th className="text-left px-2 py-1.5 text-amber-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[70px]">
                    Depth
                  </th>
                  <th className="text-center px-2 py-1.5 text-cyan-400 font-semibold min-w-[50px]">
                    No-D Limit
                  </th>
                  {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"].map(g => (
                    <th key={g} className="text-center px-1.5 py-1.5 text-navy-300 font-mono font-bold min-w-[32px]">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NO_DECOM_TABLE.map(row => {
                  const groupMap: Record<string, number> = {};
                  row.entries.forEach(e => { groupMap[e.group] = e.maxBottomTime; });
                  return (
                    <tr key={row.depth} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10">
                        {row.depth} fsw
                      </td>
                      <td className="text-center px-2 py-1.5 text-cyan-300 font-mono font-bold">
                        {row.noStopLimit}
                      </td>
                      {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O"].map(g => (
                        <td key={g} className={`text-center px-1.5 py-1.5 font-mono ${
                          groupMap[g] != null
                            ? groupMap[g] === row.noStopLimit
                              ? "text-cyan-300 font-bold"
                              : "text-navy-200"
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
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-red-400 text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              TABLE 9-8 — U.S. Navy Standard Air Decompression Table
            </CardTitle>
            <p className="text-[10px] text-navy-400 mt-0.5">
              U.S. Navy Diving Manual, Rev 7 — Verbatim. Depth in fsw. Bottom time & stop times in minutes. Group letters A–O.
            </p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-navy-600">
                  <th className="text-left px-2 py-1.5 text-red-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[70px]">
                    Depth
                  </th>
                  <th className="text-center px-2 py-1.5 text-navy-300 font-semibold min-w-[55px]">
                    BT (min)
                  </th>
                  <th className="text-center px-2 py-1.5 text-navy-300 font-semibold min-w-[110px]">
                    Decompression Stops
                  </th>
                  <th className="text-center px-2 py-1.5 text-cyan-400 font-semibold min-w-[65px]">
                    Total Decomp
                  </th>
                  <th className="text-center px-2 py-1.5 text-amber-400 font-semibold min-w-[50px]">
                    Group
                  </th>
                </tr>
              </thead>
              <tbody>
                {AIR_DECOM_TABLE.map(depthRow => (
                  depthRow.entries.map((entry, idx) => (
                    <tr key={`${depthRow.depth}-${entry.bottomTime}`} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      {idx === 0 ? (
                        <td
                          className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10 align-top"
                          rowSpan={depthRow.entries.length}
                        >
                          {depthRow.depth} fsw
                        </td>
                      ) : null}
                      <td className="text-center px-2 py-1.5 text-white font-mono">
                        {entry.bottomTime}
                      </td>
                      <td className="text-center px-2 py-1.5 font-mono">
                        {entry.decompStops.length > 0 ? (
                          <span className="text-red-300">
                            {entry.decompStops.map(s => `${s.depth}ft/${s.time}min`).join(", ")}
                          </span>
                        ) : (
                          <span className="text-green-400">No stops</span>
                        )}
                      </td>
                      <td className={`text-center px-2 py-1.5 font-mono font-bold ${
                        entry.totalDecompTime > 0 ? "text-red-300" : "text-green-400"
                      }`}>
                        {entry.totalDecompTime > 0 ? `${entry.totalDecompTime} min` : "0"}
                      </td>
                      <td className="text-center px-2 py-1.5 text-amber-300 font-mono font-bold">
                        {entry.group}
                      </td>
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
          { label: "EAN28", fo2: 0.28 },
          { label: "EAN30", fo2: 0.30 },
          { label: "EAN32", fo2: 0.32 },
          { label: "EAN34", fo2: 0.34 },
          { label: "EAN36", fo2: 0.36 },
          { label: "EAN40", fo2: 0.40 },
        ];
        const depths = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
        return (
          <Card className="bg-navy-900/80 border-cyan-500/30 mb-4" data-testid="ead-reference-table">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-cyan-400 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Equivalent Air Depth (EAD) Reference Table
              </CardTitle>
              <p className="text-[10px] text-navy-400 mt-0.5">
                EAD = (D + 33) x (1 - FO₂) / 0.79 - 33. Actual depth → EAD (fsw) → table depth used for lookup. Values rounded up (conservative).
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-navy-600">
                    <th className="text-left px-2 py-1.5 text-cyan-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[80px]">
                      Actual Depth
                    </th>
                    {nitroxMixes.map(mix => (
                      <th key={mix.label} className="text-center px-3 py-1.5 min-w-[80px]">
                        <div className="text-green-400 font-bold">{mix.label}</div>
                        <div className="text-navy-400 text-[9px]">{(mix.fo2 * 100).toFixed(0)}% O₂</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depths.map(depth => (
                    <tr key={depth} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10">
                        {depth} fsw
                      </td>
                      {nitroxMixes.map(mix => {
                        const ead = calculateEAD(depth, mix.fo2);
                        const tableDepth = TABLE_DEPTHS.find(d => d >= ead) || TABLE_DEPTHS[TABLE_DEPTHS.length - 1];
                        const benefit = depth - ead;
                        return (
                          <td key={mix.label} className="text-center px-3 py-1.5 font-mono">
                            <span className="text-cyan-300">{ead}</span>
                            <span className="text-navy-500 mx-1">→</span>
                            <span className="text-white font-bold">{tableDepth}</span>
                            {benefit > 0 && (
                              <span className="text-green-400 text-[9px] ml-1">-{benefit}</span>
                            )}
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
          { label: "Air", fo2: 0.21 },
          { label: "EAN28", fo2: 0.28 },
          { label: "EAN32", fo2: 0.32 },
          { label: "EAN36", fo2: 0.36 },
          { label: "EAN40", fo2: 0.40 },
        ];
        const depths = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
        return (
          <Card className="bg-navy-900/80 border-green-500/30 mb-4" data-testid="nitrox-nod-reference-table">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-green-400 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Nitrox No-Decompression Limits (via EAD)
              </CardTitle>
              <p className="text-[10px] text-navy-400 mt-0.5">
                No-D limits derived from EAD applied to USN Table 9-7. Actual depth → EAD → air table no-stop limit at that EAD. Compare nitrox advantage vs. air.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-navy-600">
                    <th className="text-left px-2 py-1.5 text-green-400 font-semibold sticky left-0 bg-navy-900/95 z-10 min-w-[80px]">
                      Actual Depth
                    </th>
                    {nitroxMixes.map(mix => (
                      <th key={mix.label} className="text-center px-3 py-1.5 min-w-[80px]">
                        <div className={mix.label === "Air" ? "text-navy-300 font-bold" : "text-green-400 font-bold"}>{mix.label}</div>
                        <div className="text-navy-400 text-[9px]">{(mix.fo2 * 100).toFixed(0)}% O₂</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depths.map(depth => (
                    <tr key={depth} className="border-b border-navy-700/40 hover:bg-navy-700/20">
                      <td className="px-2 py-1.5 text-white font-mono font-bold sticky left-0 bg-navy-900/95 z-10">
                        {depth} fsw
                      </td>
                      {nitroxMixes.map(mix => {
                        const ead = mix.fo2 === 0.21 ? depth : calculateEAD(depth, mix.fo2);
                        const tableDepth = TABLE_DEPTHS.find(d => d >= ead) || TABLE_DEPTHS[TABLE_DEPTHS.length - 1];
                        const noDecompRow = NO_DECOM_TABLE.find(r => r.depth === tableDepth);
                        const noStopLimit = noDecompRow ? noDecompRow.noStopLimit : 0;
                        const airRow = NO_DECOM_TABLE.find(r => r.depth === depth);
                        const airLimit = airRow ? airRow.noStopLimit : 0;
                        const bonus = noStopLimit - airLimit;
                        return (
                          <td key={mix.label} className="text-center px-3 py-1.5 font-mono">
                            <span className={`font-bold ${mix.label === "Air" ? "text-navy-200" : "text-green-300"}`}>
                              {noStopLimit}
                            </span>
                            {mix.label !== "Air" && bonus > 0 && (
                              <span className="text-green-500 text-[9px] ml-1">+{bonus}</span>
                            )}
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

      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="grid gap-6">
          {dives.map((dive) => {
            const diveMin = calculateDiveMinutes(dive.lsTime, dive.lbTime, dive.rsTime);
            const saveFn = (field: string, value: string) =>
              handleSave(dive.id, field, value);

            return (
              <Card
                key={dive.id}
                data-testid={`dive-psg-${dive.id}`}
                className="bg-navy-800/50 border-navy-600"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-base">
                      PSG-LOG-01 — Diver Entry (
                      {dive.diverDisplayName || "Unknown"})
                    </CardTitle>
                    <Badge className="btn-gold-metallic">
                      Dive #{dive.diveNumber}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {/* 1. Diver Identification */}
                  <SectionHeader title="Diver Identification" />
                  <FieldRow label="Diver Name">
                    <EditableField
                      diveId={dive.id}
                      fieldName="diverDisplayName"
                      value={dive.diverDisplayName}
                      displayValue={dive.diverDisplayName || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>

                  {/* 2. Dive Parameters */}
                  <SectionHeader title="Dive Parameters" />
                  <FieldRow label="Max Depth (fsw)">
                    <EditableField
                      diveId={dive.id}
                      fieldName="maxDepthFsw"
                      value={dive.maxDepthFsw}
                      displayValue={
                        dive.maxDepthFsw != null
                          ? String(dive.maxDepthFsw)
                          : "UNKNOWN"
                      }
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Station">
                    <EditableField
                      diveId={dive.id}
                      fieldName="station"
                      value={dive.station}
                      displayValue={dive.station || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Work Location / Scope Key">
                    <EditableField
                      diveId={dive.id}
                      fieldName="workLocation"
                      value={dive.workLocation}
                      displayValue={dive.workLocation || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>

                  {/* 3. Task / Work Accomplished */}
                  <SectionHeader title="Task / Work Accomplished" />
                  <div className="py-1 text-sm">
                    <EditableField
                      diveId={dive.id}
                      fieldName="taskSummary"
                      value={dive.taskSummary}
                      displayValue={dive.taskSummary || "UNKNOWN"}
                      onSave={saveFn}
                    />
                    <Button
                      data-testid={`btn-generate-summary-${dive.id}`}
                      size="sm"
                      variant="outline"
                      className="mt-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10 text-xs"
                      disabled={generateSummary.isPending}
                      onClick={() => generateSummary.mutate(dive.id)}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Generate AI Summary
                    </Button>
                  </div>

                  {/* 4. Timekeeping (24-hr) */}
                  <SectionHeader title="Timekeeping (24-hr)" />
                  <FieldRow label="Leave Surface (LS)">
                    <EditableField
                      diveId={dive.id}
                      fieldName="lsTime"
                      value={dive.lsTime}
                      displayValue={formatTime24(dive.lsTime)}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Reached Bottom (RB)">
                    <EditableField
                      diveId={dive.id}
                      fieldName="rbTime"
                      value={dive.rbTime}
                      displayValue={formatTime24(dive.rbTime)}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Leave Bottom (LB)">
                    <EditableField
                      diveId={dive.id}
                      fieldName="lbTime"
                      value={dive.lbTime}
                      displayValue={formatTime24(dive.lbTime)}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Reached Surface (RS)">
                    <EditableField
                      diveId={dive.id}
                      fieldName="rsTime"
                      value={dive.rsTime}
                      displayValue={formatTime24(dive.rsTime)}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Dive Time (min)">
                    <span
                      className={
                        diveMin != null
                          ? "text-white font-mono"
                          : "text-yellow-400 italic"
                      }
                    >
                      {diveMin != null
                        ? `${diveMin.minutes} min${diveMin.label === "total" ? " (LS→RS)" : " (LS→LB)"}`
                        : "UNKNOWN"}
                    </span>
                  </FieldRow>

                  {/* 5. Dive Table & Decompression */}
                  <SectionHeader title="Dive Table & Decompression" />
                  <FieldRow label="Breathing Gas">
                    <EditableField
                      diveId={dive.id}
                      fieldName="breathingGas"
                      value={dive.breathingGas}
                      displayValue={dive.breathingGas || "Air"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="FO₂ %">
                    <EditableField
                      diveId={dive.id}
                      fieldName="fo2Percent"
                      value={dive.fo2Percent}
                      displayValue={dive.fo2Percent != null ? `${dive.fo2Percent}%` : "21% (Air)"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  {dive.eadFsw != null && (
                    <FieldRow label="EAD (fsw)">
                      <span className="text-cyan-400 font-mono">{dive.eadFsw}</span>
                    </FieldRow>
                  )}
                  <FieldRow label="Table Used">
                    <span className={dive.tableUsed ? "text-white" : "text-yellow-400 italic"}>
                      {dive.tableUsed || "Not Computed"}
                    </span>
                  </FieldRow>
                  <FieldRow label="Schedule">
                    <span className={dive.scheduleUsed ? "text-white font-mono" : "text-yellow-400 italic"}>
                      {dive.scheduleUsed || "Not Computed"}
                    </span>
                  </FieldRow>
                  <FieldRow label="Repetitive Group">
                    <span className={dive.repetitiveGroup ? "text-amber-300 font-bold font-mono text-base" : "text-yellow-400 italic"}>
                      {dive.repetitiveGroup || "Not Computed"}
                    </span>
                  </FieldRow>
                  <FieldRow label="Decompression Required?">
                    <span className={
                      dive.decompRequired === "Y" ? "text-red-400 font-bold" :
                      dive.decompRequired === "N" ? "text-green-400" :
                      "text-yellow-400 italic"
                    }>
                      {dive.decompRequired === "Y" ? "YES" : dive.decompRequired === "N" ? "NO" : "UNKNOWN"}
                    </span>
                  </FieldRow>
                  {dive.decompStops && (
                    <FieldRow label="Decompression Stops">
                      <span className="text-red-300 font-mono text-xs">{dive.decompStops}</span>
                    </FieldRow>
                  )}
                  <div className="mt-2">
                    <Button
                      data-testid={`btn-compute-table-${dive.id}`}
                      size="sm"
                      variant="outline"
                      className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 text-xs"
                      disabled={computeTable.isPending || (!dive.maxDepthFsw)}
                      onClick={() => computeTable.mutate({
                        diveId: dive.id,
                        breathingGas: dive.breathingGas || "Air",
                        fo2Percent: dive.fo2Percent ?? undefined,
                      })}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {!dive.maxDepthFsw ? "Set Depth First" : "Compute Table & Schedule"}
                    </Button>
                  </div>

                  {/* 6. Post-Dive Status */}
                  <SectionHeader title="Post-Dive Status" />
                  <div className="py-1 text-sm">
                    <EditableField
                      diveId={dive.id}
                      fieldName="postDiveStatus"
                      value={dive.postDiveStatus}
                      displayValue={
                        dive.postDiveStatus ||
                        "OK (default; no issues logged)"
                      }
                      onSave={saveFn}
                    />
                  </div>

                  {/* 7. Work Controls */}
                  <SectionHeader title="Work Controls" />
                  <FieldRow label="Tools / Equipment Used">
                    <EditableField
                      diveId={dive.id}
                      fieldName="toolsEquipment"
                      value={dive.toolsEquipment}
                      displayValue={dive.toolsEquipment || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Install / Material IDs">
                    <EditableField
                      diveId={dive.id}
                      fieldName="installMaterialIds"
                      value={dive.installMaterialIds}
                      displayValue={dive.installMaterialIds || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="QC Disposition">
                    <EditableField
                      diveId={dive.id}
                      fieldName="qcDisposition"
                      value={dive.qcDisposition}
                      displayValue={dive.qcDisposition || "Not Stated"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Verifier">
                    <EditableField
                      diveId={dive.id}
                      fieldName="verifier"
                      value={dive.verifier}
                      displayValue={dive.verifier || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Photo / Video / File Refs">
                    <EditableField
                      diveId={dive.id}
                      fieldName="photoVideoRefs"
                      value={dive.photoVideoRefs}
                      displayValue={dive.photoVideoRefs || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>

                  {/* 8. Sign-off */}
                  <SectionHeader title="Sign-off" />
                  <FieldRow label="Diver Initials">
                    <span className={dive.diverDisplayName ? "text-white" : "text-yellow-400 italic"}>
                      {deriveInitials(dive.diverDisplayName)}
                    </span>
                  </FieldRow>
                  <FieldRow label="Supervisor Initials">
                    <EditableField
                      diveId={dive.id}
                      fieldName="supervisorInitials"
                      value={dive.supervisorInitials}
                      displayValue={dive.supervisorInitials || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>

                  {dive.relatedLogs && dive.relatedLogs.length > 0 && (
                    <>
                      <SectionHeader title="Linked Log Entries" />
                      <div className="space-y-1.5 py-1">
                        {dive.relatedLogs.map(log => (
                          <div key={log.id} className="bg-navy-900/50 rounded px-3 py-2 border border-navy-700/50">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-amber-400 font-mono text-[10px]">
                                {formatTime24(log.eventTime)}
                              </span>
                              <Badge className="text-[9px] px-1 py-0 bg-navy-600">{log.category === "dive_op" ? "DIVE" : log.category}</Badge>
                              {log.station && <span className="text-[9px] text-cyan-400/60">{log.station}</span>}
                            </div>
                            {log.masterLogLine ? (
                              <div>
                                <p className="text-xs text-navy-200 italic">{log.masterLogLine}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  <span className="text-[9px] text-navy-500">AI processed</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-white/70 font-mono">{log.rawText}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {dives.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <p className="text-navy-400">No dives recorded today</p>
              <p className="text-sm text-navy-500 mt-1">
                Dive records are automatically created from log entries
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
