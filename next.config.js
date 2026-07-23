/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  // The temporary demo-seeding route reads video files at runtime via a
  // computed path, which Vercel's file tracer can miss — force-include
  // them so the serverless bundle actually contains prisma/demo-assets.
  outputFileTracingIncludes: {
    "/api/admin/seed-demo": ["./prisma/demo-assets/**/*"],
  },
};

module.exports = nextConfig;
