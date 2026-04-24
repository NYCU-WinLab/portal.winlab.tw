import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

export type SignerInvitedProps = {
  documentTitle: string
  creatorName: string
  signUrl: string
}

// Portal runs in Geist Mono (see app/layout.tsx + globals.css). Match that
// in email too; system mono fallback covers clients that skip <Font>.
const FONT_STACK =
  '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

export function SignerInvited({
  documentTitle,
  creatorName,
  signUrl,
}: SignerInvitedProps) {
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
      <Preview>{`${creatorName} 邀請你簽核：${documentTitle}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>WinLab Approve</Text>
          <Hr style={hr} />
          <Heading style={h1}>有一份文件等你簽名</Heading>
          <Text style={p}>
            <strong style={strong}>{creatorName}</strong> 邀請你簽核：
          </Text>
          <Section style={docCard}>
            <Text style={docTitle}>{documentTitle}</Text>
          </Section>
          <Section style={buttonWrap}>
            <Button href={signUrl} style={button}>
              前往簽名
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={muted}>按鈕無法點擊時，把連結貼到瀏覽器：</Text>
          <Link href={signUrl} style={link}>
            {signUrl}
          </Link>
          <Text style={footer}>portal.winlab.tw</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default SignerInvited

// Token map (see packages/ui/src/styles/globals.css — shadcn neutral scale).
// Email clients can't touch CSS variables so we resolve to hex here.
const C = {
  bg: "#ffffff",
  fg: "#171717",
  mutedBg: "#f5f5f5",
  mutedFg: "#737373",
  border: "#e5e5e5",
  primary: "#171717",
  primaryFg: "#fafafa",
} as const

const body = {
  backgroundColor: C.bg,
  color: C.fg,
  fontFamily: FONT_STACK,
  margin: 0,
  padding: 0,
}
const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "48px 24px",
}
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
const docCard = {
  border: `1px solid ${C.border}`,
  borderRadius: "10px",
  backgroundColor: C.mutedBg,
  padding: "16px 20px",
  margin: "8px 0 28px 0",
}
const docTitle = {
  fontSize: "14px",
  fontWeight: 500,
  color: C.fg,
  margin: 0,
  lineHeight: "1.5",
}
const buttonWrap = { margin: "0 0 8px 0" }
const button = {
  backgroundColor: C.primary,
  color: C.primaryFg,
  padding: "12px 22px",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: 500,
  textDecoration: "none",
  display: "inline-block",
  fontFamily: FONT_STACK,
}
const muted = {
  fontSize: "12px",
  color: C.mutedFg,
  margin: "0 0 6px 0",
  lineHeight: "1.5",
}
const link = {
  fontSize: "12px",
  color: C.mutedFg,
  textDecoration: "underline",
  wordBreak: "break-all" as const,
}
const footer = {
  fontSize: "11px",
  color: C.mutedFg,
  margin: "40px 0 0 0",
  letterSpacing: "0.02em",
}
