const AVATARHUMAN_PREFIX = "/avatarhuman";

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export function stripTrailingSlash(value: string): string {
  if (!value || value === "/") {
    return "";
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function detectBackendPrefix(pathname: string): string {
  return pathname.startsWith(`${AVATARHUMAN_PREFIX}/`) || pathname === AVATARHUMAN_PREFIX
    ? AVATARHUMAN_PREFIX
    : "";
}

export function buildApiUrl(prefix: string, path: string): string {
  return `${stripTrailingSlash(prefix)}${normalizePath(path)}`;
}
