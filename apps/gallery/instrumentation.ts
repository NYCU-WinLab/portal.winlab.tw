import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { OTLPHttpJsonTraceExporter, registerOTel } from "@vercel/otel"

import { getClientAttributionAttributes } from "@/lib/otel/attribution"
import { emitErrorLog } from "@/lib/otel/log"

/**
 * OpenTelemetry bootstrap — producer for the Sensorium observability
 * platform (sensorium.zyx.tw). Sends request-span traces (4xx/5xx included)
 * plus explicit application log records (server-side render errors) over
 * OTLP so agents (kilo/noir) can query them via Sensorium's MCP.
 *
 * Everything here is env-driven; no endpoint/token is hardcoded. See the
 * env table in the PR description for the full contract.
 *
 * Protocol note: Sensorium's ingest only accepts OTLP/JSON — protobuf gets
 * a 415. `@vercel/otel`'s *default* trace exporter does honor the standard
 * `OTEL_EXPORTER_OTLP_PROTOCOL` env var, but rather than depend on that env
 * value being spelled exactly right in a manually configured Vercel
 * project, this imports `OTLPHttpJsonTraceExporter` directly and uses it
 * unconditionally — JSON is a code-level guarantee, not something a typo in
 * `OTEL_EXPORTER_OTLP_PROTOCOL` could silently flip to protobuf.
 * `@vercel/otel` ships this exporter itself, so this needs no extra
 * `@opentelemetry/exporter-trace-otlp-http` dependency. (Same pattern
 * already verified end-to-end against Sensorium on ai.winlab.tw.)
 *
 * `spanProcessors: []` matters here: @vercel/otel's default `spanProcessors`
 * is `["auto"]`, and that "auto" resolution *also* stands up its own
 * env-driven exporter independently of whatever `traceExporter` is passed,
 * whenever `OTEL_EXPORTER_OTLP_ENDPOINT` is set — verified empirically on
 * ai.winlab.tw by pointing that app at a local HTTP sink: without this
 * override there were TWO POSTs to `/v1/traces` per request, one
 * `application/x-protobuf` (the "auto" one, defaulting to protobuf) and one
 * `application/json` (the explicit one). `spanProcessors: []` suppresses
 * that auto processor so the explicit JSON exporter is the *only* one
 * registered — no duplicate spans, no stray protobuf request hitting
 * Sensorium's ingest.
 *
 * Logs follow the same "explicit, no auto-drain" shape, for a different
 * reason: `@vercel/otel` has no "auto" resolution for `logRecordProcessors`
 * (it only ever stands up a `LoggerProvider` when you pass
 * `logRecordProcessors` yourself, so there's no double-export trap to guard
 * against here). The pipeline is still built explicitly — a
 * `BatchLogRecordProcessor` wrapping `@opentelemetry/exporter-logs-otlp-http`'s
 * `OTLPLogExporter` — because that package's Node implementation hardcodes
 * `JsonLogsSerializer` + `Content-Type: application/json`, so JSON is a
 * code-level guarantee the same way `OTLPHttpJsonTraceExporter` is for
 * traces. Passing it via `logRecordProcessors` lets @vercel/otel share the
 * same env-detected `resource` (service.namespace/service.name) between
 * traces and logs.
 */
export function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

  // No collector configured (e.g. plain `bun run dev` locally) — skip
  // registering the SDK entirely. No throw, no background export attempts
  // against a phantom collector.
  if (!endpoint) return

  const trimmedEndpoint = endpoint.replace(/\/+$/, "")
  const headers = parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)

  registerOTel({
    // OTEL_RESOURCE_ATTRIBUTES (service.namespace / service.name) is read
    // automatically by @vercel/otel's default env resource detector; this
    // is just the fallback if that env var is absent.
    serviceName: process.env.OTEL_SERVICE_NAME ?? "gallery",
    spanProcessors: [],
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: `${trimmedEndpoint}/v1/traces`,
      headers,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${trimmedEndpoint}/v1/logs`,
          headers,
        }),
      }),
    ],
  })
}

/**
 * Next.js's server-side error-observability hook: fires whenever an error
 * occurs on the server (Server Component render, Route Handlers, Server
 * Actions) — including the same errors that already reach `app/error.tsx` /
 * `app/global-error.tsx`. Those are Client Components (`"use client"`,
 * error boundaries run in the browser after hydration), so they have no
 * access to the server-side OTel logger registered above; this hook is the
 * actual bridge that gets those errors into Sensorium as log records,
 * independent of the boundary UI.
 *
 * Reserved export name — Next.js calls this automatically if present, no
 * wiring needed beyond exporting it. No-op (via `emitErrorLog`'s built-in
 * no-op fallback) when OTel was never registered.
 */
export async function onRequestError(
  error: unknown,
  request: Readonly<{
    path: string
    method: string
    headers: NodeJS.Dict<string | string[]>
  }>,
  context: Readonly<{
    routerKind: "Pages Router" | "App Router"
    routePath: string
    routeType: "render" | "route" | "action" | "proxy"
    renderSource?:
      | "react-server-components"
      | "react-server-components-payload"
      | "server-rendering"
    revalidateReason: "on-demand" | "stale" | undefined
  }>
) {
  const message = error instanceof Error ? error.message : String(error)
  const digest =
    error instanceof Error
      ? (error as Error & { digest?: string }).digest
      : undefined

  emitErrorLog({
    message,
    digest,
    attributes: {
      "http.route": request.path,
      "http.request.method": request.method,
      "next.router_kind": context.routerKind,
      "next.route_type": context.routeType,
      ...getClientAttributionAttributes(request.headers),
    },
  })
}

/**
 * Minimal parser for the OTLP `key1=value1,key2=value2` header env format
 * (e.g. `Authorization=Bearer <token>`). Doesn't percent-decode values —
 * fine for bearer tokens, which don't contain `,`/`=`.
 */
function parseOtlpHeaders(
  raw: string | undefined
): Record<string, string> | undefined {
  if (!raw) return undefined

  const headers: Record<string, string> = {}
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=")
    if (eq === -1) continue
    const key = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (key) headers[key] = value
  }
  return headers
}
