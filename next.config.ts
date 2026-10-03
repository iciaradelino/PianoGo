import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The default bottom-left spot covers the Settings tab in the sidebar.
  devIndicators: { position: "bottom-right" },
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
