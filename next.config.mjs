/** @type {import('next').NextConfig} */
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    const pressespiegelBaseUrl =
      process.env.PRESSESPIEGEL_BASE_URL || "http://127.0.0.1:5000";

    return [
      {
        source: "/pressespiegel",
        destination: `${pressespiegelBaseUrl}/pressespiegel`,
      },
      {
        source: "/pressespiegel/:path*",
        destination: `${pressespiegelBaseUrl}/pressespiegel/:path*`,
      },
      {
        source: "/jobs/:path*",
        destination: `${pressespiegelBaseUrl}/jobs/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${pressespiegelBaseUrl}/static/:path*`,
      },
      {
        source: "/assets/:path*",
        destination: `${pressespiegelBaseUrl}/assets/:path*`,
      },
      {
        source: "/login",
        destination: `${pressespiegelBaseUrl}/login`,
      },
      {
        source: "/logout",
        destination: `${pressespiegelBaseUrl}/logout`,
      },
    ];
  },
};

export default nextConfig;
