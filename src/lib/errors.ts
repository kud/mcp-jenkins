import { Errors, McpError } from "../common/index.js"

// The core throws two kinds of error for an HTTP failure: an HttpError
// carrying `status`, and, on a few write paths, a plain Error whose message
// names the status ("Stop failed: 404 Not Found"). Both are read here so no
// caller has to know which method throws which.
export const statusOf = (err: unknown): number | undefined => {
  const e = err as { status?: unknown; message?: unknown }
  if (typeof e?.status === "number" && e.status > 0) return e.status
  const message = typeof e?.message === "string" ? e.message : ""
  const match = /(?:HTTP |failed: )(\d{3})\b/.exec(message)
  return match ? Number(match[1]) : undefined
}

export const isNotFound = (err: unknown): boolean => statusOf(err) === 404

// A request the core aborted at its deadline surfaces as status 0 with the
// abort reason in the message.
const isTimeout = (err: unknown): boolean => {
  const e = err as { name?: unknown; message?: unknown; status?: unknown }
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true
  return (
    !statusOf(err) &&
    typeof e?.message === "string" &&
    /\baborted\b|timed? ?out/i.test(e.message)
  )
}

// Errors every tool shares, whatever the endpoint: an expired credential and
// a deadline. Anything already an McpError passes through untouched.
export const toMcpError = (err: unknown): unknown => {
  if (err instanceof McpError) return err
  if (statusOf(err) === 401) return Errors.authFailed()
  if (isTimeout(err)) return Errors.timeout()
  return err
}
