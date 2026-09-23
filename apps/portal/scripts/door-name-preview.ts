// Prints what the door's LED panel shows for a name, as ASCII art.
//
// From apps/portal:
//   bun scripts/door-name-preview.ts 詹詠翔 郭愷 "Simon Chu"

import {
  bitmapToAscii,
  doorDisplayName,
  renderNameBitmap,
} from "@/lib/door/display"

for (const name of process.argv.slice(2)) {
  const label = doorDisplayName(name, null)
  console.log(`${name} -> ${label}`)
  console.log(bitmapToAscii(renderNameBitmap(label)))
  console.log()
}
