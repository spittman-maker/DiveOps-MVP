import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

interface Project {
  id: string;
  name: string;
  clientName: string;
  jobsiteName: string;
  jobsiteAddress?: string;
  jobsiteLat?: string;
  jobsiteLng?: string;
  timezone?: string;
}

interface Day {
  id: string;
  projectId: string;
  date: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  shift?: string;
}

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (projectId: string) => void;
  activeDay: Day | null;
  allDays: Day[];
  setActiveDay: (dayId: string) => void;
  isLoading: boolean;
  refreshDay: () => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

  // Fetch user's active project from /api/auth/me
  const { data: meData } = useQuery<{ activeProjectId?: string }>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!user,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  // Set active project from user preferences first, then fall back to first project
  useEffect(() => {
    if (projects.length > 0 && !activeProjectId) {
      if (meData?.activeProjectId && projects.find(p => p.id === meData.activeProjectId)) {
        setActiveProjectId(meData.activeProjectId);
      } else {
        setActiveProjectId(projects[0].id);
      }
    }
  }, [projects, activeProjectId, meData?.activeProjectId]);

  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  const { data: days = [], isLoading: daysLoading, refetch: refetchDays } = useQuery<Day[]>({
    queryKey: ["days", activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const res = await fetch(`/api/projects/${activeProjectId}/days`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeProjectId,
  });

  // When days change, select the first non-closed day, or the most recent day
  useEffect(() => {
    if (days.length > 0) {
      if (!activeDayId || !days.find(d => d.id === activeDayId)) {
        // Prefer ACTIVE day, then DRAFT, then most recent
        const activeStatusDay = days.find(d => d.status === "ACTIVE");
        const draftDay = days.find(d => d.status === "DRAFT");
        const bestDay = activeStatusDay || draftDay || days[0];
        setActiveDayId(bestDay.id);
      }
    } else {
      setActiveDayId(null);
    }
  }, [days]);

  const activeDay = (activeDayId ? days.find(d => d.id === activeDayId) : days[0]) || null;

  const setActiveProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await fetch(`/api/projects/${projectId}/activate`, {
        method: "POST",
        credentials: "include",
      });
      return projectId;
    },
    onSuccess: (projectId) => {
      setActiveProjectId(projectId);
      setActiveDayId(null); // Reset day selection when switching projects
      queryClient.invalidateQueries({ queryKey: ["days"] });
      queryClient.invalidateQueries({ queryKey: ["log-events"] });
      queryClient.invalidateQueries({ queryKey: ["master-log"] });
      queryClient.invalidateQueries({ queryKey: ["risks"] });
    },
  });

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject: (id) => setActiveProjectMutation.mutate(id),
        activeDay,
        allDays: days,
        setActiveDay: (dayId) => setActiveDayId(dayId),
        isLoading: projectsLoading || daysLoading,
        refreshDay: () => refetchDays(),
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}
