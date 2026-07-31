type ClassValue = string | number | boolean | null | undefined;

export function clsx(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}
