import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@atajoai/shared",
    "pg",
    "@prisma/adapter-pg",
    "@prisma/client",
    "@prisma/client-runtime-utils",
  ],
};

export default nextConfig;
