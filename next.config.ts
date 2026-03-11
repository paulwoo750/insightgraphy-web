import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qyudomjgizwzhkqrrlhd.supabase.co", // ★ l(엘) 하나 뺐어!
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;