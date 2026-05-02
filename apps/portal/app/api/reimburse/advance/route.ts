import { promises as fs } from "node:fs"
import path from "node:path"

import { NextResponse, type NextRequest } from "next/server"
import { PDFDocument, StandardFonts } from "pdf-lib"

import { createClient } from "@/lib/supabase/server"
import { REIMBURSE_BUCKETS } from "@/lib/reimburse/types"

interface AdvancePayload {
  applicant_name: string
  item_name: string
  item_amount: number
  item_comment: string | null
  invoice_date: string
  invoice_path: string
  signature_path: string
}

// StandardFonts.Helvetica is WinAnsi-only; strip any non-ASCII so we don't
// crash when applicants enter Chinese names. The signature image still gives
// the page authorial weight.
function toAscii(input: string): string {
  return input.replace(/[^\x20-\x7E]/g, "")
}

function dateForFilename(invoiceDate: string): string {
  const clean = invoiceDate.replace(/-/g, "")
  if (clean.length === 8) return clean
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("")
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as AdvancePayload
    const {
      applicant_name,
      item_name,
      item_amount,
      item_comment,
      invoice_date,
      invoice_path,
      signature_path,
    } = payload

    if (
      !applicant_name ||
      !item_name ||
      !Number.isFinite(item_amount) ||
      !invoice_date ||
      !invoice_path ||
      !signature_path
    ) {
      return NextResponse.json(
        { message: "缺少必要欄位，請確認資料後重試" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { message: "請先登入再進行操作" },
        { status: 401 }
      )
    }

    const templatePath = path.join(
      process.cwd(),
      "public",
      "reimburse",
      "advance.pdf"
    )
    const templateBytes = await fs.readFile(templatePath)

    const { data: invoiceFile, error: invoiceErr } = await supabase.storage
      .from(REIMBURSE_BUCKETS.invoices)
      .download(invoice_path)
    if (invoiceErr || !invoiceFile) {
      return NextResponse.json({ message: "取得發票檔案失敗" }, { status: 400 })
    }
    const invoiceBytes = await invoiceFile.arrayBuffer()

    const { data: signatureFile, error: sigErr } = await supabase.storage
      .from(REIMBURSE_BUCKETS.signatures)
      .download(signature_path)
    if (sigErr || !signatureFile) {
      return NextResponse.json({ message: "取得簽名檔案失敗" }, { status: 400 })
    }
    const signatureBytes = await signatureFile.arrayBuffer()

    const templatePdf = await PDFDocument.load(templateBytes)
    const textFont = await templatePdf.embedFont(StandardFonts.Helvetica)
    const firstPage = templatePdf.getPage(0)
    const { width, height } = firstPage.getSize()

    firstPage.drawText(toAscii(applicant_name), {
      x: 90,
      y: height - 110,
      size: 12,
      font: textFont,
    })
    firstPage.drawText(toAscii(item_name), {
      x: 90,
      y: height - 170,
      size: 12,
      font: textFont,
    })
    firstPage.drawText(item_amount.toString(), {
      x: width - 150,
      y: height - 170,
      size: 12,
      font: textFont,
    })
    if (item_comment) {
      firstPage.drawText(toAscii(item_comment), {
        x: 90,
        y: height - 200,
        size: 10,
        font: textFont,
        maxWidth: width - 180,
        lineHeight: 12,
      })
    }
    firstPage.drawText(invoice_date, {
      x: width - 180,
      y: height - 110,
      size: 12,
      font: textFont,
    })

    const sigImage = await templatePdf.embedPng(signatureBytes)
    const sigWidth = 180
    const sigHeight = 60
    firstPage.drawImage(sigImage, {
      x: width - sigWidth - 80,
      y: 80,
      width: sigWidth,
      height: sigHeight,
    })

    const invoicePdf = await PDFDocument.load(invoiceBytes)
    const copiedPages = await templatePdf.copyPages(
      invoicePdf,
      invoicePdf.getPageIndices()
    )
    copiedPages.forEach((p) => templatePdf.addPage(p))

    const finalBytes = await templatePdf.save()

    const safeName = applicant_name.replace(/[^a-zA-Z0-9一-龥_-]/g, "")
    const datePart = dateForFilename(invoice_date)
    const outputPath = `${user.id}/advance_${safeName || "user"}_${datePart}.pdf`

    const { error: uploadErr } = await supabase.storage
      .from(REIMBURSE_BUCKETS.advances)
      .upload(outputPath, finalBytes, {
        cacheControl: "3600",
        upsert: true,
        contentType: "application/pdf",
      })

    if (uploadErr) {
      return NextResponse.json(
        { message: "上傳合成後 PDF 失敗" },
        { status: 500 }
      )
    }

    return NextResponse.json({ path: outputPath }, { status: 200 })
  } catch (error) {
    console.error("[reimburse] advance pdf failed", error)
    return NextResponse.json(
      { message: "產生報帳 PDF 失敗，請稍後再試" },
      { status: 500 }
    )
  }
}
