import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/** Consistent empty state for tab/page content. */
export function PageEmpty({ icon, title, description, action }: PageEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
      {icon || <Inbox className="w-10 h-10 text-slate-500" />}
      <div>
        <h3 className="text-lg font-semibold text-slate-300">{title}</h3>
        {description && (
          <p className="text-sm text-slate-400 mt-1 max-w-md">{description}</p>
        )}
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
