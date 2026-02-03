import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MasterLogEntry {
  id: string;
  eventTime: string;
  rawText: string;
  masterLogLine: string;
  status: string;
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
  dives?: DiveRecord[];
  summary?: {
    totalDives: number;
    totalDivers: number;
    maxDepth: number;
    safetyIncidents: number;
    directivesCount: number;
  };
}

export function MasterLogTab() {
  const { activeDay } = useProject();

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

  const sections = data?.sections || { ops: [], dive: [], directives: [], safety: [], risk: [] };
  const summary = data?.summary || { totalDives: 0, totalDivers: 0, maxDepth: 0, safetyIncidents: 0, directivesCount: 0 };
  const dives = data?.dives || [];

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
            <h1 className="text-2xl font-bold text-white mb-2">DAILY OPERATIONS MASTER LOG</h1>
            <p className="text-lg text-navy-300">{formatDate(data?.day?.date)}</p>
            <p className="text-sm text-navy-400 mt-1">Precision Subsea Group LLC - DiveOps™</p>
          </header>

          <section data-testid="section-narrative">
            <Card className="bg-navy-800/50 border-navy-600">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Executive Summary</CardTitle>
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
                        <> <span className="text-yellow-400"><strong>{summary.safetyIncidents} safety incident(s)</strong> were logged and documented below.</span></>
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

          {dives.length > 0 && (
            <section data-testid="section-dive-table">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full btn-gold-metallic" />
                    <CardTitle className="text-white text-base">Dive Operations Log</CardTitle>
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

          {sections.directives.length > 0 && (
            <section data-testid="section-directives">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-600" />
                    <CardTitle className="text-white text-base">Client Directives</CardTitle>
                    <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                      {sections.directives.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {sections.directives.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-navy-100">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {sections.safety.length > 0 && (
            <section data-testid="section-safety">
              <Card className="bg-navy-800/50 border-red-900/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-600" />
                    <CardTitle className="text-white text-base">Safety & Incidents</CardTitle>
                    <Badge className="bg-red-600 text-xs">
                      {sections.safety.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {sections.safety.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-red-200">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {sections.ops.length > 0 && (
            <section data-testid="section-ops">
              <Card className="bg-navy-800/50 border-navy-600">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-teal-600" />
                    <CardTitle className="text-white text-base">General Operations</CardTitle>
                    <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                      {sections.ops.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            </section>
          )}

          {sections.risk.length > 0 && (
            <section data-testid="section-risk">
              <Card className="bg-navy-800/50 border-orange-900/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-600" />
                    <CardTitle className="text-white text-base">Risk Register Updates</CardTitle>
                    <Badge className="bg-orange-600 text-xs">
                      {sections.risk.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {sections.risk.map((entry) => (
                      <li key={entry.id} className="flex gap-3 py-1">
                        <span className="text-sm font-mono text-navy-400 w-14 shrink-0">
                          {formatTime(entry.eventTime)}
                        </span>
                        <p className="text-sm text-orange-200">{entry.masterLogLine}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {!isLoading && sections.ops.length === 0 && sections.dive.length === 0 && 
           sections.directives.length === 0 && sections.safety.length === 0 && dives.length === 0 && (
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
