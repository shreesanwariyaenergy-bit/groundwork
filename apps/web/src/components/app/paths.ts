/** Notification `data.path` values are platform-neutral (shared with Android). Map them to web routes. */
export function webPath(path: string | undefined | null): string {
  if (!path || !path.startsWith('/')) return '/app';
  if (path.startsWith('/app')) return path;
  return '/app' + path;
}
