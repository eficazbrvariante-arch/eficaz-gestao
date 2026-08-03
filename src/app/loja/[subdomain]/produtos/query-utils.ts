export type SearchParams = {
  q?: string;
  categoria?: string;
  marca?: string;
  ordem?: string;
  pagina?: string;
};

/** Monta um link preservando os filtros atuais e trocando só o que foi informado. */
export function buildQuery(current: SearchParams, changes: Partial<SearchParams>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...changes };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
