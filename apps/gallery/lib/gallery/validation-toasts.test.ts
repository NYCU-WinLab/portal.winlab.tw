import { describe, expect, test } from "bun:test"

import {
  describeAlbumTitleRequired,
  describeCouldNotCopyClipboard,
  describeCouldNotCopyLinks,
  describeNothingToDownload,
  describeSignInBeforeComment,
  describeSignInBeforeReact,
  describeTagMergeTargetRequired,
  describeTagNameRequired,
  describeUploadFileEmpty,
  describeUploadFileRequired,
} from "@/lib/gallery/validation-toasts"

describe("validation toasts", () => {
  test("album title", () => {
    expect(describeAlbumTitleRequired()).toBe(
      "Give the album a name with letters or numbers."
    )
  })

  test("clipboard", () => {
    expect(describeCouldNotCopyLinks()).toBe(
      "Could not copy links in this context."
    )
    expect(describeCouldNotCopyClipboard()).toBe(
      "Could not copy to the clipboard."
    )
  })

  test("auth gates", () => {
    expect(describeSignInBeforeComment()).toBe(
      "Please sign in before commenting."
    )
    expect(describeSignInBeforeReact()).toBe("Please sign in before reacting.")
  })

  test("tag admin", () => {
    expect(describeTagNameRequired()).toBe("Give the tag a usable name.")
    expect(describeTagMergeTargetRequired()).toBe(
      "Pick a target tag to merge into."
    )
  })

  test("upload form", () => {
    expect(describeUploadFileRequired()).toBe("Pick a file.")
    expect(describeUploadFileEmpty()).toBe(
      "One of the selected files is empty."
    )
  })

  test("download", () => {
    expect(describeNothingToDownload()).toBe("Nothing to download.")
  })
})
