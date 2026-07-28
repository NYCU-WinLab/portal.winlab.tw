import {
  Body,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

export type RecurringFailedProps = {
  title: string
  /** Already formatted, e.g. "08/03（週一）09:00–10:00". */
  when: string
  reason: string
}

// Portal runs in Geist Mono (see app/layout.tsx + globals.css). Match that
// in email too; system mono fallback covers clients that skip <Font>.
const FONT_STACK =
  '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

export function RecurringFailed({ title, when, reason }: RecurringFailedProps) {
  return (
    <Html lang="zh-Hant">
      <Head>
        <Font
          fontFamily="Geist Mono"
          fallbackFontFamily="monospace"
          webFont={{
            url: "https://fonts.gstatic.com/s/geistmono/v3/or3sQ6P-YJ3kg-7SKRMNME-yy4Dt-S1r.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{`固定會議沒訂到教室：${title}（${when}）`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>WinLab Rooms</Text>
          <Hr style={hr} />
          <Heading style={h1}>固定會議沒訂到教室</Heading>
          <Text style={p}>
            這是你設定的固定會議,系統在一週前自動訂房時失敗了。
            <strong style={strong}>沒有人收到邀請</strong>
            ,需要你自己處理這一次。
          </Text>
          <Section style={card}>
            <Text style={cardTitle}>{title}</Text>
            <Text style={cardMeta}>{when}</Text>
            <Text style={cardMeta}>原因:{reason}</Text>
          </Section>
          <Text style={muted}>後續的場次不受影響,系統下次還是會照常嘗試。</Text>
          <Text style={footer}>portal.winlab.tw/rooms</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default RecurringFailed

// Token map (see packages/ui/src/styles/globals.css — shadcn neutral scale).
// Email clients can't touch CSS variables so we resolve to hex here.
const C = {
  bg: "#ffffff",
  fg: "#171717",
  mutedBg: "#f5f5f5",
  mutedFg: "#737373",
  border: "#e5e5e5",
} as const

const body = {
  backgroundColor: C.bg,
  color: C.fg,
  fontFamily: FONT_STACK,
  margin: 0,
  padding: 0,
}
const container = { maxWidth: "560px", margin: "0 auto", padding: "48px 24px" }
const brand = {
  fontSize: "12px",
  fontWeight: 500,
  color: C.mutedFg,
  letterSpacing: "0.02em",
  margin: "0 0 24px 0",
  textTransform: "uppercase" as const,
}
const hr = {
  borderColor: C.border,
  borderTop: `1px solid ${C.border}`,
  borderBottom: "none",
  margin: "24px 0",
}
const h1 = {
  fontSize: "20px",
  fontWeight: 600,
  color: C.fg,
  lineHeight: "1.4",
  margin: "0 0 20px 0",
}
const p = {
  fontSize: "14px",
  color: C.fg,
  lineHeight: "1.7",
  margin: "0 0 12px 0",
}
const strong = { fontWeight: 600, color: C.fg }
const card = {
  border: `1px solid ${C.border}`,
  borderRadius: "10px",
  backgroundColor: C.mutedBg,
  padding: "16px 20px",
  margin: "8px 0 28px 0",
}
const cardTitle = {
  fontSize: "14px",
  fontWeight: 500,
  color: C.fg,
  margin: "0 0 8px 0",
  lineHeight: "1.5",
}
const cardMeta = {
  fontSize: "13px",
  color: C.mutedFg,
  margin: "0 0 4px 0",
  lineHeight: "1.6",
}
const muted = {
  fontSize: "12px",
  color: C.mutedFg,
  margin: "0 0 6px 0",
  lineHeight: "1.6",
}
const footer = {
  fontSize: "11px",
  color: C.mutedFg,
  margin: "40px 0 0 0",
  letterSpacing: "0.02em",
}
