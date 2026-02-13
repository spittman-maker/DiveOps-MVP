import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Sparkles } from "lucide-react";

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
  taskSummary?: string;
  toolsEquipment?: string;
  installMaterialIds?: string;
  qcDisposition?: string;
  verifier?: string;
  decompRequired?: string;
  decompMethod?: string;
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
  return new Date(timeStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function deriveInitials(name?: string): string {
  if (!name) return "UNKNOWN";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
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
  const [draft, setDraft] = useState(String(value ?? ""));
  const isUnknown = displayValue === "UNKNOWN" || displayValue === "Not Stated";

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== String(value ?? "")) {
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
        setDraft(String(value ?? ""));
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

  const handleSave = useCallback(
    (diveId: string, field: string, value: string) => {
      patchDive.mutate({ diveId, field, value });
    },
    [patchDive],
  );

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">
          PSG-LOG-01 — Dive Logs
        </h2>
        <p className="text-sm text-navy-400">
          {activeDay
            ? `All dives for ${activeDay.date}`
            : "Select an active day to view dive logs"}
        </p>
      </div>

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

                  {/* 5. Decompression */}
                  <SectionHeader title="Decompression" />
                  <FieldRow label="Decompression Required? (Y/N)">
                    <EditableField
                      diveId={dive.id}
                      fieldName="decompRequired"
                      value={dive.decompRequired}
                      displayValue={dive.decompRequired || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>
                  <FieldRow label="Method / Table">
                    <EditableField
                      diveId={dive.id}
                      fieldName="decompMethod"
                      value={dive.decompMethod}
                      displayValue={dive.decompMethod || "UNKNOWN"}
                      onSave={saveFn}
                    />
                  </FieldRow>

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
                                {new Date(log.eventTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
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
