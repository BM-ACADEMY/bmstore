import { NextRequest, NextResponse } from 'next/server';

/** Signed-out visitors go to /login. Cookies are httpOnly and host-only; the API decides whether they are valid. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = req.cookies.has('bmc_access') || req.cookies.has('bmc_refresh');
  if (!signedIn && pathname !== '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon.ico|icon.svg).*)'] };
