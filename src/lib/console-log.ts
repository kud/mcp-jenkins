import { JenkinsClient } from "@kud/jenkins"
import { Errors } from "../common/index.js"
import { isNotFound } from "./errors.js"
import { buildNotFoundError, getLastBuild } from "./builds.js"
import { withJobPath } from "./paths.js"

// How much console log a single result may carry. Returning the whole log in
// one JSON-RPC message made an MCP client past its per-message cap disconnect
// and drop the server's tools. The default shape is therefore a capped tail
// (the last 500 lines, at most 204800 bytes), and everything else is opt-in
// paging and search.
export const CONSOLE_LOG_TAIL_LINES = 500
export const CONSOLE_LOG_DEFAULT_MAX_BYTES = 204800
export const CONSOLE_LOG_MAX_BYTES_LIMIT = 1048576
export const CONSOLE_LOG_MAX_MATCHES = 500
export const DEFAULT_SNIPPET_LENGTH = 200

export interface ConsoleLogMatch {
  line: number
  text: string
}

export interface ConsoleLogResult {
  jobName: string
  buildNumber: number
  logSnippet: string
  /** Default and paging modes: the returned log text. */
  text?: string
  truncated: boolean
  /** Size of the whole build log in bytes. Only known in default and pattern modes. */
  totalBytes?: number
  returnedBytes: number
  /** Default tail mode: byte offset of the returned text. Paging mode: the requested start. */
  startByte?: number
  /** Paging mode: byte offset to pass as start to read further. */
  nextStart?: number
  /** Paging mode: true while the build is still writing the log. */
  moreData?: boolean
  /** Pattern mode: the pattern as given, and how many lines matched in the whole log. */
  pattern?: string
  totalMatches?: number
  matches?: ConsoleLogMatch[]
}

export interface ConsoleLogOptions {
  start?: number
  maxBytes?: number
  pattern?: string
  maxSnippetLength?: number
}

// First maxSnippetLength characters of the fetched text, trimmed, carriage
// returns stripped.
const logSnippet = (text: string, maxSnippetLength: number): string =>
  text.trim().slice(0, maxSnippetLength).replace(/\r/g, "")

// Largest prefix of text that stays within maxBytes and cuts cleanly: prefer
// a line boundary so no half line is returned; a single line longer than the
// whole budget falls back to a UTF-8 character boundary.
const sliceAtLineBoundary = (text: string, maxBytes: number): string => {
  const buf = Buffer.from(text, "utf8")
  if (buf.length <= maxBytes) return text
  const lastNewline = buf.lastIndexOf("\n", maxBytes)
  if (lastNewline <= 0) {
    let cut = maxBytes
    while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--
    return buf.subarray(0, cut).toString("utf8")
  }
  return buf.subarray(0, lastNewline + 1).toString("utf8")
}

// Default shape: the tail of the log, the last 500 lines, hard-capped at
// maxBytes. Truncated is set whenever the head was dropped or the byte cap
// cut anything, so a caller can tell the returned text is a window.
const logTailResult = (
  jobName: string,
  buildNumber: number,
  fullLog: string,
  maxBytes: number,
  snippetLength: number,
): ConsoleLogResult => {
  const totalBytes = Buffer.byteLength(fullLog, "utf8")
  let text = fullLog
  let startByte = 0
  let truncated = false
  const lines = fullLog.split("\n")
  // A trailing newline leaves one empty trailing element in the split; that
  // artefact must not consume a slot in the 500-line window.
  const hasFinalNewline = lines.length > 1 && lines[lines.length - 1] === ""
  const lineCount = lines.length - (hasFinalNewline ? 1 : 0)
  if (lineCount > CONSOLE_LOG_TAIL_LINES) {
    const head = lines.slice(0, lineCount - CONSOLE_LOG_TAIL_LINES)
    const tail = lines.slice(head.length, lineCount)
    text = tail.join("\n") + (hasFinalNewline ? "\n" : "")
    // A true resume offset into the full log: the head lines, their internal
    // newlines, and the one newline separating head from tail.
    startByte = Buffer.byteLength(head.join("\n"), "utf8") + 1
    truncated = true
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    text = sliceAtLineBoundary(text, maxBytes)
    truncated = true
  }
  return {
    jobName,
    buildNumber,
    logSnippet: logSnippet(fullLog, snippetLength),
    text,
    truncated,
    totalBytes,
    returnedBytes: Buffer.byteLength(text, "utf8"),
    startByte,
  }
}

// Pattern shape: every matching line of the whole log with its 1-based line
// number. A pattern that does not compile falls back to a plain substring
// match so a caller is never blocked by regex syntax.
const logPatternResult = (
  jobName: string,
  buildNumber: number,
  fullLog: string,
  pattern: string,
  maxBytes: number,
  snippetLength: number,
): ConsoleLogResult => {
  const lines = fullLog.split("\n")
  let re: RegExp | null = null
  try {
    re = new RegExp(pattern)
  } catch {
    re = null
  }
  const all: ConsoleLogMatch[] = []
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].replace(/\r$/, "")
    const hit = re ? re.test(lineText) : lineText.includes(pattern)
    if (hit) all.push({ line: i + 1, text: lineText })
  }
  const matches: ConsoleLogMatch[] = []
  let returnedBytes = 0
  for (const m of all) {
    const mBytes = Buffer.byteLength(m.text, "utf8") + 1
    if (
      matches.length >= CONSOLE_LOG_MAX_MATCHES ||
      returnedBytes + mBytes > maxBytes
    ) {
      break
    }
    matches.push(m)
    returnedBytes += mBytes
  }
  return {
    jobName,
    buildNumber,
    logSnippet: logSnippet(fullLog, snippetLength),
    pattern,
    matches,
    totalMatches: all.length,
    truncated: matches.length < all.length,
    totalBytes: Buffer.byteLength(fullLog, "utf8"),
    returnedBytes,
  }
}

// Paging shape: Jenkins' progressiveText endpoint returns the log from a byte
// offset, so start: 0 reads the head without downloading the whole log. Jenkins
// also reports the resume offset and a more-data flag in headers, which the
// core's tree() does not hand back: the offset is where the returned bytes end,
// which is what X-Text-Size says for an uncut chunk, and the flag is whether
// the build is still running, read from its record.
const pagedLogResult = async (
  client: JenkinsClient,
  jobName: string,
  buildNumber: number,
  start: number,
  maxBytes: number,
  snippetLength: number,
): Promise<ConsoleLogResult> => {
  const chunk = String(
    await withJobPath(client, jobName, (p) =>
      client.tree(`${p}/${buildNumber}/logText/progressiveText?start=${start}`),
    ),
  )
  const build = await withJobPath(client, jobName, (p) =>
    client.tree(`${p}/${buildNumber}/api/json`, "building"),
  )
  const returned = sliceAtLineBoundary(chunk, maxBytes)
  const returnedBytes = Buffer.byteLength(returned, "utf8")
  return {
    jobName,
    buildNumber,
    logSnippet: logSnippet(returned, snippetLength),
    text: returned,
    truncated: returned !== chunk,
    returnedBytes,
    startByte: start,
    nextStart: start + returnedBytes,
    moreData: build?.building === true,
  }
}

export const getConsoleLog = async (
  client: JenkinsClient,
  jobName: string,
  buildNumber?: number,
  options: ConsoleLogOptions = {},
): Promise<ConsoleLogResult> => {
  const { start, pattern } = options
  // Validated here and not only in the JSON schema, which binds MCP callers
  // only.
  if (start !== undefined && (!Number.isInteger(start) || start < 0)) {
    throw Errors.invalidInput(
      "start must be a non-negative whole number of bytes",
    )
  }
  if (options.maxBytes !== undefined) {
    const requested = options.maxBytes
    if (!Number.isInteger(requested) || requested <= 0) {
      throw Errors.invalidInput(
        "maxBytes must be a positive whole number of bytes",
      )
    }
  }
  const maxBytes = Math.min(
    options.maxBytes ?? CONSOLE_LOG_DEFAULT_MAX_BYTES,
    CONSOLE_LOG_MAX_BYTES_LIMIT,
  )
  if (pattern !== undefined && typeof pattern !== "string") {
    throw Errors.invalidInput("pattern must be a string")
  }
  const snippetLength = options.maxSnippetLength ?? DEFAULT_SNIPPET_LENGTH
  if (options.maxSnippetLength !== undefined) {
    const requested = options.maxSnippetLength
    if (!Number.isInteger(requested) || requested <= 0) {
      throw Errors.invalidInput(
        "maxSnippetLength must be a positive whole number",
      )
    }
  }

  const bn = buildNumber ?? Number((await getLastBuild(client, jobName)).id)
  try {
    if (start !== undefined) {
      return await pagedLogResult(
        client,
        jobName,
        bn,
        start,
        maxBytes,
        snippetLength,
      )
    }
    const fullLog = String(
      await withJobPath(client, jobName, (p) =>
        client.tree(`${p}/${bn}/consoleText`),
      ),
    )
    if (pattern !== undefined) {
      return logPatternResult(
        jobName,
        bn,
        fullLog,
        pattern,
        maxBytes,
        snippetLength,
      )
    }
    return logTailResult(jobName, bn, fullLog, maxBytes, snippetLength)
  } catch (err) {
    if (isNotFound(err)) throw await buildNotFoundError(client, jobName, bn)
    throw err
  }
}
