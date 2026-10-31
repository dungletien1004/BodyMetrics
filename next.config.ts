import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone photos are often 3-8 MB; they are resized server-side after upload.
    serverActions: { bodySizeLimit: "20mb" },
  },
  async headers() {
    return [
      {
        // OAuth consent screen: never framed (clickjacking), never leak its query to other sites.
        // "same-origin", not "no-referrer": with no-referrer browsers send `Origin: null` on the
        // consent form POST, which the authorize endpoint's origin check then rejects.
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
