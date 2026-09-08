/** Soft-fail localStorage / sessionStorage access (private mode, quota). */

export function readStorageItem(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string
): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorageItem(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  value: string
): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
