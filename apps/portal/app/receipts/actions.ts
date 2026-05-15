"use server"

import { after } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { drainOutboxBatch } from "@/lib/receipts/email-drain"

// Called by useUploadReceipt's onSuccess from the client. The actual drain
// runs with the admin client and bypasses RLS, so this gate isn't about data
// safety — it just keeps unauthenticated / non-receipts-admin callers from
// poking the queue. Silent returns (no throw) so a notification glitch never
// surfaces as an upload failure.
export async function triggerReceiptEmailDrain(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: ok } = await supabase.rpc("is_receipts_admin")
  if (!ok) return

  // Fire after the response goes out so the user doesn't wait on Resend.
  // The daily cron sweep is our safety net for anything this misses.
  after(async () => {
    try {
      await drainOutboxBatch()
    } catch (err) {
      console.error("[receipts] after() drain failed", err)
    }
  })
}
