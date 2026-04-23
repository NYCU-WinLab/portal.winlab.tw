export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-20">
      <h1 className="mb-4 text-2xl">WinLab MCP</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Model Context Protocol server — lets agents reach WinLab portal apps
        (bento, leave, approve, profile) through a single endpoint.
      </p>
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Streamable HTTP:</span>{" "}
          <code>/mcp</code>
        </div>
        <div>
          <span className="text-muted-foreground">SSE:</span> <code>/sse</code>
        </div>
      </div>
      <p className="mt-12 text-xs text-muted-foreground">
        Status: scaffold only. Tools land in follow-up PRs.
      </p>
    </main>
  )
}
