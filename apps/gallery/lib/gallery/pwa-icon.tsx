type PwaIconProps = {
  size: number
}

/** Polaroid-style mark for manifest / favicon ImageResponse routes. */
export function GalleryPwaIcon({ size }: PwaIconProps) {
  const fontSize = Math.round(size * 0.38)
  const border = Math.max(2, Math.round(size * 0.035))
  const frameWidth = Math.round(size * 0.72)
  const frameHeight = Math.round(size * 0.84)

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f0e8",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: frameWidth,
          height: frameHeight,
          background: "white",
          boxShadow: `0 ${border}px ${border * 3}px rgba(0,0,0,0.14)`,
          transform: "rotate(-3deg)",
        }}
      >
        <span
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize,
            fontStyle: "italic",
            color: "#1c1917",
            lineHeight: 1,
          }}
        >
          G
        </span>
      </div>
    </div>
  )
}
