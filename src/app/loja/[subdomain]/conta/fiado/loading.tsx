import { Skeleton } from "@/components/ui/skeleton";

export default function FiadoLoading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-1 h-6 w-48" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}
