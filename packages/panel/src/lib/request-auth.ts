import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import type { Session } from "@/lib/auth";

const isAuthDisabled = process.env.AUTH_DISABLED === "true";

const MOCK_SESSION: Session = {
  user: {
    id: "dev-admin",
    name: "Dev Admin",
    email: "dev@localhost",
    emailVerified: true,
    image: null,
    role: "admin",
    banned: null,
    banReason: null,
    banExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "dev-session",
    expiresAt: new Date(Date.now() + 86_400_000),
    token: "dev-token",
    ipAddress: null,
    userAgent: null,
    userId: "dev-admin",
    impersonatedBy: null,
  },
};

export async function getRequestSession(
  request: NextRequest | Request,
): Promise<Session | null> {
  if (isAuthDisabled) {
    return MOCK_SESSION;
  }

  return auth.api.getSession({
    headers: request.headers,
  });
}

export function hasWriteAccess(role: string | null | undefined): boolean {
  return role === "admin" || role === "editor";
}
