/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/gallery/**",
      },
    ],
  },
  // Default Server Action body cap is 1 MB. Phone originals (HEIC ~3 MB,
  // JPEG ~5–8 MB) blow right past it — desktop screenshots squeak under,
  // hence the "works on laptop, dies on phone" mystery.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
}

export default nextConfig
