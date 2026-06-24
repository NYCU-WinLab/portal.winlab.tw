import path from "path"
import { fileURLToPath } from "url"

const monorepoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/gallery/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/render/image/public/gallery/**",
      },
    ],
  },
  // Gallery uploads go to Supabase Storage from the browser (bypasses Vercel
  // ~4.5MB request limit on Server Actions). Remaining actions are small JSON.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
}

export default nextConfig
