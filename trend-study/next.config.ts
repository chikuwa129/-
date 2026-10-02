import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ChromebookのLinux環境（http://penguin.linux.test:3000）から開発サーバーを開くため
  allowedDevOrigins: ["penguin.linux.test"],
};

export default nextConfig;
