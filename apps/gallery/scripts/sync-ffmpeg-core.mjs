import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const galleryRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const from = join(galleryRoot, "node_modules", "@ffmpeg", "core", "dist", "umd")
const to = join(galleryRoot, "public", "ffmpeg")

if (!existsSync(join(from, "ffmpeg-core.js"))) {
  console.error("sync-ffmpeg-core: @ffmpeg/core umd files not found at", from)
  console.error("Run `bun install` in apps/gallery first.")
  process.exit(1)
}

mkdirSync(to, { recursive: true })
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  cpSync(join(from, name), join(to, name))
}
console.log("sync-ffmpeg-core: copied umd build to public/ffmpeg/")
