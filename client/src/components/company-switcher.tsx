import { useCompany } from "@/hooks/use-company";
import { useAuth } from "@/hooks/use-auth";
import { Building2, ChevronDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function CompanySwitcher() {
  const { user, isGod } = useAuth();
  const { companies, activeCompany, setActiveCompany, clearActiveCompany, isMultiTenant } = useCompany();

  // Only show when multi-tenant is ON
  if (!isMultiTenant) return null;

  // ADMIN users: show their company name as a static badge (no switcher)
  if (!isGod && user?.companyName) {
    return (
      <div className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="outline" className="text-xs font-normal">
          {user.companyName}
        </Badge>
      </div>
    );
  }

  // GOD users: show company switcher dropdown
  if (!isGod) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-7"
          data-testid="company-switcher"
        >
          {activeCompany ? (
            <>
              <Building2 className="h-3.5 w-3.5" />
              {activeCompany.companyName}
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5" />
              All Companies
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() => clearActiveCompany()}
          className={!activeCompany ? "bg-accent" : ""}
        >
          <Globe className="h-4 w-4 mr-2" />
          All Companies
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.companyId}
            onClick={() => setActiveCompany(company.companyId)}
            className={activeCompany?.companyId === company.companyId ? "bg-accent" : ""}
          >
            <Building2 className="h-4 w-4 mr-2" />
            {company.companyName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
