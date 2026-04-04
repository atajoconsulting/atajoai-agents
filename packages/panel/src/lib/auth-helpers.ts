import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

export async function getServerSession(): Promise<Session | null> {
  if (isAuthDisabled) {
    return MOCK_SESSION;
  }

  const requestHeaders = new Headers(await headers());
  return auth.api.getSession({
    headers: requestHeaders,
  });
}

export async function requireSession(): Promise<Session> {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireAdminSession(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}
