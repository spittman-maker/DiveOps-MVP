import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  closeDay: boolean;
  riskCreation: boolean;
  exportGeneration: boolean;
  aiProcessing: boolean;
  safetyTab: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  closeDay: false,
  riskCreation: false,
  exportGeneration: false,
  aiProcessing: false,
  safetyTab: false,
};

export function useFeatureFlags() {
  const { data: flags = DEFAULT_FLAGS } = useQuery<FeatureFlags>({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/feature-flags", { credentials: "include" });
        if (!res.ok) return DEFAULT_FLAGS;
        return res.json();
      } catch {
        return DEFAULT_FLAGS;
      }
    },
    refetchInterval: 60000, // refresh every minute
    staleTime: 30000,
  });

  return flags;
}
