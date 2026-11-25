import { NextRequest, NextResponse } from 'next/server';

/** Signed-out visitors go to /login. The cookies are httpOnly; the API decides whether they are still valid. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = req.cookies.has('bm_access') || req.cookies.has('bm_refresh');
  if (!signedIn && pathname !== '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === '/login') {
    // clone nextUrl (not new URL('/', req.url)) so the /admin base path is kept
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Paths here are relative to the /admin base path (Next adds it to the matcher). The pattern alone needs a
// character after "/admin/", so the bare dashboard URL "/admin" is listed separately.
export const config = { matcher: ['/', '/((?!api|_next|favicon.ico|icon.svg|manifest.webmanifest).*)'] };
