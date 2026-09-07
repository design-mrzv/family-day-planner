import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth/magicLink";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const home = new URL("/", request.url);

  if (!token) {
    home.searchParams.set("auth_error", "1");
    return NextResponse.redirect(home);
  }

  const result = await consumeMagicLink(token);
  if (!result) {
    home.searchParams.set("auth_error", "1");
    return NextResponse.redirect(home);
  }

  const jwt = await signSession(result.userId);
  const response = NextResponse.redirect(home);
  response.cookies.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
