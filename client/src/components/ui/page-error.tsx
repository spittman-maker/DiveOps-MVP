import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageErrorProps {
  message?: string;
  correlationId?: string;
  onRetry?: () => void;
}

/** Consistent error state for tab/page content. */
export function PageError({
  message = "Failed to load data.",
  correlationId,
  onRetry,
}: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <div>
        <h3 className="text-lg font-semibold text-slate-200">Something went wrong</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-md">{message}</p>
        {correlationId && (
          <p className="text-xs text-slate-500 mt-2 font-mono">
            Reference: {correlationId}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}
