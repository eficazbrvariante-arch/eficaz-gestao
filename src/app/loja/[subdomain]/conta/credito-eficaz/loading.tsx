import { Skeleton } from "@/components/ui/skeleton";

export default function CreditoEficazLoading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
