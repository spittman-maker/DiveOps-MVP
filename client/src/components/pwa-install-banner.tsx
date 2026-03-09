import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, X } from "lucide-react";

export function PwaInstallBanner() {
  const { isInstallable, install, dismiss } = usePwaInstall();

  if (!isInstallable) return null;

  return (
    <div className="bg-gradient-to-r from-amber-900/80 via-amber-800/60 to-amber-900/80 border-b border-amber-600/30 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Download className="h-4 w-4 text-amber-400 shrink-0" />
        <p className="text-sm text-amber-100 truncate">
          Install <span className="font-semibold">DiveOps™</span> for quick access
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={install}
          className="px-3 py-1 text-xs font-medium rounded bg-amber-500 hover:bg-amber-400 text-navy-900 transition-colors"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          className="p-1 text-amber-400/70 hover:text-amber-300 transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
