/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    // Bundle seed-data.xlsx into the serverless function so /api/admin/seed
    // can read it. public/ alone serves as static assets only.
    outputFileTracingIncludes: {
      "/api/admin/seed": ["./public/seed-data.xlsx"],
    },
  },
};

export default nextConfig;
