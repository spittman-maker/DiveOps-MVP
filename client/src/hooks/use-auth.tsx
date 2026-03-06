import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  username: string;
  role: "GOD" | "ADMIN" | "SUPERVISOR" | "DIVER";
  fullName?: string;
  initials?: string;
  activeProjectId?: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canWriteLogEvents: boolean;
  isGod: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        throw new Error("Login failed");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.invalidateQueries();
    },
  });

  const canWriteLogEvents = user?.role === "GOD" || user?.role === "ADMIN" || user?.role === "SUPERVISOR";
  const isGod = user?.role === "GOD";
  const isAdmin = user?.role === "GOD" || user?.role === "ADMIN";
  const isSupervisor = user?.role === "GOD" || user?.role === "ADMIN" || user?.role === "SUPERVISOR";

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        login: async (username, password) => {
          await loginMutation.mutateAsync({ username, password });
        },
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
        canWriteLogEvents,
        isGod,
        isAdmin,
        isSupervisor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
