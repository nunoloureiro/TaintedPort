import { NextResponse } from 'next/server';

export function middleware(request) {
  if (request.nextUrl.pathname.startsWith('/a')) {
    const authHeader = request.headers.get('authorization');

    if (authHeader) {
      const [scheme, encoded] = authHeader.split(' ');
      if (scheme === 'Basic' && encoded) {
        const decoded = atob(encoded);
        const [user, pass] = decoded.split(':');
        if (user === 'admin' && pass === 'taintedport') {
          return NextResponse.next();
        }
      }
    }

    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="TaintedPort Admin"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/a/:path*',
};
