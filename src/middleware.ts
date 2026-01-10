import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Security Headers Middleware
 *
 * Adds important security headers to all responses to protect against:
 * - Clickjacking (X-Frame-Options)
 * - MIME-sniffing attacks (X-Content-Type-Options)
 * - XSS attacks (Content-Security-Policy)
 * - Information disclosure (Referrer-Policy, Permissions-Policy)
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter in older browsers
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Content Security Policy
  // Allows:
  // - Self-hosted scripts and styles (with unsafe-inline for Next.js)
  // - Vimeo embeds for video content (requires multiple Vimeo domains)
  // - Images from self and data URIs
  // - Connections to self and Vimeo
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://player.vimeo.com https://f.vimeocdn.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: https://i.vimeocdn.com",
    "font-src 'self' https://f.vimeocdn.com",
    "frame-src https://player.vimeo.com https://vimeo.com",
    "connect-src 'self' https://vimeo.com https://*.vimeo.com https://*.vimeocdn.com https://fresnel.vimeocdn.com",
    "media-src 'self' https://*.vimeo.com https://*.vimeocdn.com https://*.akamaized.net",
    "worker-src 'self' blob:",
    "child-src https://player.vimeo.com blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  // Strict Transport Security (HSTS)
  // Only set in production to avoid issues with local development
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return response;
}

// Apply middleware to all routes except static files and API routes that need different handling
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
