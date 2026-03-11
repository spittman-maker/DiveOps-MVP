import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { useFeatureFlags } from "./use-feature-flags";

interface Company {
  companyId: string;
  companyName: string;
}

interface CompanyContextType {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (companyId: string) => void;
  clearActiveCompany: () => void;
  isMultiTenant: boolean;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isGod } = useAuth();
  const featureFlags = useFeatureFlags();
  const queryClient = useQueryClient();
  const isMultiTenant = featureFlags.multiTenantOrg ?? false;

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/companies", { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    enabled: !!user && isMultiTenant && isGod,
  });

  // Derive active company from user session data
  const activeCompany = (() => {
    if (!isMultiTenant || !user) return null;
    if (isGod && (user as any).activeCompanyId) {
      return companies.find(c => c.companyId === (user as any).activeCompanyId) || null;
    }
    if ((user as any).companyId) {
      return companies.find(c => c.companyId === (user as any).companyId) || null;
    }
    return null;
  })();

  const setActiveCompanyMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await fetch(`/api/companies/${companyId}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to set active company");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const clearActiveCompanyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/companies/clear-active", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear active company");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        setActiveCompany: (id) => setActiveCompanyMutation.mutate(id),
        clearActiveCompany: () => clearActiveCompanyMutation.mutate(),
        isMultiTenant,
        isLoading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany must be used within CompanyProvider");
  }
  return context;
}
