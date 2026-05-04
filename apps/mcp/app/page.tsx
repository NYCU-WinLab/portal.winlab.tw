export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-20">
      <h1 className="mb-4 text-2xl">WinLab MCP</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Model Context Protocol server — lets agents reach WinLab portal apps
        (bento, leave, approve, profile) through one authenticated endpoint.
      </p>
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">MCP endpoint:</span>{" "}
          <code>POST /mcp</code>
        </div>
        <div>
          <span className="text-muted-foreground">Sign in via:</span> Keycloak
          (through Supabase OIDC)
        </div>
      </div>
      <p className="mt-12 text-xs text-muted-foreground">
        Add this server in Claude Code, Cursor, or any MCP client. First use
        kicks off an OAuth flow in your browser.
      </p>
    </main>
  )
}
