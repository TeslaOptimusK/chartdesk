import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Windows launcher and Chrome --app= use 127.0.0.1; allow both forms in dev.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
