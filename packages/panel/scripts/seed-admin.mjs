import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, createAccessControl } from "better-auth/plugins";

for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET"]) {
  if (!process.env[name]) {
    throw new Error(`${name} environment variable is required`);
  }
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

const adapter = new PrismaPg(pool, { schema: "app" });
const prisma = new PrismaClient({ adapter });

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

const limitedRole = accessControl.newRole({
  user: [],
  session: [],
});

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
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
        editor: limitedRole,
        viewer: limitedRole,
      },
    }),
  ],
});

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme1234";
const name = process.env.SEED_ADMIN_NAME ?? "Admin";

try {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    if (existingUser.role !== "admin") {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: "admin" },
      });
    }
    console.log(`Admin user already exists for ${email}`);
  } else {
    await auth.api.createUser({
      body: {
        email,
        password,
        name,
        role: "admin",
      },
    });
    console.log(`Admin user created for ${email}`);
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
