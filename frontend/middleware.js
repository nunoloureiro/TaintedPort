import { NextResponse } from 'next/server';

export function middleware(request) {
  if (request.nextUrl.pathname.startsWith('/a')) {
    const expectedUser = process.env.ADMIN_USER;
    const expectedPass = process.env.ADMIN_PASS;

    if (!expectedUser || !expectedPass) {
      return new NextResponse('Admin area not configured. See .env.dist', {
        status: 503,
      });
    }

    const authHeader = request.headers.get('authorization');

    if (authHeader) {
      const [scheme, encoded] = authHeader.split(' ');
      if (scheme === 'Basic' && encoded) {
        const decoded = atob(encoded);
        const [user, pass] = decoded.split(':');
        if (user === expectedUser && pass === expectedPass) {
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
