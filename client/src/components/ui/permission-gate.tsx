import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Role = "GOD" | "ADMIN" | "SUPERVISOR" | "DIVER";

interface PermissionGateProps {
  /** Minimum roles allowed. If user's role is not in this list, content is hidden or disabled. */
  allowedRoles: Role[];
  /** What to show when access is denied. Defaults to nothing. */
  fallback?: React.ReactNode;
  /** If true, render children as disabled instead of hiding them. */
  disableInstead?: boolean;
  /** Reason shown in tooltip when disabled. */
  reason?: string;
  children: React.ReactNode;
}

/**
 * UI permission gate — cosmetic only.
 * All real enforcement happens server-side.
 *
 * Usage:
 *   <PermissionGate allowedRoles={["ADMIN", "GOD"]} reason="Admin only">
 *     <Button>Delete Project</Button>
 *   </PermissionGate>
 */
export function PermissionGate({
  allowedRoles,
  fallback,
  disableInstead,
  reason,
  children,
}: PermissionGateProps) {
  const { user } = useAuth();
  const hasAccess = user && allowedRoles.includes(user.role as Role);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (disableInstead) {
    const content = (
      <div className="opacity-50 pointer-events-none cursor-not-allowed">
        {children}
      </div>
    );

    if (reason) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      );
    }

    return content;
  }

  return fallback ? <>{fallback}</> : null;
}
