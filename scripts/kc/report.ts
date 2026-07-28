// Shared output for the `kc` commands.
//
// Every line goes through the redactor, so a Keycloak error body that echoes
// a client secret can never reach a terminal or an agent transcript.

export type Status = "ok" | "warn" | "fail" | "info"

const MARK: Record<Status, string> = {
  ok: "  ok  ",
  warn: " warn ",
  fail: " fail ",
  info: "      ",
}

export class Report {
  private failures = 0
  private warnings = 0

  constructor(private readonly redact: (text: string) => string) {}

  line(status: Status, message: string, detail?: string) {
    if (status === "fail") this.failures += 1
    if (status === "warn") this.warnings += 1
    const suffix = detail ? `\n         ${this.redact(detail)}` : ""
    console.log(`[${MARK[status]}] ${this.redact(message)}${suffix}`)
  }

  ok = (m: string, d?: string) => this.line("ok", m, d)
  warn = (m: string, d?: string) => this.line("warn", m, d)
  fail = (m: string, d?: string) => this.line("fail", m, d)
  info = (m: string, d?: string) => this.line("info", m, d)

  heading(text: string) {
    console.log(`\n${text}`)
  }

  plain(text: string) {
    console.log(this.redact(text))
  }

  get failed(): boolean {
    return this.failures > 0
  }

  summary(): number {
    console.log("")
    if (this.failures > 0) {
      console.log(
        `${this.failures} failure(s), ${this.warnings} warning(s). See the notes above.`
      )
      return 1
    }
    console.log(
      this.warnings > 0
        ? `No failures, ${this.warnings} warning(s).`
        : "All checks passed."
    )
    return 0
  }
}

/** Keycloak errors carry a status that usually explains itself; surface it. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
