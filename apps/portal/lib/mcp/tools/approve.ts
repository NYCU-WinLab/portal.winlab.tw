import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  fetchDocument,
  fetchDocumentFields,
  fetchDocumentSigners,
  fetchInboxDocuments,
  fetchSentDocuments,
  fetchSignedDocuments,
  type DocumentCreator,
  type SignerWithProfile,
} from "@/lib/approve/fetch"
import { documentStatusLabel, fieldCategoryLabel } from "@/lib/approve/labels"
import type { ApproveDocument, ApproveField } from "@/lib/approve/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

type ListedDocument = {
  document: ApproveDocument
  creator: DocumentCreator | null
  mySignature: { status: string; signed_at: string | null } | null
}

function documentUrl(documentId: string, needsMySignature: boolean): string {
  const route = needsMySignature ? "sign" : "view"
  return `${PORTAL_URL}/approve/${route}/${documentId}`
}

function signerSummary(signer: SignerWithProfile) {
  return {
    signer_id: signer.signer_id,
    name: signer.profile?.name ?? null,
    email: signer.profile?.email ?? null,
    status: signer.status,
    signed_at: signer.signed_at,
  }
}

// A signature's value is the drawn image; a predefined field's value is the
// member's address or id number. Neither belongs in a tool result, so only
// the fact that the field is filled comes back.
function fieldSummary(field: ApproveField, signerNames: Map<string, string>) {
  return {
    id: field.id,
    label: field.label,
    category: field.category,
    category_label: fieldCategoryLabel(field.category),
    page: field.page,
    assigned_signer_id: field.signer_id,
    assigned_to: field.signer_id
      ? (signerNames.get(field.signer_id) ?? null)
      : null,
    filled: field.signed_at !== null || !!field.value,
  }
}

export function registerApproveTools(server: McpServer) {
  server.registerTool(
    "list_approve_documents",
    {
      title: "List approve documents",
      description:
        "Documents in the signing app (/approve): box=inbox is what the member still has to sign, signed is what they already signed, sent is what they created. A member only ever sees documents they created or are a signer on, and the signers array carries every signer for a document they created but only their own row otherwise. Signing itself happens in the browser on the PDF, so there is no tool for it: send the member the url.",
      inputSchema: z.object({
        box: z
          .enum(["inbox", "signed", "sent"])
          .default("inbox")
          .describe("Which list to read"),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    },
    async ({ box, limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)

        let listed: ListedDocument[]
        if (box === "sent") {
          const docs = await fetchSentDocuments(supabase, caller.userId)
          listed = docs.map((document) => ({
            document,
            creator: {
              id: caller.userId,
              name: caller.name,
              email: caller.email,
            },
            mySignature: null,
          }))
        } else {
          const rows =
            box === "inbox"
              ? await fetchInboxDocuments(supabase, caller.userId)
              : await fetchSignedDocuments(supabase, caller.userId)
          listed = rows
            .filter((row) => !!row.document)
            .map((row) => ({
              document: row.document,
              creator: row.document.creator,
              mySignature: { status: row.status, signed_at: row.signed_at },
            }))
        }

        const page = listed.slice(0, limit)
        const signers = await fetchDocumentSigners(
          supabase,
          page.map((item) => item.document.id)
        )
        const byDocument = new Map<string, SignerWithProfile[]>()
        for (const signer of signers) {
          const bucket = byDocument.get(signer.document_id) ?? []
          bucket.push(signer)
          byDocument.set(signer.document_id, bucket)
        }

        const documents = page.map(({ document, creator, mySignature }) => ({
          id: document.id,
          title: document.title,
          status: document.status,
          status_label: documentStatusLabel(document.status),
          created_by: document.created_by,
          created_by_name: creator?.name ?? null,
          created_at: document.created_at,
          completed_at: document.completed_at,
          my_signature: mySignature,
          signers: (byDocument.get(document.id) ?? []).map(signerSummary),
          url: documentUrl(document.id, box === "inbox"),
        }))

        return json({ box, count: documents.length, documents })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "get_approve_document",
    {
      title: "Get approve document",
      description:
        "One signing document (/approve) with its signers, how far the signing has got, and a summary of its fields. The creator sees every signer and field; a signer sees only their own row and their own fields, and a document the member neither created nor signs is reported as not found. Field values and signature images are never returned, only whether each field is filled, and signing stays in the browser.",
      inputSchema: z.object({
        document_id: z
          .uuid()
          .describe("Document id from list_approve_documents"),
      }),
    },
    async ({ document_id }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const document = await fetchDocument(supabase, document_id)
        if (!document) {
          return failure(new Error("document not found or not shared with you"))
        }

        const [signers, fields] = await Promise.all([
          fetchDocumentSigners(supabase, [document.id]),
          fetchDocumentFields(supabase, document.id),
        ])

        const isCreator = document.created_by === caller.userId
        const signerNames = new Map<string, string>()
        for (const signer of signers) {
          if (signer.profile?.name) {
            signerNames.set(signer.signer_id, signer.profile.name)
          }
        }
        const creatorName = isCreator
          ? caller.name
          : ((
              await supabase
                .from("user_profiles")
                .select("name")
                .eq("id", document.created_by)
                .maybeSingle()
            ).data?.name ?? null)

        const signed = signers.filter((s) => s.status === "signed").length
        const myTurn = signers.some(
          (s) => s.signer_id === caller.userId && s.status === "pending"
        )
        return json({
          document: {
            id: document.id,
            title: document.title,
            status: document.status,
            status_label: documentStatusLabel(document.status),
            created_by: document.created_by,
            created_by_name: creatorName,
            created_at: document.created_at,
            completed_at: document.completed_at,
            viewer_role: isCreator ? "creator" : "signer",
            url: documentUrl(document.id, myTurn),
          },
          progress: {
            visible_signers: signers.length,
            signed,
            pending: signers.length - signed,
            complete_for_everyone: document.completed_at !== null,
          },
          signers: signers.map(signerSummary),
          fields: fields.map((field) => fieldSummary(field, signerNames)),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
