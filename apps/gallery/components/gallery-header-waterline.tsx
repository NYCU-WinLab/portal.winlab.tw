const VIEW_HEIGHT = 10
const AMPLITUDE = 2
const WAVELENGTH = 20
/** Fixed px per tile — not stretched to viewport width. */
const TILE_PX = 14
const TILE_COUNT = 160

function buildWavePath(width: number) {
  const mid = VIEW_HEIGHT / 2
  let d = ""

  for (let x = 0; x <= width; x += 1) {
    const y = mid + AMPLITUDE * Math.sin((2 * Math.PI * x) / WAVELENGTH)
    d += x === 0 ? `M ${x} ${y.toFixed(2)}` : ` L ${x} ${y.toFixed(2)}`
  }

  return d
}

const WAVE_PATH = buildWavePath(WAVELENGTH)

function WaveTile() {
  return (
    <svg
      aria-hidden
      width={TILE_PX}
      height={VIEW_HEIGHT}
      viewBox={`0 0 ${WAVELENGTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className="gallery-header-wave-tile"
    >
      <path
        d={WAVE_PATH}
        fill="none"
        stroke="#22aee0"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Word-style ~~~ wave — fixed-width tiles scroll seamlessly. */
export function GalleryHeaderWaterline() {
  return (
    <div className="gallery-header-waterline" aria-hidden>
      <div className="gallery-header-wave-track">
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <WaveTile key={index} />
        ))}
      </div>
    </div>
  )
}
