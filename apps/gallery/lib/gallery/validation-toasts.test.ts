import { describe, expect, test } from "bun:test"

import {
  describeAlbumTitleRequired,
  describeCaptureDateRequired,
  describeCouldNotCopyClipboard,
  describeCouldNotCopyLinks,
  describeCouldNotSignOut,
  describeCouldNotStartSignIn,
  describeEnterATag,
  describeEnterATagSlugToRemove,
  describeInvalidTagSlug,
  describeNoMemoriesToPlay,
  describeNothingToDownload,
  describeSelectAtLeastOneBrokenShot,
  describeSelectAtLeastOnePhoto,
  describeSignInBeforeComment,
  describeSignInBeforeReact,
  describeTagLimitReached,
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

  test("selection and capture", () => {
    expect(describeSelectAtLeastOnePhoto()).toBe("Select at least one photo.")
    expect(describeSelectAtLeastOneBrokenShot()).toBe(
      "Select at least one broken shot."
    )
    expect(describeCaptureDateRequired()).toBe("Pick a capture date.")
  })

  test("manage tags and memories", () => {
    expect(describeEnterATag()).toBe("Enter a tag.")
    expect(describeEnterATagSlugToRemove()).toBe("Enter a tag slug to remove.")
    expect(describeNoMemoriesToPlay()).toBe("No memories to play right now.")
  })

  test("auth chrome and filters", () => {
    expect(describeCouldNotSignOut()).toBe("Could not sign out.")
    expect(describeCouldNotStartSignIn()).toBe("Could not start sign-in.")
    expect(describeInvalidTagSlug()).toBe(
      "Use letters, numbers, or hyphens for a tag slug."
    )
  })

  test("tag limit", () => {
    expect(describeTagLimitReached(8)).toBe("At most 8 tags per photo.")
  })
})
