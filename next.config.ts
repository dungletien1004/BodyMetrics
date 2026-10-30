import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone photos are often 3-8 MB; they are resized server-side after upload.
    serverActions: { bodySizeLimit: "20mb" },
  },
  async headers() {
    return [
      {
        // OAuth consent screen: never framed (clickjacking), never leak its query via Referer.
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
