import { Spinner } from "@/components/ui/spinner";

interface PageLoadingProps {
  message?: string;
}

/** Consistent loading state for tab/page content. */
export function PageLoading({ message = "Loading..." }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Spinner className="w-8 h-8 text-cyan-400" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
