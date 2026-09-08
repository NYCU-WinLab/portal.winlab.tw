"use client"

import exifr from "exifr"

import {
  resolveTakenAtFromExifFields,
  type ExifDateFields,
} from "@/lib/gallery/extract-taken-at"

/**
 * Best-effort capture time from a browser File.
 * Never throws — missing EXIF just means the server falls back to upload time.
 */
export async function extractTakenAtFromFile(
  file: Blob
): Promise<string | null> {
  try {
    const fields = (await exifr.parse(file, {
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "DateTimeDigitized",
        "ModifyDate",
      ],
    })) as ExifDateFields | undefined
    return resolveTakenAtFromExifFields(fields)
  } catch {
    return null
  }
}
