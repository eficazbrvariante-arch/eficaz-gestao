import { Skeleton } from "@/components/ui/skeleton";

export default function DadosLoading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-6 h-6 w-32" />
      <Skeleton className="mb-8 h-32 rounded-xl" />
      <Skeleton className="h-64 max-w-sm" />
    </div>
  );
}
