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
        variant === "error" && "bg-danger/10 text-danger",
        variant === "success" && "bg-success/10 text-success"
      )}
    >
      {message}
    </div>
  );
}
