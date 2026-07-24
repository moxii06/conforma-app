/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  // The temporary migrate-prod route reads migration.sql files at runtime
  // via a computed path, which Vercel's file tracer can miss — force-include
  // them so the serverless bundle actually contains prisma/migrations.
  outputFileTracingIncludes: {
    "/api/admin/migrate-prod": ["./prisma/migrations/**/*"],
  },
};

module.exports = nextConfig;
