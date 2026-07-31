import { clsx } from "@/lib/clsx";

export function FormBanner({
  message,
  variant = "error",
}: {
  message?: string;
  variant?: "error" | "success";
}) {
  if (!message) return null;
  return (
    <div
      className={clsx(
        "mb-4 rounded-md px-3 py-2 text-sm",
        variant === "error" && "bg-red-50 text-red-700",
        variant === "success" && "bg-emerald-50 text-emerald-700"
      )}
    >
      {message}
    </div>
  );
}
