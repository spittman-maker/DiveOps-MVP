import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface MasterLogEntry {
  id: string;
  eventTime: string;
  rawText: string;
  masterLogLine: string;
  status: string;
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
}

const SECTION_CONFIG = [
  { key: "ops", title: "Operations", color: "bg-teal-600" },
  { key: "dive", title: "Dive Operations", color: "bg-blue-600" },
  { key: "directives", title: "Client Directives", color: "bg-purple-600" },
  { key: "safety", title: "Safety & Incidents", color: "bg-red-600" },
  { key: "risk", title: "Risk Register Updates", color: "bg-orange-600" },
];

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
  });

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="h-full p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Master Log</h2>
          <p className="text-sm text-navy-400">
            Client-facing daily operations record
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2">
            <Badge className={data.isLocked ? "bg-red-600" : "bg-green-600"}>
              {data.isLocked ? "LOCKED" : "DRAFT"}
            </Badge>
            <span className="text-sm text-navy-400">{data.day?.date}</span>
          </div>
        )}
      </div>

      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="space-y-6">
          {SECTION_CONFIG.map(({ key, title, color }) => {
            const entries = data?.sections?.[key as keyof typeof data.sections] || [];
            
            return (
              <Card
                key={key}
                data-testid={`section-${key}`}
                className="bg-navy-800/50 border-navy-600"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <CardTitle className="text-white text-base">{title}</CardTitle>
                    <Badge variant="outline" className="text-xs border-navy-500 text-navy-400">
                      {entries.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {entries.length > 0 ? (
                    <div className="space-y-2">
                      {entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex gap-3 py-2 border-b border-navy-700 last:border-0"
                        >
                          <span className="text-sm font-mono text-navy-400 w-16 shrink-0">
                            {formatTime(entry.eventTime)}
                          </span>
                          <p className="text-sm text-navy-100">
                            {entry.masterLogLine}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-navy-500 italic">No entries in this section</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
