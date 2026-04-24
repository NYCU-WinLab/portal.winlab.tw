import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

export type SignerInvitedProps = {
  documentTitle: string
  creatorName: string
  signUrl: string
}

export function SignerInvited({
  documentTitle,
  creatorName,
  signUrl,
}: SignerInvitedProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${creatorName} 邀請你簽核：${documentTitle}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>有一份文件等你簽名</Heading>
          <Text style={p}>
            <strong>{creatorName}</strong> 邀請你簽核：
          </Text>
          <Text style={title}>{documentTitle}</Text>
          <Section style={buttonWrap}>
            <Button href={signUrl} style={button}>
              前往簽名
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={muted}>如果按鈕無法點擊，把下面的連結貼到瀏覽器：</Text>
          <Text style={link}>{signUrl}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default SignerInvited

const body = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif',
}
const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px 24px",
}
const h1 = {
  fontSize: "22px",
  fontWeight: 600,
  color: "#111111",
  margin: "0 0 24px 0",
}
const p = { fontSize: "15px", color: "#333333", lineHeight: "1.6" }
const title = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#111111",
  padding: "12px 16px",
  backgroundColor: "#f4f4f5",
  borderRadius: "6px",
  margin: "8px 0 24px 0",
}
const buttonWrap = { margin: "24px 0" }
const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "15px",
  fontWeight: 500,
  textDecoration: "none",
  display: "inline-block",
}
const hr = { borderColor: "#e4e4e7", margin: "32px 0" }
const muted = { fontSize: "13px", color: "#71717a", margin: "0 0 4px 0" }
const link = {
  fontSize: "13px",
  color: "#71717a",
  wordBreak: "break-all" as const,
}
