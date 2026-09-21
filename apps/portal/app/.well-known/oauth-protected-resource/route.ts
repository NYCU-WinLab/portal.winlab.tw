import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler"

import { supabaseIssuer } from "@/lib/mcp/supabase"

// RFC 9728 document MCP clients read to find out who issues our tokens.
// Supabase Auth is the authorization server; Keycloak stays behind it.
const handler = protectedResourceHandler({
  authServerUrls: [supabaseIssuer()],
})

const corsHandler = metadataCorsOptionsRequestHandler()

export { handler as GET, corsHandler as OPTIONS }
