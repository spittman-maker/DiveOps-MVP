import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";

interface MasterLogEntry {
  id: string;
  eventTime: string;
  rawText: string;
  masterLogLine: string;
  status: string;
  station?: string;
  category?: string;
}

interface DiveRecord {
  id: string;
  diveNumber: number;
  diverId: string;
  diverName?: string;
  diverDisplayName?: string;
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  maxDepthFsw?: number;
  tableUsed?: string;
  scheduleUsed?: string;
  breathingGas?: string;
  taskSummary?: string;
  station?: string;
}

interface MasterLogData {
  day: {
    id: string;
    date: string;
    status: string;
    shift?: string;
  };
  isLocked: boolean;
  isDraft: boolean;
  sections: {
    ops: MasterLogEntry[];
    dive: MasterLogEntry[];
    directives: MasterLogEntry[];
    safety: MasterLogEntry[];
    risk: MasterLogEntry[];
  };
  stationLogs?: Array<{ station: string; entries: MasterLogEntry[] }>;
  directiveEntries?: MasterLogEntry[];
  conflictEntries?: MasterLogEntry[];
  operationalNotes?: MasterLogEntry[];
  riskEntries?: MasterLogEntry[];
  risks?: Array<{ id: string; riskId: string; description: string; status: string; owner: string; category: string; riskLevel?: string }>;
  dives?: DiveRecord[];
  summary?: {
    totalDives: number;
    totalDivers: number;
    maxDepth: number;
    safetyIncidents: number;
    directivesCount: number;
    extractedDiverInitials?: string[];
  };
}

export function MasterLogTab() {
  const { activeDay } = useProject();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    dayShift: true,
    email: true,
    nightShift: true,
    diveStation: true,
    notes: true,
    qcCloseout: true,
    advisory: true,
    risks: true,
  });

  const { data, isLoading } = useQuery<MasterLogData | null>({
    queryKey: ["master-log", activeDay?.id],
    queryFn: async () => {
      if (!activeDay?.id) return null;
      const res = await fetch(`/api/days/${activeDay.id}/master-log`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!activeDay?.id,
    refetchInterval: 5000,
  });

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "----";
    const d = new Date(dateStr);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}${m}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const sections = data?.sections || { ops: [], dive: [], directives: [], safety: [], risk: [] };
  const summary = data?.summary || { totalDives: 0, totalDivers: 0, maxDepth: 0, safetyIncidents: 0, directivesCount: 0 };
  const dives = data?.dives || [];
  const stationLogs = data?.stationLogs || [];
  const directiveEntries = data?.directiveEntries || sections.directives;
  const conflictEntries = data?.conflictEntries || [];
  const risks = data?.risks || [];
  const riskEntries = data?.riskEntries || sections.risk;

  // Split ops entries into day shift (before 18:00) and night shift (18:00+)
  const dayShiftOps = sections.ops.filter(e => {
    const h = e.eventTime ? new Date(e.eventTime).getHours() : 6;
    return h < 18;
  });
  const nightShiftOps = sections.ops.filter(e => {
    const h = e.eventTime ? new Date(e.eventTime).getHours() : 6;
    return h >= 18;
  });

  // Email coordination entries (directives are often email-based)
  const emailEntries = directiveEntries;

  const hasAnyContent = sections.ops.length > 0 || sections.dive.length > 0 || 
    sections.directives.length > 0 || sections.safety.length > 0 || dives.length > 0 || stationLogs.length > 0;

  const SectionHeader = ({ title, sectionKey, count }: { title: string; sectionKey: string; count?: number }) => (
    <div 
      className="flex items-center gap-2 cursor-pointer select-none" 
      onClick={() => toggleSection(sectionKey)}
    >
      {expandedSections[sectionKey] ? (
        <ChevronDown className="w-4 h-4 text-amber-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-amber-400" />
      )}
      <h3 className="text-base font-bold text-amber-400 uppercase tracking-wide">{title}</h3>
      {count !== undefined && count > 0 && (
        <Badge variant="outline" className="text-xs border-navy-500 text-navy-400 ml-2">
          {count}
        </Badge>
      )}
    </div>
  );

  const NarrativeEntry = ({ entry }: { entry: MasterLogEntry }) => (
    <div className="flex gap-3 py-1.5 border-b border-navy-700/30 last:border-0">
      <span className="text-sm font-mono text-amber-500/80 w-14 shrink-0 font-semibold">
        {formatTime(entry.eventTime)}
      </span>
      <p className="text-sm text-navy-100 leading-relaxed">{entry.masterLogLine || entry.rawText}</p>
    </div>
  );

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="p-4 border-b border-navy-600 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">Master Log - 24-Hour Operations Record</h2>
          <p className="text-sm text-navy-400">
            Narrative-based operational log - {formatDate(data?.day?.date)}
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2">
            <Badge className={data.isLocked ? "bg-red-600" : "bg-green-600"}>
              {data.isLocked ? "LOCKED" : "DRAFT"}
            </Badge>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6 print:space-y-4">
          {/* Document Header */}
          <header className="text-center border-b-2 border-amber-500/30 pb-6">
            <h1 className="text-2xl font-bold text-amber-400 mb-1">24-HOUR DAILY OPERATIONS LOG</h1>
            <p className="text-lg text-navy-200 font-semibold">{formatDate(data?.day?.date)}</p>
            {data?.day?.shift && (
              <p className="text-sm text-navy-400 mt-1">Shift {data.day.shift}</p>
            )}
            <p className="text-xs text-navy-500 mt-2">DiveOps Automated Operations Record</p>
          </header>

          {/* 24-Hour Summary Narrative */}
          <section data-testid="section-summary">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <CardTitle className="text-amber-400 text-base">EXECUTIVE SUMMARY</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-navy-100 leading-relaxed">
                  {summary.totalDives > 0 ? (
                    <>
                      On {formatDate(data?.day?.date)}, diving operations were conducted with{' '}
                      <strong>{summary.totalDives} dive(s)</strong> completed by{' '}
                      <strong>{summary.totalDivers} diver(s)</strong>.
                      {summary.maxDepth > 0 && (
                        <> Maximum depth reached was <strong>{summary.maxDepth} FSW</strong>.</>
                      )}
                      {summary.directivesCount > 0 && (
                        <> <strong>{summary.directivesCount} client directive(s)</strong> were received and actioned.</>
                      )}
                      {summary.safetyIncidents > 0 ? (
                        <> <span className="text-yellow-400"><strong>{summary.safetyIncidents} safety event(s)</strong> were logged and addressed.</span></>
                      ) : (
                        <> No safety incidents were reported. All operations conducted in accordance with applicable standards.</>
                      )}
                    </>
                  ) : (
                    <span className="text-navy-400 italic">
                      Summary will be generated as operations are logged throughout the day.
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          </section>

          {/* 1. Day Shift Operations */}
          <section data-testid="section-day-shift">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="Day Shift Operations" sectionKey="dayShift" count={dayShiftOps.length} />
              </CardHeader>
              {expandedSections.dayShift && (
                <CardContent>
                  {dayShiftOps.length > 0 ? (
                    <div className="space-y-0">
                      {dayShiftOps.map((entry) => (
                        <NarrativeEntry key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-navy-500 text-sm italic">No day shift operations logged</p>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          {/* 2. Email Coordination / Client Directives */}
          <section data-testid="section-email-coordination">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="Email Coordination / Client Directives" sectionKey="email" count={emailEntries.length} />
              </CardHeader>
              {expandedSections.email && (
                <CardContent>
                  {emailEntries.length > 0 ? (
                    <div className="space-y-0">
                      {emailEntries.map((entry, idx) => (
                        <div key={entry.id} className="flex gap-3 py-1.5 border-b border-navy-700/30 last:border-0">
                          <Badge className="bg-purple-600 text-[10px] px-1.5 py-0 font-mono shrink-0 mt-0.5">
                            CD-{String(idx + 1).padStart(3, "0")}
                          </Badge>
                          <span className="text-sm font-mono text-amber-500/80 w-14 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-sm text-navy-100 leading-relaxed">{entry.masterLogLine}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-navy-500 text-sm italic">No email coordination or client directives logged</p>
                  )}
                  {conflictEntries.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-navy-600">
                      <h4 className="text-xs font-bold text-yellow-400 uppercase mb-2">Conflicting / Reversed Direction</h4>
                      {conflictEntries.map((entry) => (
                        <div key={entry.id} className="flex gap-3 py-1">
                          <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-sm text-yellow-200">{entry.masterLogLine}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          {/* 3. Night Shift Operations */}
          <section data-testid="section-night-shift">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="Night Shift Operations" sectionKey="nightShift" count={nightShiftOps.length} />
              </CardHeader>
              {expandedSections.nightShift && (
                <CardContent>
                  {nightShiftOps.length > 0 ? (
                    <div className="space-y-0">
                      {nightShiftOps.map((entry) => (
                        <NarrativeEntry key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-navy-500 text-sm italic">No night shift operations logged</p>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          {/* 4. Dive Station Logs */}
          <section data-testid="section-dive-station-logs">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="Dive Station Logs" sectionKey="diveStation" count={dives.length} />
              </CardHeader>
              {expandedSections.diveStation && (
                <CardContent className="space-y-4">
                  {/* Dive Operations Table */}
                  {dives.length > 0 && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-navy-600 hover:bg-transparent">
                            <TableHead className="text-navy-300 text-xs">Dive #</TableHead>
                            <TableHead className="text-navy-300 text-xs">Diver</TableHead>
                            <TableHead className="text-navy-300 text-xs">Station</TableHead>
                            <TableHead className="text-navy-300 text-xs">L/S</TableHead>
                            <TableHead className="text-navy-300 text-xs">R/B</TableHead>
                            <TableHead className="text-navy-300 text-xs">L/B</TableHead>
                            <TableHead className="text-navy-300 text-xs">R/S</TableHead>
                            <TableHead className="text-navy-300 text-xs">Depth</TableHead>
                            <TableHead className="text-navy-300 text-xs">Table</TableHead>
                            <TableHead className="text-navy-300 text-xs">Gas</TableHead>
                            <TableHead className="text-navy-300 text-xs">Task</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dives.map((dive) => (
                            <TableRow key={dive.id} className="border-navy-700 hover:bg-navy-700/30">
                              <TableCell className="text-white font-mono text-xs">#{dive.diveNumber}</TableCell>
                              <TableCell className="text-navy-100 text-xs">{dive.diverDisplayName || dive.diverName || dive.diverId}</TableCell>
                              <TableCell className="text-navy-100 text-xs">{dive.station || '--'}</TableCell>
                              <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.lsTime)}</TableCell>
                              <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.rbTime)}</TableCell>
                              <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.lbTime)}</TableCell>
                              <TableCell className="text-navy-100 font-mono text-xs">{formatTime(dive.rsTime)}</TableCell>
                              <TableCell className="text-navy-100 font-mono text-xs">
                                {dive.maxDepthFsw ? `${dive.maxDepthFsw} FSW` : '--'}
                              </TableCell>
                              <TableCell className="text-navy-100 text-xs">{dive.tableUsed || '--'}</TableCell>
                              <TableCell className="text-navy-100 text-xs">{dive.breathingGas || '--'}</TableCell>
                              <TableCell className="text-navy-100 text-xs max-w-[200px] truncate">{dive.taskSummary || '--'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Station-specific narrative logs */}
                  {stationLogs.length > 0 && (
                    <div className="space-y-3 pt-3 border-t border-navy-600">
                      <h4 className="text-sm font-semibold text-amber-400/80">Station Activity Narrative</h4>
                      {stationLogs.map((stationLog) => (
                        <div key={stationLog.station} className="bg-navy-700/30 rounded p-3">
                          <h5 className="text-sm font-bold text-cyan-400 mb-2">{stationLog.station}</h5>
                          <div className="space-y-0">
                            {stationLog.entries.map((entry) => (
                              <NarrativeEntry key={entry.id} entry={entry} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dive-related event log entries */}
                  {sections.dive.length > 0 && stationLogs.length === 0 && (
                    <div className="space-y-0">
                      {sections.dive.map((entry) => (
                        <NarrativeEntry key={entry.id} entry={entry} />
                      ))}
                    </div>
                  )}

                  {dives.length === 0 && sections.dive.length === 0 && stationLogs.length === 0 && (
                    <p className="text-navy-500 text-sm italic">No dive operations logged</p>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          {/* 5. Notes */}
          <section data-testid="section-notes">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="Notes" sectionKey="notes" count={sections.safety.length} />
              </CardHeader>
              {expandedSections.notes && (
                <CardContent>
                  {sections.safety.length > 0 ? (
                    <div className="space-y-0">
                      {sections.safety.map((entry) => (
                        <NarrativeEntry key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-navy-500 text-sm italic">No safety notes or observations logged</p>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          {/* 6. QC Closeout */}
          <section data-testid="section-qc-closeout">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="QC Closeout" sectionKey="qcCloseout" />
              </CardHeader>
              {expandedSections.qcCloseout && (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-navy-700/30 rounded p-3">
                      <h4 className="text-xs font-semibold text-navy-400 mb-1 uppercase">Scope Complete</h4>
                      <p className="text-sm text-navy-300 italic">
                        {data?.isLocked ? "Yes - Day closed" : "Pending - Day still open"}
                      </p>
                    </div>
                    <div className="bg-navy-700/30 rounded p-3">
                      <h4 className="text-xs font-semibold text-navy-400 mb-1 uppercase">Documentation Complete</h4>
                      <p className="text-sm text-navy-300 italic">
                        {data?.isLocked ? "Yes - All logs finalized" : "In progress"}
                      </p>
                    </div>
                    <div className="bg-navy-700/30 rounded p-3">
                      <h4 className="text-xs font-semibold text-navy-400 mb-1 uppercase">Exceptions</h4>
                      <p className="text-sm text-navy-300 italic">
                        {conflictEntries.length > 0 ? `${conflictEntries.length} conflict(s) noted` : "None"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </section>

          {/* 7. SEI Advisories */}
          <section data-testid="section-advisory">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-2">
                <SectionHeader title="SEI Advisories" sectionKey="advisory" />
              </CardHeader>
              {expandedSections.advisory && (
                <CardContent>
                  <div className="space-y-3">
                    <div className="bg-navy-700/30 rounded p-3">
                      <h4 className="text-xs font-semibold text-navy-400 mb-1">Advised For</h4>
                      <p className="text-sm text-navy-300 italic">
                        {summary.totalDives > 0 
                          ? `Continued diving operations. ${summary.totalDives} dive(s) completed safely.`
                          : "No specific advisories"
                        }
                      </p>
                    </div>
                    <div className="bg-navy-700/30 rounded p-3">
                      <h4 className="text-xs font-semibold text-navy-400 mb-1">Advised Against</h4>
                      <p className="text-sm text-navy-300 italic">
                        {summary.safetyIncidents > 0 
                          ? `${summary.safetyIncidents} safety concern(s) flagged - see Notes section`
                          : "No adverse advisories"
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </section>

          {/* 8. Standing Risks */}
          <section data-testid="section-standing-risks">
            <Card className="bg-navy-800/50 border-orange-900/50">
              <CardHeader className="pb-2">
                <SectionHeader title="Standing Risks" sectionKey="risks" count={risks.length || riskEntries.length} />
              </CardHeader>
              {expandedSections.risks && (
                <CardContent>
                  {risks.length > 0 ? (
                    <div className="space-y-2">
                      {risks.map((risk) => (
                        <div key={risk.id} className="flex gap-3 py-2 border-b border-navy-700/30 last:border-0 items-start">
                          <div className="flex gap-1.5 shrink-0">
                            <Badge className={`text-[10px] ${
                              risk.riskLevel === 'high' ? 'bg-red-600' : 
                              risk.riskLevel === 'med' ? 'bg-yellow-600' : 
                              'bg-green-600'
                            }`}>
                              {(risk.riskLevel || 'med').toUpperCase()}
                            </Badge>
                            <Badge className={`text-[10px] ${
                              risk.status === 'open' ? 'bg-red-700' : 
                              risk.status === 'mitigated' ? 'bg-yellow-700' : 
                              'bg-green-700'
                            }`}>
                              {risk.status.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-orange-200">{risk.description}</p>
                            <p className="text-xs text-navy-500 mt-0.5">
                              {risk.riskId} | Owner: {risk.owner || 'Unassigned'} | Category: {risk.category}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : riskEntries.length > 0 ? (
                    <div className="space-y-0">
                      {riskEntries.map((entry) => (
                        <NarrativeEntry key={entry.id} entry={entry} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-navy-500 text-sm italic">No standing risks identified</p>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          {!isLoading && !hasAnyContent && (
            <div className="text-center py-12">
              <p className="text-navy-400">No log entries yet for this day</p>
              <p className="text-sm text-navy-500 mt-1">
                The master log will populate as entries are added to the Daily Log.
                Sections: Day Shift Operations, Email Coordination, Night Shift Operations, 
                Dive Station Logs, Notes, QC Closeout, SEI Advisories, and Standing Risks.
              </p>
            </div>
          )}

          <footer className="text-center border-t border-navy-600 pt-6 mt-8">
            <p className="text-xs text-navy-500">
              This 24-hour operations log is auto-generated from the DiveOps event stream. 
              All times are local. Document status: {data?.isLocked ? "LOCKED" : "DRAFT"}.
            </p>
            <p className="text-xs text-navy-600 mt-1">
              Sections: Day Shift Ops | Email Coordination | Night Shift Ops | Dive Station Logs | Notes | QC Closeout | SEI Advisories | Standing Risks
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
