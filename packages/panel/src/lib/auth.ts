import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, createAccessControl } from "better-auth/plugins";
import { prisma } from "@atajoai/db";
import { env } from "@/env";

const isBuildPhase =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE === "phase-production-build";

const buildSafeSecret =
  env.BETTER_AUTH_SECRET ??
  (isBuildPhase
    ? "build-only-secret-build-only-secret-build-only-secret-1234"
    : undefined);

const buildSafeBaseUrl =
  env.BETTER_AUTH_URL ?? (isBuildPhase ? "http://localhost:3000" : undefined);

const accessControl = createAccessControl({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});

const adminRole = accessControl.newRole({
  user: ["create", "list", "set-role", "delete", "get", "update"],
  session: ["list", "revoke", "delete"],
});

const editorRole = accessControl.newRole({
  user: [],
  session: [],
});

const viewerRole = accessControl.newRole({
  user: [],
  session: [],
});

export const auth = betterAuth({
  secret: buildSafeSecret,
  baseURL: buildSafeBaseUrl,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [
    admin({
      ac: accessControl,
      adminRoles: ["admin"],
      defaultRole: "viewer",
      roles: {
        admin: adminRole,
        editor: editorRole,
        viewer: viewerRole,
      },
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
