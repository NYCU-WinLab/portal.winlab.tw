const VIEW_HEIGHT = 10
/** Fixed px per tile — matches waterline tile rhythm. */
const TILE_PX = 14
const TILE_COUNT = 160

function PitchTile() {
  return (
    <svg
      aria-hidden
      width={TILE_PX}
      height={VIEW_HEIGHT}
      viewBox={`0 0 ${TILE_PX} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className="gallery-header-pitch-tile"
    >
      <line
        x1="0"
        y1="5"
        x2={TILE_PX}
        y2="5"
        stroke="rgba(34, 140, 62, 0.92)"
        strokeWidth="1.1"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Single turf line — same pattern as the dragon-boat waterline (stroke only, no fill band). */
export function GalleryHeaderPitchline() {
  return (
    <div className="gallery-header-pitchline" aria-hidden>
      <div className="gallery-header-pitch-track">
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <PitchTile key={index} />
        ))}
      </div>
    </div>
  )
}
