"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

// Single-thread core — works without COOP/COEP / SharedArrayBuffer at the
// cost of being slower than the MT build. Trade-off we like: zero header
// gymnastics, ships behind the existing Vercel hosting.
const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd"

export const VIDEO_MAX_DURATION_SECONDS = 60
export const VIDEO_MAX_INPUT_BYTES = 200 * 1024 * 1024

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

async function getFFmpeg(
  onProgress?: CompressOptions["onProgress"]
): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    onProgress?.(0, "init")
    const ffmpeg = new FFmpeg()
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
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
    ffmpegLoadPromise = null
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

  const ffmpeg = await getFFmpeg(opts.onProgress)
  abortIfRequested(opts.signal)

  const inputName = `in.${guessInputExt(file)}`
  const outputName = "out.mp4"
  const posterName = "poster.jpg"

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
      "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',fps=30",
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

    opts.onProgress?.(0, "poster")
    const posterAt = probe.durationSeconds > 1.5 ? "00:00:01" : "00:00:00.10"
    await ffmpeg.exec([
      "-ss",
      posterAt,
      "-i",
      outputName,
      "-frames:v",
      "1",
      "-vf",
      "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
      "-q:v",
      "5",
      posterName,
    ])
    opts.onProgress?.(1, "poster")
    abortIfRequested(opts.signal)

    const videoData = await ffmpeg.readFile(outputName)
    const posterData = await ffmpeg.readFile(posterName)

    const videoBytes = toUint8Array(videoData)
    const posterBytes = toUint8Array(posterData)

    return {
      video: new Blob([videoBytes as BlobPart], { type: "video/mp4" }),
      videoMime: "video/mp4",
      videoExt: "mp4",
      poster: new Blob([posterBytes as BlobPart], { type: "image/jpeg" }),
      posterMime: "image/jpeg",
      posterExt: "jpg",
      durationSeconds: Math.round(probe.durationSeconds),
      width: probe.width,
      height: probe.height,
    }
  } finally {
    ffmpeg.off("progress", onCompressProgress)
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
      ffmpeg.deleteFile(posterName),
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
