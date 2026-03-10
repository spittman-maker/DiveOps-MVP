import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  closeDay: boolean;
  riskCreation: boolean;
  exportGeneration: boolean;
  aiProcessing: boolean;
  safetyTab: boolean;
}

const defaults: FeatureFlags = {
  closeDay: true,
  riskCreation: true,
  exportGeneration: true,
  aiProcessing: true,
  safetyTab: false,
};

export function useFeatureFlags() {
  const { data: flags } = useQuery<FeatureFlags>({
    queryKey: ["/api/feature-flags"],
    queryFn: async () => {
      const res = await fetch("/api/feature-flags", { credentials: "include" });
      if (!res.ok) return defaults;
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return flags || defaults;
}

export function useFlag(flag: keyof FeatureFlags): boolean {
  const flags = useFeatureFlags();
  return flags[flag];
}
