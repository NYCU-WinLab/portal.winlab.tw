import { ZodError } from "zod"

import { registerOAuthClient } from "@/lib/auth/oauth-clients"

export async function POST(request: Request) {
  try {
    const client = await registerOAuthClient(await request.json())
    return Response.json(client, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "invalid_client_metadata",
          error_description: error.issues
            .map((issue) => issue.message)
            .join(", "),
        },
        { status: 400 }
      )
    }
    return Response.json(
      {
        error: "server_error",
        error_description:
          error instanceof Error ? error.message : "Failed to register client",
      },
      { status: 500 }
    )
  }
}
