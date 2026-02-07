import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings, GripVertical, X, Save, RotateCcw, Sun, Cloud, CloudRain, Wind, Droplets, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, any>;
}

interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

interface DashboardLayout {
  widgets: WidgetConfig[];
  version: number;
}

interface DashboardStats {
  totalDives: number;
  activeDives: number;
  safetyIncidents: number;
  openRisks: number;
  logEntriesToday: number;
  dayStatus?: string;
  dayDate?: string;
}

const WIDGET_TYPES = [
  { type: "daily_summary", label: "Today's Summary", defaultW: 2, defaultH: 2 },
  { type: "active_dives", label: "Active Dives", defaultW: 2, defaultH: 2 },
  { type: "recent_logs", label: "Recent Logs", defaultW: 2, defaultH: 2 },
  { type: "safety_incidents", label: "Safety Status", defaultW: 2, defaultH: 2 },
  { type: "risk_register", label: "Risk Register", defaultW: 2, defaultH: 2 },
  { type: "dive_stats", label: "Dive Statistics", defaultW: 2, defaultH: 2 },
  { type: "project_status", label: "Project Status", defaultW: 2, defaultH: 2 },
  { type: "weather", label: "Weather & Lightning", defaultW: 2, defaultH: 2 },
];

function DailySummaryWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-2xl font-bold text-amber-400">{stats.totalDives}</div>
          <div className="text-xs text-navy-300">Total Dives</div>
        </div>
        <div className="bg-navy-700 rounded p-2 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.logEntriesToday}</div>
          <div className="text-xs text-navy-300">Log Entries</div>
        </div>
      </div>
      {stats.dayDate && (
        <div className="text-xs text-navy-400 text-center">
          {stats.dayDate} - <Badge className={stats.dayStatus === "ACTIVE" ? "bg-green-600" : "bg-yellow-600"}>{stats.dayStatus}</Badge>
        </div>
      )}
    </div>
  );
}

function ActiveDivesWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-5xl font-bold text-amber-400">{stats.activeDives}</div>
      <div className="text-sm text-navy-300 mt-2">Divers Currently In Water</div>
      {stats.activeDives > 0 && (
        <div className="mt-2">
          <Badge className="btn-gold-metallic animate-pulse">ACTIVE</Badge>
        </div>
      )}
    </div>
  );
}

function SafetyWidget({ stats }: { stats: DashboardStats }) {
  const hasIssues = stats.safetyIncidents > 0 || stats.openRisks > 0;
  return (
    <div className="flex items-center justify-around h-full">
      <div className="text-center">
        <div className={`text-2xl font-bold ${stats.safetyIncidents > 0 ? "text-red-400" : "text-green-400"}`}>
          {stats.safetyIncidents}
        </div>
        <div className="text-xs text-navy-300">Safety Incidents</div>
      </div>
      <div className="text-center">
        <div className={`text-2xl font-bold ${stats.openRisks > 0 ? "text-yellow-400" : "text-green-400"}`}>
          {stats.openRisks}
        </div>
        <div className="text-xs text-navy-300">Open Risks</div>
      </div>
      {!hasIssues && (
        <Badge className="bg-green-600">ALL CLEAR</Badge>
      )}
    </div>
  );
}

function DiveStatsWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-navy-300">Completed</span>
        <span className="font-mono text-white">{stats.totalDives - stats.activeDives}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-navy-300">In Progress</span>
        <span className="font-mono text-amber-400">{stats.activeDives}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-navy-300">Log Entries</span>
        <span className="font-mono text-white">{stats.logEntriesToday}</span>
      </div>
    </div>
  );
}

function ProjectStatusWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex items-center justify-center h-full gap-4">
      <Badge className={stats.dayStatus === "ACTIVE" ? "bg-green-600" : stats.dayStatus === "CLOSED" ? "bg-red-600" : "bg-yellow-600"}>
        {stats.dayStatus || "NO DAY"}
      </Badge>
      <span className="text-sm text-navy-300">{stats.dayDate || "No active day"}</span>
    </div>
  );
}

function RiskRegisterWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className={`text-4xl font-bold ${stats.openRisks > 0 ? "text-yellow-400" : "text-green-400"}`}>
        {stats.openRisks}
      </div>
      <div className="text-sm text-navy-300 mt-2">Open Risk Items</div>
    </div>
  );
}

function RecentLogsWidget() {
  const { data: recentLogs } = useQuery<Array<{id: string; rawText: string; category: string; eventTime: string; captureTime: string}>>({
    queryKey: ["dashboard-recent-logs"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/recent-logs", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  if (!recentLogs || recentLogs.length === 0) {
    return (
      <div className="text-center text-navy-400 text-sm">
        <p>No log entries yet</p>
        <p className="text-xs mt-2">Add entries in the Daily Log tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-auto h-full">
      {recentLogs.map(log => (
        <div key={log.id} className="bg-navy-700 rounded p-2 text-xs">
          <div className="flex justify-between items-center mb-1">
            <span className="text-amber-400 font-mono">
              {new Date(log.eventTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
            <span className="text-navy-400 uppercase">{log.category}</span>
          </div>
          <div className="text-white/80 truncate">{log.rawText}</div>
        </div>
      ))}
    </div>
  );
}

interface WeatherData {
  configured: boolean;
  location?: string;
  country?: string;
  temp?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  conditions?: string;
  description?: string;
  icon?: string;
  hasThunderstorm?: boolean;
}

interface LightningData {
  configured: boolean;
  hasUpcomingStorms?: boolean;
  thunderstormAlerts?: Array<{
    time: number;
    timeText: string;
    conditions: string;
    probability: number;
    temp: number;
  }>;
}

function WeatherWidget() {
  const [location, setLocation] = useState("Houston, TX");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  const { data: weather, isLoading: weatherLoading } = useQuery<WeatherData>({
    queryKey: ["weather", location],
    queryFn: async () => {
      const res = await fetch(`/api/weather?location=${encodeURIComponent(location)}`, { credentials: "include" });
      if (!res.ok) return { configured: false };
      return res.json();
    },
    refetchInterval: 300000,
    staleTime: 60000,
  });

  const { data: lightning } = useQuery<LightningData>({
    queryKey: ["lightning", coords?.lat, coords?.lon],
    queryFn: async () => {
      if (!coords) return { configured: false };
      const res = await fetch(`/api/weather/lightning?lat=${coords.lat}&lon=${coords.lon}`, { credentials: "include" });
      if (!res.ok) return { configured: false };
      return res.json();
    },
    enabled: !!coords,
    refetchInterval: 300000,
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  if (weatherLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading weather...</div>;
  }

  if (!weather?.configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <CloudRain className="h-8 w-8 mb-2 opacity-50" />
        <p>Weather API not configured</p>
        <p className="text-xs mt-1">Add OPENWEATHER_API_KEY secret</p>
      </div>
    );
  }

  const getWeatherIcon = (icon?: string) => {
    if (!icon) return <Cloud className="h-8 w-8" />;
    if (icon.includes("01")) return <Sun className="h-8 w-8 text-yellow-400" />;
    if (icon.includes("02") || icon.includes("03") || icon.includes("04")) return <Cloud className="h-8 w-8 text-gray-400" />;
    if (icon.includes("09") || icon.includes("10")) return <CloudRain className="h-8 w-8 text-amber-400" />;
    if (icon.includes("11")) return <Zap className="h-8 w-8 text-yellow-400" />;
    return <Cloud className="h-8 w-8" />;
  };

  return (
    <div className="space-y-2 p-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getWeatherIcon(weather.icon)}
          <div>
            <div className="text-xl font-bold text-white">{weather.temp}°C</div>
            <div className="text-xs text-navy-300">{weather.conditions}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-navy-200">{weather.location}</div>
          <div className="text-xs text-navy-400">Feels like {weather.feelsLike}°C</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1 text-navy-300">
          <Wind className="h-3 w-3" />
          {weather.windSpeed} m/s
        </div>
        <div className="flex items-center gap-1 text-navy-300">
          <Droplets className="h-3 w-3" />
          {weather.humidity}%
        </div>
      </div>

      {weather.hasThunderstorm && (
        <div className="flex items-center gap-2 bg-yellow-600/20 border border-yellow-600 rounded px-2 py-1">
          <Zap className="h-4 w-4 text-yellow-400 animate-pulse" />
          <span className="text-xs text-yellow-300">Thunderstorm Warning</span>
        </div>
      )}

      {lightning?.hasUpcomingStorms && !weather.hasThunderstorm && (
        <div className="flex items-center gap-2 bg-orange-600/20 border border-orange-600 rounded px-2 py-1">
          <Zap className="h-4 w-4 text-orange-400" />
          <span className="text-xs text-orange-300">Storms expected in forecast</span>
        </div>
      )}
    </div>
  );
}

function renderWidget(type: string, stats: DashboardStats) {
  switch (type) {
    case "daily_summary":
      return <DailySummaryWidget stats={stats} />;
    case "active_dives":
      return <ActiveDivesWidget stats={stats} />;
    case "safety_incidents":
      return <SafetyWidget stats={stats} />;
    case "dive_stats":
      return <DiveStatsWidget stats={stats} />;
    case "project_status":
      return <ProjectStatusWidget stats={stats} />;
    case "risk_register":
      return <RiskRegisterWidget stats={stats} />;
    case "recent_logs":
      return <RecentLogsWidget />;
    case "weather":
      return <WeatherWidget />;
    default:
      return <div className="text-navy-400 text-sm">Unknown widget type</div>;
  }
}

export function DashboardTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [localLayout, setLocalLayout] = useState<WidgetConfig[]>([]);

  const { data: layout } = useQuery<DashboardLayout>({
    queryKey: ["dashboard-layout"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/layout", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load layout");
      return res.json();
    },
  });

  const { data: stats = { totalDives: 0, activeDives: 0, safetyIncidents: 0, openRisks: 0, logEntriesToday: 0 } } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const saveMutation = useMutation({
    mutationFn: async (widgets: WidgetConfig[]) => {
      const res = await fetch("/api/dashboard/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ widgets, version: (layout?.version || 0) + 1 }),
      });
      if (!res.ok) throw new Error("Failed to save layout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-layout"] });
      toast({ title: "Layout saved", description: "Your dashboard layout has been saved" });
      setIsEditing(false);
    },
  });

  useEffect(() => {
    if (layout?.widgets) {
      setLocalLayout(layout.widgets);
    }
  }, [layout]);

  const handleLayoutChange = useCallback((newLayout: GridLayoutItem[]) => {
    setLocalLayout(prev => 
      prev.map(widget => {
        const item = newLayout.find(l => l.i === widget.id);
        if (item) {
          return { ...widget, x: item.x, y: item.y, w: item.w, h: item.h };
        }
        return widget;
      })
    );
  }, []);

  const addWidget = (type: string) => {
    const widgetType = WIDGET_TYPES.find(w => w.type === type);
    if (!widgetType) return;

    const newWidget: WidgetConfig = {
      id: `w${Date.now()}`,
      type,
      title: widgetType.label,
      x: 0,
      y: Infinity,
      w: widgetType.defaultW,
      h: widgetType.defaultH,
    };
    setLocalLayout(prev => [...prev, newWidget]);
  };

  const removeWidget = (id: string) => {
    setLocalLayout(prev => prev.filter(w => w.id !== id));
  };

  const resetLayout = () => {
    setLocalLayout([
      { id: "w1", type: "daily_summary", title: "Today's Summary", x: 0, y: 0, w: 2, h: 2 },
      { id: "w2", type: "active_dives", title: "Active Dives", x: 2, y: 0, w: 2, h: 2 },
      { id: "w3", type: "recent_logs", title: "Recent Log Entries", x: 0, y: 2, w: 2, h: 2 },
      { id: "w4", type: "safety_incidents", title: "Safety Status", x: 2, y: 2, w: 2, h: 2 },
    ]);
  };

  const gridLayout: GridLayoutItem[] = localLayout.map(widget => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    minW: 1,
    minH: 1,
    static: false,
  }));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-navy-800 p-3 border-b border-navy-600 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Dashboard</h2>
          <span className="text-xs text-navy-400">Quick access to key information</span>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="button-add-widget" variant="outline" size="sm" className="text-xs border-green-500 text-green-400">
                    <Plus className="h-3 w-3 mr-1" /> Add Widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-navy-800 border-navy-600">
                  {WIDGET_TYPES.map(wt => (
                    <DropdownMenuItem
                      key={wt.type}
                      onClick={() => addWidget(wt.type)}
                      className="text-navy-200 hover:bg-navy-700"
                    >
                      {wt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                data-testid="button-reset-layout"
                variant="outline"
                size="sm"
                onClick={resetLayout}
                className="text-xs border-yellow-500 text-yellow-400"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Reset
              </Button>
              <Button
                data-testid="button-save-layout"
                size="sm"
                onClick={() => saveMutation.mutate(localLayout)}
                disabled={saveMutation.isPending}
                className="text-xs bg-green-600 hover:bg-green-700"
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button
                data-testid="button-cancel-edit"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLocalLayout(layout?.widgets || []);
                  setIsEditing(false);
                }}
                className="text-xs text-navy-400"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              data-testid="button-edit-dashboard"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs border-amber-500 text-amber-400"
            >
              <Settings className="h-3 w-3 mr-1" /> Customize
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={4}
          rowHeight={120}
          width={800}
          onLayoutChange={handleLayoutChange as any}
          isDraggable={isEditing}
          isResizable={true}
          draggableHandle=".widget-drag-handle"
          resizeHandles={['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's']}
        >
          {localLayout.map(widget => (
            <div key={widget.id} className="bg-navy-800 border border-navy-600 rounded-lg overflow-hidden">
              <div className="bg-navy-750 px-3 py-2 border-b border-navy-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <GripVertical className="h-4 w-4 text-navy-500 cursor-move widget-drag-handle" />
                  )}
                  <span className="text-sm font-medium text-white">{widget.title}</span>
                </div>
                {isEditing && (
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="text-navy-500 hover:text-red-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="p-3 h-[calc(100%-40px)] overflow-auto">
                {renderWidget(widget.type, stats)}
              </div>
            </div>
          ))}
        </GridLayout>

        {localLayout.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-navy-400">
            <p className="text-sm mb-4">No widgets on your dashboard</p>
            <Button onClick={() => setIsEditing(true)} variant="outline" className="border-amber-500 text-amber-400">
              <Plus className="h-4 w-4 mr-2" /> Add Widgets
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
