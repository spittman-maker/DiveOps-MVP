import { Switch, Route, Redirect } from "wouter";
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
      {/* Redirect root to console dashboard */}
      <Route path="/">
        <Redirect to="/console/dashboard" />
      </Route>

      {/* Console routes — each tab has its own URL */}
      <Route path="/console/:tab?">
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
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
