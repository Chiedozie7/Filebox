import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localDevOrigins = Object.values(networkInterfaces())
  .flatMap(interfaces => interfaces ?? [])
  .filter(address => address.family === "IPv4" && !address.internal)
  .map(address => address.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: localDevOrigins,
};

export default nextConfig;
