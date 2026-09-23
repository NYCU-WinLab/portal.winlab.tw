/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  // lib/door/font.ts reads the door display font with fs at runtime. The
  // tracer does find that read today, but only by static analysis of the path
  // expression; pin it so a refactor cannot silently drop the file from the
  // functions behind openDoor(). Keys match as substrings, so the other /door
  // routes carry the 660 KB file too.
  outputFileTracingIncludes: {
    "/door": ["./lib/door/font/unifont-subset.bin"],
  },
  async redirects() {
    return [
      // bento.winlab.tw is retired — the app lives at /bento now
      {
        source: "/:path*",
        has: [{ type: "host", value: "bento.winlab.tw" }],
        destination: "https://portal.winlab.tw/bento",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ]
  },
}

export default nextConfig
