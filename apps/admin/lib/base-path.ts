/**
 * The store admin is served at https://<store host>/admin, so it knows which store it manages from the Host.
 * Must match `basePath` in next.config.ts. <Link>, useRouter() and redirect() add it themselves; plain fetch(),
 * <a href>, window.location and cookie paths do not, so they use these helpers.
 */
export const BASE_PATH = '/admin';
export const withBase = (path: string) => `${BASE_PATH}${path}`;
/** location.pathname without the base path (what router.replace() expects back). */
export const stripBase = (pathname: string) => (pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname) || '/';
