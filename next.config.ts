import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone photos are often 3-8 MB; they are resized server-side after upload.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
