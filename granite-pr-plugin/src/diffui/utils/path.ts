export function normalizePath(p?: string): string {
  if (!p) return "";

  // strip drive prefix like "T:\" or "t:/"
  p = p.replace(/^[A-Za-z]:[\\/]/, "");

  // unify separators
  p = p.replace(/\\/g, "/");

  // strip a leading "a/" or "b/"
  p = p.replace(/^(?:[ab]\/)/, "");

  // remove any remaining leading slashes
  p = p.replace(/^\/+/, "");

  return p;
}
