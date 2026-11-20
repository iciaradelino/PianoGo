import type { NextConfig } from "next";

// Built to plain files in out/ (`next build`), with no Node server: Azure
// Storage static websites and nginx serve them as they are. All data comes from the
// two services, whose URLs are read at runtime from public/config.js.
const nextConfig: NextConfig = {
  output: "export",
  // The image optimizer needs a server; the only image is an SVG logo.
  images: { unoptimized: true },
  agentRules: false,
  // The default bottom-left spot covers the Settings tab in the sidebar.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
