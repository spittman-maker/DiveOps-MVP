import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProjectProvider } from "@/hooks/use-project";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ConsolePage from "@/pages/console";
import { Spinner } from "@/components/ui/spinner";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <Spinner className="w-8 h-8 text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <ProjectProvider>{children}</ProjectProvider>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute>
          <ConsolePage />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
