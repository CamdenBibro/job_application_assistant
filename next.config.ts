import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

function getLocalLanOrigins() {
  const interfaces = networkInterfaces();
  const lanOrigins = new Set<string>();

  for (const interfaceDetails of Object.values(interfaces)) {
    for (const detail of interfaceDetails ?? []) {
      const isIpv4 = detail.family === "IPv4";
      if (!isIpv4 || detail.internal) continue;
      lanOrigins.add(detail.address);
    }
  }

  return [...lanOrigins];
}

const envAllowedOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin dev/HMR by default. Allow local LAN hosts.
  allowedDevOrigins: [...new Set([...getLocalLanOrigins(), ...envAllowedOrigins])],
};

export default nextConfig;
