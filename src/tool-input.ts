import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import { Errors } from "./common/index.js"

// The low-level MCP `Server` this package uses validates the request envelope
// only, never a tool's arguments against its inputSchema: a `buildNumber`
// declared as a number is a hint to the model, not a constraint. Several of
// those arguments end up interpolated into a Jenkins URL by the core client,
// so a string such as "7/../../other/doDelete?x=" would reach an endpoint the
// tool was never meant to call, around the tool filter and the confirm gates.
// Every call is therefore checked here, against the same schema the client
// was shown, before any handler runs.

// Jenkins' own build permalinks, accepted wherever a build number is.
export const BUILD_PERMALINKS = [
  "lastBuild",
  "lastCompletedBuild",
  "lastFailedBuild",
  "lastStableBuild",
  "lastSuccessfulBuild",
  "lastUnstableBuild",
  "lastUnsuccessfulBuild",
] as const
export type BuildPermalink = (typeof BUILD_PERMALINKS)[number]

const invalid = (tool: string, message: string) =>
  Errors.invalidInput(`Invalid arguments for tool ${tool}: ${message}`)

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

// A segment that a URL parser would collapse: "." and "..", also when they
// arrive percent-encoded ("%2e%2E"), which WHATWG URL normalises the same way.
const isDotSegment = (segment: string): boolean =>
  /^(?:\.|%2e){1,2}$/i.test(segment)

// A build number goes into the URL as `/<n>/…`, so it must be a whole number
// or one of Jenkins' permalinks. A digit-only string is read as the number it
// spells, as Jenkins itself would have.
export const parseBuildNumber = (
  value: unknown,
  field = "buildNumber",
): number | BuildPermalink => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1)
    return value
  if (typeof value === "string") {
    if (/^[1-9]\d{0,15}$/.test(value)) return Number(value)
    if ((BUILD_PERMALINKS as readonly string[]).includes(value))
      return value as BuildPermalink
  }
  throw Errors.invalidInput(
    `${field} must be a positive whole number or a build permalink (${BUILD_PERMALINKS.join(", ")})`,
  )
}

// An artifact path is appended to `/<n>/artifact/` unencoded, so it must stay
// inside that directory: relative, no empty, "." or ".." segments, nothing
// that would end the path and start a query or fragment.
export const checkArtifactPath = (value: unknown, field = "relativePath") => {
  if (typeof value !== "string" || value.length === 0)
    throw Errors.invalidInput(`${field} must be a non-empty string`)
  if (CONTROL_CHARS.test(value) || /[?#\\]/.test(value))
    throw Errors.invalidInput(
      `${field} must not contain "?", "#", backslashes or control characters`,
    )
  if (value.startsWith("/"))
    throw Errors.invalidInput(
      `${field} must be relative to the build's artifacts`,
    )
  for (const segment of value.split("/")) {
    if (segment === "")
      throw Errors.invalidInput(`${field} must not contain empty path segments`)
    if (isDotSegment(segment))
      throw Errors.invalidInput(
        `${field} must not contain "." or ".." segments`,
      )
  }
  return value
}

// A job's full name becomes `job/<a>/job/<b>`, each segment encoded with
// encodeURIComponent, which leaves "." and ".." as they are.
export const checkJobName = (value: unknown, field = "jobName") => {
  if (typeof value !== "string" || value.trim() === "")
    throw Errors.invalidInput(`${field} must be a non-empty string`)
  if (CONTROL_CHARS.test(value))
    throw Errors.invalidInput(`${field} must not contain control characters`)
  if (value.split("/").some((s) => s === "." || s === ".."))
    throw Errors.invalidInput(`${field} must not contain "." or ".." segments`)
  return value
}

// Node and view names are one encoded segment each: only "." and ".." escape.
const checkSingleName = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim() === "")
    throw Errors.invalidInput(`${field} must be a non-empty string`)
  if (CONTROL_CHARS.test(value) || value === "." || value === "..")
    throw Errors.invalidInput(`${field} is not a valid name`)
  return value
}

const checkWholeNumber = (min: number) => (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
    throw Errors.invalidInput(
      `${field} must be a whole number of at least ${min}`,
    )
  return value
}

// Arguments that end up in a URL path or query get a stricter reading than
// their JSON schema type, whichever tool declares them.
const PATH_RULES: Record<string, (value: unknown, field: string) => unknown> = {
  buildNumber: parseBuildNumber,
  relativePath: checkArtifactPath,
  jobName: checkJobName,
  fromName: checkJobName,
  newName: checkJobName,
  nodeName: checkSingleName,
  viewName: checkSingleName,
  queueId: checkWholeNumber(1),
}

// Numeric bounds (minimum, maximum) stay with the handlers, which already
// enforce them with their own messages, or clamp, as maxDepth does.
type PropertySchema = { type?: string }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const checkType = (value: unknown, schema: PropertySchema): boolean => {
  switch (schema.type) {
    case "string":
      return typeof value === "string"
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value)
    case "boolean":
      return typeof value === "boolean"
    case "object":
      return isPlainObject(value)
    case "array":
      return Array.isArray(value)
    default:
      return true
  }
}

// Validates a call's arguments against the tool's inputSchema and returns the
// arguments the handler should see. Properties the schema does not declare are
// passed through untouched, as before; an optional property sent as null is
// treated as absent.
export const validateToolInput = (
  tool: Tool,
  args: unknown,
): Record<string, unknown> => {
  if (args === undefined || args === null) args = {}
  if (!isPlainObject(args))
    throw invalid(tool.name, "arguments must be an object")

  const properties = (tool.inputSchema.properties ?? {}) as Record<
    string,
    PropertySchema
  >
  const required = new Set(tool.inputSchema.required ?? [])
  const out: Record<string, unknown> = { ...args }

  for (const name of required) {
    if (out[name] === undefined || out[name] === null)
      throw invalid(tool.name, `${name} is required`)
  }

  for (const [name, schema] of Object.entries(properties)) {
    const value = out[name]
    if (value === undefined) continue
    if (value === null) {
      delete out[name]
      continue
    }
    const rule = PATH_RULES[name]
    if (rule) {
      try {
        out[name] = rule(value, name)
      } catch (err) {
        throw invalid(tool.name, (err as Error).message)
      }
      continue
    }
    if (!checkType(value, schema))
      throw invalid(tool.name, `${name} must be of type ${schema.type}`)
  }

  return out
}
