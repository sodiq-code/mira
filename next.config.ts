import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is used by the project's own container runtime.
  // Vercel's Next.js platform builds with its own output mode, so the
  // standalone flag is only applied outside Vercel.
  output: process.env.VERCEL ? undefined : ("standalone" as const),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
