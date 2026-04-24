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

export type DocumentCompletedProps = {
  documentTitle: string
  signerNames: string[]
  viewUrl: string
}

export function DocumentCompleted({
  documentTitle,
  signerNames,
  viewUrl,
}: DocumentCompletedProps) {
  return (
    <Html>
      <Head />
      <Preview>{`大家都簽好了：${documentTitle}`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>簽核完成</Heading>
          <Text style={p}>你的文件所有簽核人都簽好了：</Text>
          <Text style={title}>{documentTitle}</Text>
          <Text style={p}>
            已簽核：<strong>{signerNames.join("、")}</strong>
          </Text>
          <Section style={buttonWrap}>
            <Button href={viewUrl} style={button}>
              查看文件
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={muted}>如果按鈕無法點擊，把下面的連結貼到瀏覽器：</Text>
          <Text style={link}>{viewUrl}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default DocumentCompleted

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
