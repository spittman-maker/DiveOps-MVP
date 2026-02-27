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
  isLoading: boolean;
  refreshDay: () => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (projects.length > 0 && !activeProjectId) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

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

  const activeDay = days[0] || null;

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
      queryClient.invalidateQueries({ queryKey: ["days"] });
    },
  });

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject: (id) => setActiveProjectMutation.mutate(id),
        activeDay,
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
