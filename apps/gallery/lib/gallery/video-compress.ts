"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

// Single-thread core — works without COOP/COEP / SharedArrayBuffer at the
// cost of being slower than the MT build. Trade-off we like: zero header
// gymnastics, ships behind the existing Vercel hosting.
// Served from public/ffmpeg (see scripts/sync-ffmpeg-core.mjs) — avoids CDN
// "Failed to fetch" when unpkg is blocked or offline.
function ffmpegCoreBase(): string {
  if (typeof window === "undefined") {
    return "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd"
  }
  return `${window.location.origin}/ffmpeg`
}

export const VIDEO_MAX_DURATION_SECONDS = 60
/** ST wasm heap is small — large inputs often hit "memory access out of bounds". */
export const VIDEO_MAX_INPUT_BYTES = 100 * 1024 * 1024

export type CompressPhase = "init" | "probe" | "compress" | "poster"

export type CompressResult = {
  video: Blob
  videoMime: "video/mp4"
  videoExt: "mp4"
  poster: Blob
  posterMime: "image/jpeg"
  posterExt: "jpg"
  durationSeconds: number
  width: number
  height: number
}

export type CompressOptions = {
  onProgress?: (ratio: number, phase: CompressPhase) => void
  signal?: AbortSignal
}

let ffmpegSingleton: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

function resetFFmpeg() {
  ffmpegSingleton = null
  ffmpegLoadPromise = null
}

async function getFFmpeg(
  onProgress?: CompressOptions["onProgress"]
): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    onProgress?.(0, "init")
    const ffmpeg = new FFmpeg()
    const base = ffmpegCoreBase()
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    ])
    onProgress?.(0.5, "init")
    await ffmpeg.load({ coreURL, wasmURL })
    ffmpegSingleton = ffmpeg
    onProgress?.(1, "init")
    return ffmpeg
  })()

  try {
    return await ffmpegLoadPromise
  } catch (err) {
    resetFFmpeg()
    throw err
  }
}

export function probeVideo(
  file: File
): Promise<{ durationSeconds: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute("src")
      video.load()
    }

    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration)
        ? video.duration
        : 0
      const width = video.videoWidth
      const height = video.videoHeight
      cleanup()
      if (!durationSeconds || !width || !height) {
        reject(new Error("Could not read video metadata."))
        return
      }
      resolve({ durationSeconds, width, height })
    }
    video.onerror = () => {
      cleanup()
      reject(new Error("Browser cannot decode this video."))
    }

    video.src = url
  })
}

/** Poster via canvas — avoids a second ffmpeg pass that often OOMs in ST wasm. */
export function captureVideoPoster(
  file: File,
  atSeconds: number,
  maxWidth = 720
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "auto"
    video.muted = true
    video.playsInline = true

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute("src")
      video.load()
    }

    video.onloadeddata = () => {
      const t = Math.min(
        Math.max(0, atSeconds),
        Math.max(0, video.duration - 0.05)
      )
      video.currentTime = t
    }
    video.onseeked = () => {
      const scale =
        video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1
      const w = Math.max(1, Math.round(video.videoWidth * scale))
      const h = Math.max(1, Math.round(video.videoHeight * scale))
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        cleanup()
        reject(new Error("Could not create poster canvas."))
        return
      }
      ctx.drawImage(video, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          cleanup()
          if (blob) resolve(blob)
          else reject(new Error("Could not encode poster."))
        },
        "image/jpeg",
        0.85
      )
    }
    video.onerror = () => {
      cleanup()
      reject(new Error("Browser cannot decode this video for a poster."))
    }

    video.src = url
  })
}

export function formatCompressError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/failed to fetch/i.test(raw)) {
    return (
      "Could not load the browser encoder — run `bun run sync-ffmpeg` in apps/gallery, " +
      "restart dev, and check network / ad blockers."
    )
  }
  if (/memory access out of bounds/i.test(raw)) {
    return (
      "Browser encoder ran out of memory — try a shorter clip (≤60s), " +
      `smaller file (≤${VIDEO_MAX_INPUT_BYTES / 1024 / 1024} MB), or 720p/1080p instead of 4K.`
    )
  }
  return raw
}

export async function compressVideo(
  file: File,
  opts: CompressOptions = {}
): Promise<CompressResult> {
  if (file.size > VIDEO_MAX_INPUT_BYTES) {
    throw new Error(
      `File too large (max ${VIDEO_MAX_INPUT_BYTES / 1024 / 1024} MB before compression).`
    )
  }

  opts.onProgress?.(0, "probe")
  const probe = await probeVideo(file)
  if (probe.durationSeconds > VIDEO_MAX_DURATION_SECONDS + 0.5) {
    throw new Error(
      `Video too long (max ${VIDEO_MAX_DURATION_SECONDS}s, got ${Math.round(probe.durationSeconds)}s).`
    )
  }
  opts.onProgress?.(1, "probe")

  const posterAt = probe.durationSeconds > 1.5 ? 1 : 0.1
  opts.onProgress?.(0, "poster")
  const poster = await captureVideoPoster(file, posterAt)
  opts.onProgress?.(1, "poster")

  const ffmpeg = await getFFmpeg(opts.onProgress)
  abortIfRequested(opts.signal)

  const inputName = `in.${guessInputExt(file)}`
  const outputName = "out.mp4"

  const onCompressProgress = ({ progress }: { progress: number }) => {
    const clamped = Math.max(0, Math.min(1, progress))
    opts.onProgress?.(clamped, "compress")
  }
  ffmpeg.on("progress", onCompressProgress)

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    abortIfRequested(opts.signal)

    opts.onProgress?.(0, "compress")
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      "scale='if(gt(iw,ih),min(720,iw),-2)':'if(gt(iw,ih),-2,min(720,ih))',fps=30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-maxrate",
      "1M",
      "-bufsize",
      "2M",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      outputName,
    ])
    abortIfRequested(opts.signal)
    opts.onProgress?.(1, "compress")

    const videoData = await ffmpeg.readFile(outputName)
    const videoBytes = toUint8Array(videoData)

    return {
      video: new Blob([videoBytes as BlobPart], { type: "video/mp4" }),
      videoMime: "video/mp4",
      videoExt: "mp4",
      poster,
      posterMime: "image/jpeg",
      posterExt: "jpg",
      durationSeconds: Math.round(probe.durationSeconds),
      width: probe.width,
      height: probe.height,
    }
  } catch (err) {
    resetFFmpeg()
    throw new Error(formatCompressError(err), { cause: err })
  } finally {
    ffmpeg.off("progress", onCompressProgress)
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ])
  }
}

function guessInputExt(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  if (file.type === "video/quicktime") return "mov"
  if (file.type === "video/mp4") return "mp4"
  if (file.type === "video/webm") return "webm"
  return "mp4"
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (typeof data === "string") return new TextEncoder().encode(data)
  throw new Error("Unexpected ffmpeg output type.")
}

function abortIfRequested(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Compression aborted.")
  }
}
