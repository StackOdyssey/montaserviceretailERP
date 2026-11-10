import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { isLiveSession } from "@/lib/session";

// App interne : aucune indexation/archivage, quel que soit le domaine (Cloud Run ou futur domaine).
const NO_INDEX = "noindex, nofollow, noarchive, nosnippet, noimageindex";

function noIndex(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", NO_INDEX);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Chemins publics toujours autorisés (API NON publique : toute route /api exige une session)
  if (
    pathname === "/robots.txt" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/bashan-logo.png" ||
    pathname.startsWith("/bm-motors-logo") ||
    pathname === "/apple-touch-icon.png" ||
    pathname.startsWith("/icon-") ||
    pathname === "/favicon.ico"
  ) {
    return noIndex(NextResponse.next());
  }

  // 2. Vérification du cookie de session
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = await isLiveSession(sessionCookie);

  // 3. Redirection vers la page de connexion si non authentifié
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    return noIndex(NextResponse.redirect(loginUrl));
  }

  return noIndex(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
