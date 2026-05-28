const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const BASE_PATH = rawBasePath.endsWith('/')
  ? rawBasePath.slice(0, -1)
  : rawBasePath;

export function assetPath(path: string) {
  if (!BASE_PATH) return path;
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}
