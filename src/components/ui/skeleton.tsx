import { HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("animate-pulse rounded-md bg-slate-200", className)} {...props} />;
}
