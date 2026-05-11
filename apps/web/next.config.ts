import type { NextConfig } from "next";

const INTERNAL_API_URL = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_FASTAPI_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/pulse/:path*",
        destination: `${INTERNAL_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
