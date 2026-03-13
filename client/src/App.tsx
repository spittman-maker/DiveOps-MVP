import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProjectProvider } from "@/hooks/use-project";
import { CompanyProvider } from "@/hooks/use-company";
import { ThemeProvider } from "@/hooks/use-theme";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ConsolePage from "@/pages/console";
import ChangePasswordPage from "@/pages/change-password";
import { Spinner } from "@/components/ui/spinner";
import React from "react";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center text-white gap-4">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-gray-400">An unexpected error occurred.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-amber-500 text-black rounded hover:bg-amber-400 font-medium"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <Spinner className="w-8 h-8 text-amber-400" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return (
    <CompanyProvider>
      <ProjectProvider>{children}</ProjectProvider>
    </CompanyProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute>
          <ConsolePage />
        </ProtectedRoute>
      </Route>
      {/* BUG-15 FIX: /login route shows login page */}
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <ErrorBoundary>
              <Router />
            </ErrorBoundary>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
