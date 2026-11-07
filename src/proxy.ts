import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: sends visitors without a session cookie to /login. The real check is the
// data access layer (src/lib/dal.ts), which verifies the session on every data read and write.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, auth endpoints and static files.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
