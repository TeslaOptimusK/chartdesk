import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // README opens the dev server at 127.0.0.1. Next blocks that host's
  // dev assets unless it is listed here, which leaves the UI on the loading shell.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
