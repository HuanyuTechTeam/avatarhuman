export function normalizePath(path) {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export function stripTrailingSlash(value) {
  if (!value || value === "/") {
    return "";
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function detectBackendPrefix(pathname) {
  return pathname.startsWith("/avatarhuman/") || pathname === "/avatarhuman"
    ? "/avatarhuman"
    : "";
}

export function buildApiUrl(prefix, path) {
  return `${stripTrailingSlash(prefix)}${normalizePath(path)}`;
}
