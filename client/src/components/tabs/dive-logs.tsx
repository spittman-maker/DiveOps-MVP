import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Dive {
  id: string;
  dayId: string;
  diveNumber: number;
  diverId: string;
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  depth?: number;
  bottomTime?: number;
  decoObligation?: string;
}

export function DiveLogsTab() {
  const { user } = useAuth();
  const { activeDay } = useProject();

  const { data: dives = [], isLoading } = useQuery<Dive[]>({
    queryKey: ["user-dives", user?.id, activeDay?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const url = activeDay?.id 
        ? `/api/users/${user.id}/dives?dayId=${activeDay.id}`
        : `/api/users/${user.id}/dives`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return "--:--";
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="h-full p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Dive Logs</h2>
          <p className="text-sm text-navy-400">
            View and confirm your dive records
          </p>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="grid gap-4">
          {dives.map((dive) => (
            <Card
              key={dive.id}
              data-testid={`dive-card-${dive.id}`}
              className="bg-navy-800/50 border-navy-600"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-base">
                    Dive #{dive.diveNumber}
                  </CardTitle>
                  <Badge className="bg-blue-600">
                    {dive.depth ? `${dive.depth} fsw` : "Depth TBD"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-navy-400">Leave Surface</p>
                    <p className="text-white font-mono">{formatTime(dive.lsTime)}</p>
                  </div>
                  <div>
                    <p className="text-navy-400">Reach Bottom</p>
                    <p className="text-white font-mono">{formatTime(dive.rbTime)}</p>
                  </div>
                  <div>
                    <p className="text-navy-400">Leave Bottom</p>
                    <p className="text-white font-mono">{formatTime(dive.lbTime)}</p>
                  </div>
                  <div>
                    <p className="text-navy-400">Reach Surface</p>
                    <p className="text-white font-mono">{formatTime(dive.rsTime)}</p>
                  </div>
                </div>

                {dive.bottomTime && (
                  <div className="mt-3 pt-3 border-t border-navy-700">
                    <p className="text-sm text-navy-400">
                      Bottom Time: <span className="text-white font-mono">{dive.bottomTime} min</span>
                    </p>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <Button
                    data-testid={`button-confirm-${dive.id}`}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Confirm Dive
                  </Button>
                  <Button
                    data-testid={`button-flag-${dive.id}`}
                    size="sm"
                    variant="outline"
                    className="border-yellow-600 text-yellow-500 hover:bg-yellow-600/10"
                  >
                    Flag Issue
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

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
