// Tenant asset paths are stored from the site root in the demo settings.
// Prefix only these paths when the site is deployed under a GitHub Pages subpath.
export function tenantAssetUrl(path: string): string {
  if (!path.startsWith('/tenants/')) return path;
  return `${import.meta.env.BASE_URL}${path.slice(1)}`;
}
