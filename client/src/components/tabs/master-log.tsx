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
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  maxDepthFsw?: number;
}

interface MasterLogData {
  day: {
    id: string;
    date: string;
    status: string;
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
  risks?: Array<{ id: string; riskId: string; description: string; status: string; owner: string; category: string }>;
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
  const [expandedStations, setExpandedStations] = useState<Record<string, boolean>>({});

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
    if (!dateStr) return "--:--";
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
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

  const toggleStation = (station: string) => {
    setExpandedStations(prev => ({ ...prev, [station]: !prev[station] }));
  };

  const sections = data?.sections || { ops: [], dive: [], directives: [], safety: [], risk: [] };
  const summary = data?.summary || { totalDives: 0, totalDivers: 0, maxDepth: 0, safetyIncidents: 0, directivesCount: 0 };
  const dives = data?.dives || [];
  const stationLogs = data?.stationLogs || [];
  const directiveEntries = data?.directiveEntries || sections.directives;
  const conflictEntries = data?.conflictEntries || [];
  const risks = data?.risks || [];
  const riskEntries = data?.riskEntries || sections.risk;

  const hasAnyContent = sections.ops.length > 0 || sections.dive.length > 0 || 
    sections.directives.length > 0 || sections.safety.length > 0 || dives.length > 0 || stationLogs.length > 0;

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="p-4 border-b border-navy-600 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">Master Log Document</h2>
          <p className="text-sm text-navy-400">
            Official client-facing operations record - {formatDate(data?.day?.date)}
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
        <div className="max-w-4xl mx-auto space-y-8 print:space-y-6">
          <header className="text-center border-b border-navy-600 pb-6">
            <h1 className="text-2xl font-bold text-amber-400 mb-2">DAILY OPERATIONS MASTER LOG</h1>
            <p className="text-lg text-navy-300">{formatDate(data?.day?.date)}</p>
            <p className="text-sm text-navy-400 mt-1">Precision Subsea Group LLC - DiveOps™</p>
          </header>

          {/* 1. 24-Hour Summary */}
          <section data-testid="section-summary">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-amber-400 text-base">24-Hour Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-navy-100 leading-relaxed">
                  {summary.totalDives > 0 ? (
                    <>
                      On {formatDate(data?.day?.date)}, diving operations were conducted with{' '}
                      <strong>{summary.totalDives} dive(s)</strong> completed by{' '}
                      <strong>{summary.totalDivers} diver(s)</strong>.
                      {summary.maxDepth > 0 && (
                        <> Maximum depth reached was <strong>{summary.maxDepth} fsw</strong>.</>
                      )}
                      {summary.directivesCount > 0 && (
                        <> <strong>{summary.directivesCount} client directive(s)</strong> were received and actioned.</>
                      )}
                      {summary.safetyIncidents > 0 ? (
                        <> <span className="text-yellow-400"><strong>{summary.safetyIncidents} safety incident(s)</strong> were logged.</span></>
                      ) : (
                        <> No safety incidents were reported.</>
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

          {/* 2. Client Directives */}
          <section data-testid="section-directives">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-600" />
                  <CardTitle className="text-amber-400 text-base">Client Directives and Changes</CardTitle>
                  {directiveEntries.length > 0 && (
                    <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                      {directiveEntries.length} entries
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {directiveEntries.length > 0 ? (
                  <ul className="space-y-2">
                    {directiveEntries.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-navy-100">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-navy-500 text-sm italic">No client directives logged</p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 3. Conflicting Direction */}
          <section data-testid="section-conflicts">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-amber-400 text-base">CONFLICTING DIRECTION / REVERSED DIRECTION</CardTitle>
              </CardHeader>
              <CardContent>
                {conflictEntries.length > 0 ? (
                  <ul className="space-y-2">
                    {conflictEntries.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-yellow-200">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-navy-500 text-sm italic">None identified</p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 4. Operational Notes */}
          <section data-testid="section-ops-notes">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-teal-600" />
                  <CardTitle className="text-amber-400 text-base">Operational Notes</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {sections.ops.length > 0 ? (
                  <ul className="space-y-2">
                    {sections.ops.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-navy-100">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-navy-500 text-sm italic">No operational notes logged</p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 5. Station Logs */}
          {stationLogs.length > 0 && (
            <section data-testid="section-station-logs">
              <h3 className="text-lg font-semibold text-amber-400 mb-4 border-b border-navy-600 pb-2">
                Station Logs
              </h3>
              <div className="space-y-4">
                {stationLogs.map((stationLog) => (
                  <Card key={stationLog.station} className="bg-navy-700/50 border-navy-500">
                    <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleStation(stationLog.station)}>
                      <div className="flex items-center gap-2">
                        {expandedStations[stationLog.station] !== false ? (
                          <ChevronDown className="w-4 h-4 text-amber-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-amber-400" />
                        )}
                        <CardTitle className="text-white text-base">{stationLog.station}</CardTitle>
                        <Badge variant="outline" className="text-xs border-cyan-600 text-cyan-400">
                          {stationLog.entries.length} entries
                        </Badge>
                      </div>
                    </CardHeader>
                    {expandedStations[stationLog.station] !== false && (
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold text-amber-400/80 mb-2">Work Executed</h4>
                          <ul className="space-y-1.5">
                            {stationLog.entries.map((entry) => (
                              <li key={entry.id} className="flex gap-3 py-0.5">
                                <span className="text-xs font-mono text-navy-400 w-14 shrink-0">
                                  {formatTime(entry.eventTime)}
                                </span>
                                <p className="text-sm text-navy-100">{entry.masterLogLine}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-navy-600">
                          <div>
                            <h4 className="text-xs font-semibold text-navy-400 mb-1">Production Notes</h4>
                            <p className="text-xs text-navy-500 italic">Not captured</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-navy-400 mb-1">Constraints</h4>
                            <p className="text-xs text-navy-500 italic">Not captured</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-navy-400 mb-1">QA/QC</h4>
                            <p className="text-xs text-navy-500 italic">Not captured</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-navy-400 mb-1">Carryover</h4>
                            <p className="text-xs text-navy-500 italic">Not captured</p>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* 6. Dive Operations Table */}
          {dives.length > 0 && (
            <section data-testid="section-dive-table">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full btn-gold-metallic" />
                    <CardTitle className="text-amber-400 text-base">Dive Operations Log</CardTitle>
                    <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                      {dives.length} dives
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-navy-600 hover:bg-transparent">
                        <TableHead className="text-navy-300">Dive #</TableHead>
                        <TableHead className="text-navy-300">Diver</TableHead>
                        <TableHead className="text-navy-300">L/S</TableHead>
                        <TableHead className="text-navy-300">R/B</TableHead>
                        <TableHead className="text-navy-300">L/B</TableHead>
                        <TableHead className="text-navy-300">R/S</TableHead>
                        <TableHead className="text-navy-300">Depth</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dives.map((dive) => (
                        <TableRow key={dive.id} className="border-navy-700 hover:bg-navy-700/30">
                          <TableCell className="text-white font-mono">#{dive.diveNumber}</TableCell>
                          <TableCell className="text-navy-100">{dive.diverName || dive.diverId}</TableCell>
                          <TableCell className="text-navy-100 font-mono">{formatTime(dive.lsTime)}</TableCell>
                          <TableCell className="text-navy-100 font-mono">{formatTime(dive.rbTime)}</TableCell>
                          <TableCell className="text-navy-100 font-mono">{formatTime(dive.lbTime)}</TableCell>
                          <TableCell className="text-navy-100 font-mono">{formatTime(dive.rsTime)}</TableCell>
                          <TableCell className="text-navy-100 font-mono">
                            {dive.maxDepthFsw ? `${dive.maxDepthFsw} fsw` : '--'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </section>
          )}

          {/* 7. Risk Register */}
          <section data-testid="section-risk">
            <Card className="bg-navy-800/50 border-orange-900/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-600" />
                  <CardTitle className="text-amber-400 text-base">Risk Register Updates</CardTitle>
                  {(risks.length > 0 || riskEntries.length > 0) && (
                    <Badge className="bg-orange-600 text-xs">
                      {risks.length || riskEntries.length} items
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {risks.length > 0 ? (
                  <ul className="space-y-2">
                    {risks.map((risk) => (
                      <li key={risk.id} className="flex gap-3 py-1 items-start">
                        <Badge className={`text-xs shrink-0 ${risk.status === 'OPEN' ? 'bg-red-600' : risk.status === 'MITIGATED' ? 'bg-yellow-600' : 'bg-green-600'}`}>
                          {risk.status}
                        </Badge>
                        <div>
                          <p className="text-sm text-orange-200">{risk.description}</p>
                          <p className="text-xs text-navy-500">Owner: {risk.owner} | Category: {risk.category}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : riskEntries.length > 0 ? (
                  <ul className="space-y-2">
                    {riskEntries.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-orange-200">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-navy-500 text-sm italic">No risk items logged</p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 8. Advisory Block */}
          <section data-testid="section-advisory">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-amber-400 text-base">Advisory Block</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-navy-400 mb-1">Advised For</h4>
                    <p className="text-sm text-navy-500 italic">Not provided</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-navy-400 mb-1">Advised Against</h4>
                    <p className="text-sm text-navy-500 italic">Not provided</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-navy-400 mb-1">Outcome</h4>
                    <p className="text-sm text-navy-500 italic">Not provided</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 9. Closeout Block */}
          <section data-testid="section-closeout">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-amber-400 text-base">Closeout Block</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-navy-400 mb-1">Scope Complete</h4>
                    <p className="text-sm text-navy-500 italic">Not provided</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-navy-400 mb-1">Documentation Complete</h4>
                    <p className="text-sm text-navy-500 italic">Not provided</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-navy-400 mb-1">Exceptions</h4>
                    <p className="text-sm text-navy-500 italic">Not provided</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {!isLoading && !hasAnyContent && (
            <div className="text-center py-12">
              <p className="text-navy-400">No log entries yet for this day</p>
              <p className="text-sm text-navy-500 mt-1">
                The master log document will populate as entries are added to the Daily Log
              </p>
            </div>
          )}

          <footer className="text-center border-t border-navy-600 pt-6 mt-8">
            <p className="text-xs text-navy-500">
              This document is auto-generated from the DiveOps™ event log. 
              All times are local. Document is {data?.isLocked ? "LOCKED" : "DRAFT"}.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
