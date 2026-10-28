import {
  DEFAULT_TIMEOUT_MS,
  httpGetJson,
  httpGetText,
  httpGetTextWithHeaders,
  httpPost,
  Errors,
  McpError,
  logger,
  loadJenkinsEnv,
} from "../common/index.js"

const jobPath = (name: string): string =>
  name.split("/").map(encodeURIComponent).join("/job/")

const normalizeJobFullName = (name: string): string => {
  const fullName = name.trim().replace(/^\/+|\/+$/g, "")
  if (!fullName || fullName.split("/").some((segment) => !segment)) {
    throw Errors.invalidInput(
      "Job name must be a non-empty Jenkins full name without empty path segments",
    )
  }
  return fullName
}

const createItemUrl = (baseUrl: string, fullName: string): string => {
  const normalized = normalizeJobFullName(fullName)
  const lastSlash = normalized.lastIndexOf("/")
  const parentName = lastSlash === -1 ? "" : normalized.slice(0, lastSlash)
  const itemName =
    lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1)
  const containerPath = parentName ? `/job/${jobPath(parentName)}` : ""
  return `${baseUrl}${containerPath}/createItem?name=${encodeURIComponent(itemName)}`
}

// The exact set of fields normalizeBuild reads. Sent as a `tree` filter so
// Jenkins serialises these and nothing else — without one it returns the entire
// build record, changeset and all, of which we keep six values.
const BUILD_FIELDS = "number,result,duration,timestamp,url,building"
const BUILD_TREE = `builds[${BUILD_FIELDS}]`

// How much console log a single result may carry. The old contract returned
// the whole log in one JSON-RPC message, and one oversized CI log past an MCP
// client's per-message cap made that client disconnect and drop the server's
// tools. The default shape is therefore a capped tail (the last 500 lines,
// at most 204800 bytes), and everything else is opt-in paging and search.
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

// Square brackets are not valid unencoded in a URL query, and some Jenkins
// instances and reverse proxies answer a raw tree=jobs[name] with HTTP 400.
const treeQuery = (tree: string): string =>
  `?${new URLSearchParams({ tree }).toString()}`

export interface NormalizedBuild {
  id: string
  result: "SUCCESS" | "FAILURE" | "ABORTED" | "RUNNING" | string
  durationMs: number
  timestamp: string // ISO
  url: string
}

export interface JenkinsCredentials {
  baseUrl: string
  authHeader?: string
  /** Per-request deadline in ms. Defaults to DEFAULT_TIMEOUT_MS when omitted. */
  timeoutMs?: number
}

export interface JenkinsJob {
  name: string
  url: string
}

export interface ListJobsOptions {
  folder?: string
  recursive?: boolean
  maxDepth?: number
  includeFolders?: boolean
}

interface JenkinsJobApi {
  name?: string
  url?: string
  _class?: string
  jobs?: unknown[]
}

interface CrumbInfo {
  crumbRequestField: string
  crumb: string
}

export class JenkinsClient {
  readonly baseUrl: string
  readonly timeoutMs: number
  private authHeader: string | undefined
  private crumb?: CrumbInfo
  private cookies: string | undefined

  constructor(credentials?: JenkinsCredentials) {
    if (credentials) {
      this.baseUrl = credentials.baseUrl
      this.authHeader = credentials.authHeader
      this.timeoutMs = credentials.timeoutMs ?? DEFAULT_TIMEOUT_MS
    } else {
      const env = loadJenkinsEnv()
      this.baseUrl = env.JENKINS_URL
      this.timeoutMs = env.JENKINS_TIMEOUT_MS

      if (env.JENKINS_ANONYMOUS) {
        this.authHeader = undefined
      } else if (env.JENKINS_BEARER_TOKEN) {
        this.authHeader = "Bearer " + env.JENKINS_BEARER_TOKEN
      } else {
        this.authHeader =
          "Basic " +
          Buffer.from(env.JENKINS_USER + ":" + env.JENKINS_API_TOKEN).toString(
            "base64",
          )
      }
    }
  }

  // Every request goes out with the configured deadline. Built here rather than
  // spelled at each of the thirty-odd call sites, so a new one cannot silently
  // fall back to the transport default and reintroduce issue #18.
  private req(extra?: Record<string, string>): RequestInit & {
    timeoutMs: number
  } {
    return { headers: this.headers(extra), timeoutMs: this.timeoutMs }
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {}
    if (this.authHeader) h["Authorization"] = this.authHeader
    if (this.cookies) h["Cookie"] = this.cookies
    return { ...h, ...extra }
  }

  // Multibranch projects are deliberately excluded. They hold one child job per
  // discovered branch, so descending into them enumerates every branch of every
  // such project -- easily dozens per active repo, surfacing as though they were
  // ordinary nested jobs, and making traversal cost unpredictable in a way plain
  // folders are not. `_class` is still returned to callers, so they remain
  // identifiable; they are just not walked.
  private isJobContainer(job: JenkinsJobApi): boolean {
    const className = job._class ?? ""
    return (
      Array.isArray(job.jobs) ||
      className.endsWith("Folder") ||
      className.includes(".folder.")
    )
  }

  // List jobs and folders. Nested names are returned as Jenkins full names (for
  // example, Sandbox/application-sandbox).
  //
  // `recursive` defaults to false, and must stay that way. Traversal awaits
  // sequentially, one HTTP round-trip per container, with no concurrency and no
  // request budget -- so a tree of 200 folders costs 200 serial requests. With a
  // true default, every existing `listJobs()` call site would silently acquire
  // that cost without a single character changing at the call site, so neither
  // the diff nor the compiler would flag one. `searchJobs()` passes straight
  // through and filters in memory, which would turn a sub-second tool into a
  // multi-minute crawl of the whole instance. Recursive-by-default only becomes
  // safe alongside bounded concurrency and a total-request cap that fails loudly.
  async listJobs(options: ListJobsOptions = {}): Promise<JenkinsJob[]> {
    const folder = options.folder?.trim().replace(/^\/+|\/+$/g, "") ?? ""
    const recursive = options.recursive ?? false
    const includeFolders = options.includeFolders ?? true
    // NaN survives Math.floor/max/min, and `depth < NaN` is always false, so a
    // non-numeric depth would silently return only the top level -- which reads
    // as "the folder is empty" rather than as bad input.
    const requested = options.maxDepth ?? 10
    const requestedDepth = Number.isFinite(requested) ? requested : 10
    const maxDepth = Math.min(Math.max(Math.floor(requestedDepth), 0), 100)
    const jobs: JenkinsJob[] = []
    const visited = new Set<string>()
    const tree = "jobs[name,url,_class,jobs[name]]"

    const readContainer = async (
      parentFullName: string,
      depth: number,
    ): Promise<void> => {
      if (visited.has(parentFullName)) return
      visited.add(parentFullName)

      const path = parentFullName
        ? `/job/${jobPath(parentFullName)}/api/json${treeQuery(tree)}`
        : `/api/json${treeQuery(tree)}`
      const data = await httpGetJson<any>(`${this.baseUrl}${path}`, this.req())
      const children: JenkinsJobApi[] = Array.isArray(data.jobs)
        ? data.jobs
        : []

      for (const child of children) {
        if (!child?.name || !child?.url) continue
        const fullName = parentFullName
          ? `${parentFullName}/${child.name}`
          : child.name
        const isContainer = this.isJobContainer(child)

        if (includeFolders || !isContainer) {
          jobs.push({ name: fullName, url: child.url })
        }

        if (recursive && isContainer && depth < maxDepth) {
          await readContainer(fullName, depth + 1)
        }
      }
    }

    try {
      await readContainer(folder, 0)
      return jobs
    } catch (e: any) {
      if (e.message?.includes("HTTP 401")) throw Errors.authFailed()
      if (folder && e.message?.includes("HTTP 404"))
        throw Errors.jobNotFound(folder)
      throw e
    }
  }

  // Recent builds metadata for a job (last N, default 5)
  async getRecentBuilds(
    jobName: string,
    limit = 5,
  ): Promise<NormalizedBuild[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw Errors.invalidInput("limit must be a positive whole number")
    }
    try {
      // `depth=1` expanded every build the job has ever run and then threw all
      // but `limit` away here, which on a job with thousands of builds is the
      // whole cost of the call. The tree names only what normalizeBuild reads,
      // and the range suffix makes Jenkins do the slicing. See issue #18.
      const raw = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/api/json${treeQuery(`${BUILD_TREE}{0,${limit}}`)}`,
        this.req(),
      )
      if (!raw.builds) return []
      const builds = raw.builds
        .slice(0, limit)
        .map((b: any) => this.normalizeBuild(b))
      return builds
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  private normalizeBuild(raw: any): NormalizedBuild {
    const building = raw.building === true
    const result = building ? "RUNNING" : raw.result || "RUNNING"
    return {
      id: String(raw.number ?? raw.id ?? ""),
      result,
      durationMs: raw.duration ?? 0,
      timestamp: raw.timestamp
        ? new Date(raw.timestamp).toISOString()
        : new Date().toISOString(),
      url: raw.url || "",
    }
  }

  // The lastBuild URL 404s both when the job is gone and when the job exists
  // but has never been built; the response alone cannot tell which. One cheap
  // read of the job record disambiguates it: callers rely on getLastBuild to
  // throw rather than on a null (see getConsoleLog), so a never-built job gets
  // its own explicit error instead of pretending the job is missing.
  private async jobExists(jobName: string): Promise<boolean> {
    try {
      await httpGetJson(
        `${this.baseUrl}/job/${jobPath(jobName)}/api/json${treeQuery("name")}`,
        this.req(),
      )
      return true
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) return false
      throw e
    }
  }

  async getLastBuild(jobName: string): Promise<NormalizedBuild> {
    try {
      const raw = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/lastBuild/api/json${treeQuery(BUILD_FIELDS)}`,
        this.req(),
      )
      return this.normalizeBuild(raw)
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) {
        if (await this.jobExists(jobName)) throw Errors.noBuilds(jobName)
        throw Errors.jobNotFound(jobName)
      }
      throw e
    }
  }

  async getBuild(
    jobName: string,
    buildNumber: number,
  ): Promise<NormalizedBuild> {
    try {
      const raw = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/api/json${treeQuery(BUILD_FIELDS)}`,
        this.req(),
      )
      return this.normalizeBuild(raw)
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw await this.buildNotFoundError(jobName, buildNumber)
      throw e
    }
  }

  // First maxSnippetLength characters of the fetched text, mirroring the
  // original snippet behaviour (trimmed, carriage returns stripped).
  private logSnippet(text: string, maxSnippetLength: number): string {
    return text.trim().slice(0, maxSnippetLength).replace(/\r/g, "")
  }

  // Largest prefix of text that stays within maxBytes and cuts cleanly: prefer
  // a line boundary so no half line is returned; a single line longer than the
  // whole budget falls back to a UTF-8 character boundary.
  private sliceAtLineBoundary(text: string, maxBytes: number): string {
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
  // cut anything, so a caller can tell the returned text is a window and page
  // or search for the rest.
  private logTailResult(
    jobName: string,
    buildNumber: number,
    fullLog: string,
    maxBytes: number,
    snippetLength: number,
  ): ConsoleLogResult {
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
      // The offset counts every dropped line's byte, so it is a true resume
      // offset into the full log: head.join covers the head lines and their
      // internal newlines, and one more newline separates head from tail.
      startByte = Buffer.byteLength(head.join("\n"), "utf8") + 1
      truncated = true
    }
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      text = this.sliceAtLineBoundary(text, maxBytes)
      truncated = true
    }
    return {
      jobName,
      buildNumber,
      logSnippet: this.logSnippet(fullLog, snippetLength),
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
  private logPatternResult(
    jobName: string,
    buildNumber: number,
    fullLog: string,
    pattern: string,
    maxBytes: number,
    snippetLength: number,
  ): ConsoleLogResult {
    const lines = fullLog.split("\n")
    let re: RegExp | null = null
    try {
      re = new RegExp(pattern)
    } catch {
      re = null
    }
    const matchText = (line: string): string => line.replace(/\r$/, "")
    const all: ConsoleLogMatch[] = []
    for (let i = 0; i < lines.length; i++) {
      const lineText = matchText(lines[i])
      const hit = re ? re.test(lineText) : lineText.includes(pattern)
      if (hit) all.push({ line: i + 1, text: lineText })
    }
    const matches: ConsoleLogMatch[] = []
    let returnedBytes = 0
    for (const m of all) {
      const mBytes = Buffer.byteLength(m.text, "utf8") + 1
      if (matches.length >= CONSOLE_LOG_MAX_MATCHES || returnedBytes + mBytes > maxBytes) {
        break
      }
      matches.push(m)
      returnedBytes += mBytes
    }
    const truncated = matches.length < all.length
    return {
      jobName,
      buildNumber,
      logSnippet: this.logSnippet(fullLog, snippetLength),
      pattern,
      matches,
      totalMatches: all.length,
      truncated,
      totalBytes: Buffer.byteLength(fullLog, "utf8"),
      returnedBytes,
    }
  }

  // Paging shape: Jenkins' progressiveText endpoint, which returns the log from
  // a byte offset plus headers naming where to resume (X-Text-Size) and whether
  // the build is still writing (X-More-Data). start: 0 therefore reads the head
  // of the log, replacing the whole-log access the old contract offered.
  private async pagedLogResult(
    jobName: string,
    buildNumber: number,
    start: number,
    maxBytes: number,
    snippetLength: number,
  ): Promise<ConsoleLogResult> {
    const url = `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/logText/progressiveText?start=${start}`
    const { text: chunk, headers } = await httpGetTextWithHeaders(url, this.req())
    const returned = this.sliceAtLineBoundary(chunk, maxBytes)
    const returnedBytes = Buffer.byteLength(returned, "utf8")
    // When the chunk was sliced, the resume point is where the caller left off
    // inside it; only an uncut response makes Jenkins' own X-Text-Size usable.
    const textSize = Number(headers["x-text-size"])
    const nextStart =
      returnedBytes < Buffer.byteLength(chunk, "utf8")
        ? start + returnedBytes
        : Number.isFinite(textSize)
          ? textSize
          : start + returnedBytes
    return {
      jobName,
      buildNumber,
      logSnippet: this.logSnippet(returned, snippetLength),
      text: returned,
      truncated: returned !== chunk,
      returnedBytes,
      startByte: start,
      nextStart,
      moreData: headers["x-more-data"] === "true",
    }
  }

  async getConsoleLog(
    jobName: string,
    buildNumber?: number,
    options:
      | {
          start?: number
          maxBytes?: number
          pattern?: string
          maxSnippetLength?: number
        }
      | number = {},
  ): Promise<ConsoleLogResult> {
    // The old positional contract passed maxSnippetLength here directly. A plain
    // JS caller still does, and a number destructured as an object would yield
    // nothing and silently ignore the value, so a number keeps that meaning.
    const normalized =
      typeof options === "number" ? { maxSnippetLength: options } : options
    const { start, pattern } = normalized
    // Input validation lives here and not only in the JSON schema: JenkinsClient
    // is a public API, and direct importers get no schema.
    if (start !== undefined && (!Number.isInteger(start) || start < 0)) {
      throw Errors.invalidInput(
        "start must be a non-negative whole number of bytes",
      )
    }
    if (normalized.maxBytes !== undefined) {
      const requested = normalized.maxBytes
      if (!Number.isInteger(requested) || requested <= 0) {
        throw Errors.invalidInput(
          "maxBytes must be a positive whole number of bytes",
        )
      }
    }
    const maxBytes = Math.min(
      normalized.maxBytes ?? CONSOLE_LOG_DEFAULT_MAX_BYTES,
      CONSOLE_LOG_MAX_BYTES_LIMIT,
    )
    if (pattern !== undefined && typeof pattern !== "string") {
      throw Errors.invalidInput("pattern must be a string")
    }
    const snippetLength = normalized.maxSnippetLength ?? DEFAULT_SNIPPET_LENGTH
    if (normalized.maxSnippetLength !== undefined) {
      const requested = normalized.maxSnippetLength
      if (!Number.isInteger(requested) || requested <= 0) {
        throw Errors.invalidInput(
          "maxSnippetLength must be a positive whole number",
        )
      }
    }

    let bn = buildNumber
    if (bn == null) {
      bn = Number((await this.getLastBuild(jobName)).id)
    }
    try {
      if (start !== undefined) {
        return await this.pagedLogResult(jobName, bn, start, maxBytes, snippetLength)
      }
      const fullLog = await httpGetText(
        `${this.baseUrl}/job/${jobPath(jobName)}/${bn}/consoleText`,
        this.req(),
      )
      if (pattern !== undefined) {
        return this.logPatternResult(jobName, bn, fullLog, pattern, maxBytes, snippetLength)
      }
      return this.logTailResult(jobName, bn, fullLog, maxBytes, snippetLength)
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw await this.buildNotFoundError(jobName, bn)
      throw e
    }
  }

  private async ensureCrumb(): Promise<CrumbInfo | undefined> {
    if (this.crumb) return this.crumb
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), this.timeoutMs)
      let res: Response
      try {
        res = await fetch(`${this.baseUrl}/crumbIssuer/api/json`, {
          headers: this.headers(),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(t)
      }
      if (!res.ok) {
        logger.warn("Crumb fetch failed (continuing)", { status: res.status })
        return undefined
      }
      const setCookies: string[] =
        typeof (res.headers as any).getSetCookie === "function"
          ? (res.headers as any).getSetCookie()
          : ([res.headers.get("set-cookie")].filter(Boolean) as string[])
      if (setCookies.length > 0) {
        this.cookies = setCookies.map((c) => c.split(";")[0].trim()).join("; ")
      }
      const crumb = (await res.json()) as CrumbInfo
      this.crumb = crumb
      return crumb
    } catch (e: any) {
      logger.warn("Crumb fetch failed (continuing)", { error: String(e) })
      return undefined
    }
  }

  private async reissueCrumb(): Promise<CrumbInfo | undefined> {
    this.crumb = undefined
    this.cookies = undefined
    return this.ensureCrumb()
  }

  // A 404 on a URL carrying the build number means the job is gone or the
  // build is gone; the response alone cannot tell which. One cheap read of the
  // job record disambiguates it, so the error names the thing actually missing
  // rather than calling a missing build "Job not found".
  private async buildNotFoundError(
    jobName: string,
    buildNumber: number,
  ): Promise<McpError> {
    try {
      await httpGetJson(
        `${this.baseUrl}/job/${jobPath(jobName)}/api/json${treeQuery("name")}`,
        this.req(),
      )
      return Errors.buildNotFound(jobName, buildNumber)
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) return Errors.jobNotFound(jobName)
      throw e
    }
  }

  // A 404 on a build sub-resource (testReport, wfapi, artifact/…) can also mean
  // the build exists and only the sub-resource is missing. Reading the build
  // record once separates those cases: when the build is gone this resolves to
  // the job/build error above; when it is there, null hands the decision back
  // to the caller's fallback (that missing stage data or artifact is not an
  // error in the same sense).
  private async subResource404Error(
    jobName: string,
    buildNumber: number,
  ): Promise<McpError | null> {
    try {
      await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/api/json${treeQuery("number")}`,
        this.req(),
      )
      return null
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        return this.buildNotFoundError(jobName, buildNumber)
      throw e
    }
  }

  async triggerBuild(
    jobName: string,
    params?: Record<string, any>,
    options?: { useDefaults?: boolean },
  ): Promise<{ jobName: string; queueUrl: string | null }> {
    const passed = params ?? {}
    const passedKeys = Object.keys(passed)

    // /build answers 400 on a job that has parameter definitions, and deploy
    // style parameters that default to true must never be triggered from
    // Jenkins' own silent defaults. Read the definitions first: they choose the
    // endpoint and validate the params, so a bad trigger never leaves the
    // client. The 404 of the lookup itself maps to the job being missing.
    const defs = (await this.fetchParameterDefinitions(jobName)).map(
      (d: any) => ({
        name: d.name ?? "",
        type: d.type ?? d._class ?? "",
        defaultValue: d.defaultParameterValue?.value,
      }),
    )
    const isParameterized = defs.length > 0
    const defNameSet = new Set(defs.map((d) => d.name))

    const unknown = passedKeys.filter((k) => !defNameSet.has(k))
    if (unknown.length > 0) {
      const valid = isParameterized
        ? ` Valid parameters: ${defs.map((d) => d.name).join(", ")}.`
        : " This job takes no parameters."
      throw Errors.invalidInput(
        `Unknown parameters for job ${jobName}: ${unknown.join(", ")}.${valid}`,
      )
    }

    // A missing parameter left to Jenkins silently picks up the job's own
    // default, which for deploy flags defaults to true. Refuse unless the
    // caller explicitly opted into the defaults.
    const useDefaults = options?.useDefaults === true
    const missing = defs.filter((d) => !(d.name in passed))
    if (missing.length > 0 && !useDefaults) {
      const defaultLabel = (v: any) =>
        v === undefined
          ? "none"
          : typeof v === "string"
            ? v
            : JSON.stringify(v)
      throw Errors.parametersRequired(
        `Job ${jobName} has parameters that were not passed: ` +
          missing
            .map((d) => `${d.name} (${d.type}, default ${defaultLabel(d.defaultValue)})`)
            .join(", ") +
          ". Pass them in params, or set useDefaults: true to let Jenkins fill them.",
      )
    }

    const crumb = await this.ensureCrumb()
    const path = isParameterized ? "buildWithParameters" : "build"
    const url = `${this.baseUrl}/job/${jobPath(jobName)}/${path}`
    let body: string | undefined
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    if (isParameterized) {
      const usp = new URLSearchParams()
      for (const [k, v] of Object.entries(passed)) usp.append(k, String(v))
      body = usp.toString()
      headers["Content-Type"] = "application/x-www-form-urlencoded"
    }
    try {
      // Triggers are the one request where a followed redirect lies: a real
      // queueing trigger answers 201 + Location, while an authentication
      // redirect lands on a 200 HTML page that reads as success with a null
      // queueUrl. Following is disabled only on these two trigger POSTs so the
      // 3xx itself surfaces; other POST callers keep fetch's default.
      let res = await httpPost(url, {
        headers,
        body,
        timeoutMs: this.timeoutMs,
        redirect: "manual",
      })
      // A crumb is bound to the web session it was issued with. Once Jenkins
      // expires that session, every POST carrying the cached crumb and cookie is
      // refused with 403 while reads keep working, so the client looked healthy
      // and only triggers failed, silently. Re-issue the crumb once and retry.
      // Issue #19.
      if (res.status === 403 && crumb) {
        const fresh = await this.reissueCrumb()
        const retryHeaders: Record<string, string> = this.headers()
        if (fresh) retryHeaders[fresh.crumbRequestField] = fresh.crumb
        if (headers["Content-Type"])
          retryHeaders["Content-Type"] = headers["Content-Type"]
        res = await httpPost(url, {
          headers: retryHeaders,
          body,
          timeoutMs: this.timeoutMs,
          redirect: "manual",
        })
      }
      if (res.status === 404) throw Errors.jobNotFound(jobName)
      if (res.status >= 300) {
        const redirect = res.headers["location"]
        throw Errors.unexpected(
          `Trigger build failed: HTTP ${res.status} for ${url}` +
            (redirect ? ` (redirects to ${redirect}; not followed)` : ""),
        )
      }
      const queueUrl = res.headers["location"] || null
      if (!queueUrl)
        throw Errors.unexpected(
          `Trigger build returned HTTP ${res.status} without a queue Location header for ${url}`,
        )
      return { jobName, queueUrl }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  async listArtifacts(
    jobName: string,
    buildNumber: number,
  ): Promise<
    { fileName: string; relativePath: string; url: string; size?: number }[]
  > {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/api/json${treeQuery("artifacts[fileName,relativePath]")}`,
        this.req(),
      )
      if (!data || !Array.isArray(data.artifacts)) return []
      return data.artifacts.map((a: any) => ({
        fileName: a.fileName,
        relativePath: a.relativePath,
        url: `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/artifact/${a.relativePath}`,
      }))
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw await this.buildNotFoundError(jobName, buildNumber)
      throw e
    }
  }

  async getArtifact(
    jobName: string,
    buildNumber: number,
    relativePath: string,
  ): Promise<{
    fileName: string
    relativePath: string
    size: number
    base64: string
  }> {
    const url = `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/artifact/${relativePath}`
    try {
      const data = await httpGetText(url, this.req())
      const buf = Buffer.from(data, "utf8")
      return {
        fileName: relativePath.split("/").pop() || relativePath,
        relativePath,
        size: buf.length,
        base64: buf.toString("base64"),
      }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) {
        const err = await this.subResource404Error(jobName, buildNumber)
        if (err) throw err
        throw Errors.artifactNotFound(relativePath)
      }
      throw e
    }
  }

  async searchJobs(
    query: string,
    options: ListJobsOptions = {},
  ): Promise<JenkinsJob[]> {
    if (!query.trim()) return []
    const all = await this.listJobs(options)
    const q = query.toLowerCase()
    return all.filter((j) => j.name.toLowerCase().includes(q))
  }

  // Stop/abort a running build
  async stopBuild(
    jobName: string,
    buildNumber: number,
  ): Promise<{ jobName: string; buildNumber: number; stopped: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    try {
      // httpPost resolves with the status rather than throwing on 4xx/5xx, so
      // the catch below only guards transport errors; the result has to be
      // classified here or every failed stop was reported as stopped.
      const res = await httpPost(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/stop`,
        { headers, timeoutMs: this.timeoutMs },
      )
      if (res.status === 404)
        throw await this.buildNotFoundError(jobName, buildNumber)
      if (res.status >= 400)
        throw Errors.unexpected(`Stop build failed: HTTP ${res.status}`)
      return { jobName, buildNumber, stopped: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw await this.buildNotFoundError(jobName, buildNumber)
      throw e
    }
  }

  // Delete a build
  async deleteBuild(
    jobName: string,
    buildNumber: number,
  ): Promise<{ jobName: string; buildNumber: number; deleted: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    try {
      // Same as stopBuild: httpPost resolves with the status, so the catch
      // below only guards transport errors and the result is classified here.
      const res = await httpPost(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/doDelete`,
        { headers, timeoutMs: this.timeoutMs },
      )
      if (res.status === 404)
        throw await this.buildNotFoundError(jobName, buildNumber)
      if (res.status >= 400)
        throw Errors.unexpected(`Delete build failed: HTTP ${res.status}`)
      return { jobName, buildNumber, deleted: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw await this.buildNotFoundError(jobName, buildNumber)
      throw e
    }
  }

  // Get test results for a build
  async getTestResults(jobName: string, buildNumber: number): Promise<any> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/testReport/api/json`,
        this.req(),
      )
      return {
        jobName,
        buildNumber,
        totalTests: data.totalCount || 0,
        passedTests: data.passCount || 0,
        failedTests: data.failCount || 0,
        skippedTests: data.skipCount || 0,
        duration: data.duration || 0,
        suites: data.suites || [],
      }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) {
        const err = await this.subResource404Error(jobName, buildNumber)
        if (err) throw err
        return {
          jobName,
          buildNumber,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          message: "No test results found",
        }
      }
      throw e
    }
  }

  // Get build queue
  async getQueue(): Promise<any[]> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/queue/api/json`,
        this.req(),
      )
      if (!data.items) return []
      return data.items.map((item: any) => ({
        id: item.id,
        blocked: item.blocked || false,
        buildable: item.buildable || false,
        stuck: item.stuck || false,
        why: item.why || "",
        task: {
          name: item.task?.name || "",
          url: item.task?.url || "",
        },
        inQueueSince: item.inQueueSince
          ? new Date(item.inQueueSince).toISOString()
          : null,
      }))
    } catch (e: any) {
      throw e
    }
  }

  // Cancel queued build
  async cancelQueue(
    queueId: number,
  ): Promise<{ queueId: number; cancelled: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    try {
      await httpPost(`${this.baseUrl}/queue/cancelItem?id=${queueId}`, {
        headers,
      })
      return { queueId, cancelled: true }
    } catch (e: any) {
      throw e
    }
  }

  // Enable a job
  async enableJob(
    jobName: string,
  ): Promise<{ jobName: string; enabled: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    try {
      await httpPost(`${this.baseUrl}/job/${jobPath(jobName)}/enable`, {
        headers,
      })
      return { jobName, enabled: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  // Disable a job
  async disableJob(
    jobName: string,
  ): Promise<{ jobName: string; disabled: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    try {
      await httpPost(`${this.baseUrl}/job/${jobPath(jobName)}/disable`, {
        headers,
      })
      return { jobName, disabled: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  // Delete a job
  async deleteJob(
    jobName: string,
  ): Promise<{ jobName: string; deleted: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    try {
      await httpPost(`${this.baseUrl}/job/${jobPath(jobName)}/doDelete`, {
        headers,
      })
      return { jobName, deleted: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  // Get job configuration (XML)
  async getJobConfig(
    jobName: string,
  ): Promise<{ jobName: string; config: string }> {
    try {
      const config = await httpGetText(
        `${this.baseUrl}/job/${jobPath(jobName)}/config.xml`,
        this.req(),
      )
      return { jobName, config }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  // One fetch of the job's parameter definitions, shared by getJobParameters
  // (which formats them for callers) and triggerBuild (which validates params
  // against them). Only the HTTP and lookup live here; the parsing differs.
  private async fetchParameterDefinitions(
    jobName: string,
  ): Promise<
    {
      name: string
      type: string
      description: string
      defaultValue: any
      choices?: string[]
    }[]
  > {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/api/json${treeQuery("property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]")}`,
        this.req(),
      )
      const paramProp = (data.property ?? []).find(
        (p: any) =>
          p._class === "hudson.model.ParametersDefinitionProperty" ||
          Array.isArray(p.parameterDefinitions),
      )
      return paramProp?.parameterDefinitions ?? []
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  // Get parameter definitions for a parameterised job
  async getJobParameters(jobName: string): Promise<{
    jobName: string
    parameters: {
      name: string
      type: string
      description: string
      defaultValue: any
      choices?: string[]
    }[]
  }> {
    const defs = await this.fetchParameterDefinitions(jobName)
    const parameters = defs.map((d: any) => {
      const raw: string = d.type ?? d._class ?? ""
      const type = raw
        .replace(/^.*\./, "")
        .replace(/ParameterDefinition$/, "")
        .toLowerCase()
      const entry: ReturnType<typeof Object.assign> = {
        name: d.name ?? "",
        type,
        description: d.description ?? "",
        defaultValue: d.defaultParameterValue?.value ?? null,
      }
      if (Array.isArray(d.choices)) entry.choices = d.choices
      return entry
    })
    return { jobName, parameters }
  }

  // List nodes/agents
  async listNodes(): Promise<any[]> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/computer/api/json?depth=1`,
        this.req(),
      )
      if (!data.computer) return []
      return data.computer.map((node: any) => ({
        name: node.displayName || "",
        offline: node.offline || false,
        idle: node.idle || false,
        numExecutors: node.numExecutors || 0,
        busyExecutors: node.monitorData?.[
          "hudson.node_monitors.SwapSpaceMonitor"
        ]?.availablePhysicalMemory
          ? 0
          : node.numExecutors,
        temporarilyOffline: node.temporarilyOffline || false,
        offlineCauseReason: node.offlineCauseReason || "",
      }))
    } catch (e: any) {
      throw e
    }
  }

  // Get system info
  async getSystemInfo(): Promise<any> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/api/json`,
        this.req(),
      )
      return {
        nodeDescription: data.nodeDescription || "",
        nodeName: data.nodeName || "",
        numExecutors: data.numExecutors || 0,
        mode: data.mode || "",
        quietingDown: data.quietingDown || false,
        useCrumbs: data.useCrumbs || false,
        useSecurity: data.useSecurity || false,
      }
    } catch (e: any) {
      throw e
    }
  }

  // Get Jenkins version
  async getVersion(): Promise<{ version: string }> {
    try {
      // The one request that had no deadline at all, so a Jenkins that never
      // answered hung the caller indefinitely rather than timing out.
      const res = await fetch(`${this.baseUrl}/api/json`, {
        method: "HEAD",
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      const version = res.headers.get("x-jenkins") || "unknown"
      return { version }
    } catch (e: any) {
      if (e.name === "AbortError" || e.name === "TimeoutError")
        throw Errors.timeout()
      throw e
    }
  }

  // Get installed plugins
  async getPlugins(): Promise<any[]> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/pluginManager/api/json?depth=1`,
        this.req(),
      )
      if (!data.plugins) return []
      return data.plugins.map((plugin: any) => ({
        shortName: plugin.shortName || "",
        longName: plugin.longName || "",
        version: plugin.version || "",
        enabled: plugin.enabled || false,
        active: plugin.active || false,
        hasUpdate: plugin.hasUpdate || false,
      }))
    } catch (e: any) {
      throw e
    }
  }

  // Get build changes/commits
  async getBuildChanges(jobName: string, buildNumber: number): Promise<any> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/api/json${treeQuery("changeSet[items[author[fullName],msg,commitId,timestamp]]")}`,
        this.req(),
      )
      if (!data.changeSet || !data.changeSet.items) {
        return { jobName, buildNumber, changes: [] }
      }
      return {
        jobName,
        buildNumber,
        changes: data.changeSet.items.map((change: any) => ({
          author: change.author?.fullName || "unknown",
          message: change.msg || "",
          commitId: change.commitId || "",
          timestamp: change.timestamp
            ? new Date(change.timestamp).toISOString()
            : null,
        })),
      }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw await this.buildNotFoundError(jobName, buildNumber)
      throw e
    }
  }

  // Get pipeline stages
  async getPipelineStages(jobName: string, buildNumber: number): Promise<any> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/wfapi/describe`,
        this.req(),
      )
      return {
        jobName,
        buildNumber,
        status: data.status || "",
        stages: (data.stages || []).map((stage: any) => ({
          id: stage.id || "",
          name: stage.name || "",
          status: stage.status || "",
          startTimeMillis: stage.startTimeMillis || 0,
          durationMillis: stage.durationMillis || 0,
          pauseDurationMillis: stage.pauseDurationMillis || 0,
        })),
      }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) {
        const err = await this.subResource404Error(jobName, buildNumber)
        if (err) throw err
        return {
          jobName,
          buildNumber,
          message: "Not a pipeline build or workflow API not available",
        }
      }
      throw e
    }
  }

  async createJob(
    jobName: string,
    configXml: string,
  ): Promise<{ jobName: string; created: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers({
      "Content-Type": "application/xml",
    })
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    const res = await httpPost(createItemUrl(this.baseUrl, jobName), {
      headers,
      body: configXml,
    })
    if (res.status >= 400)
      throw Errors.unexpected(`Create job failed: HTTP ${res.status}`)
    return { jobName, created: true }
  }

  async updateJobConfig(
    jobName: string,
    configXml: string,
  ): Promise<{ jobName: string; updated: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers({
      "Content-Type": "application/xml",
    })
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    try {
      await httpPost(`${this.baseUrl}/job/${jobPath(jobName)}/config.xml`, {
        headers,
        body: configXml,
      })
      return { jobName, updated: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  async renameJob(
    jobName: string,
    newName: string,
  ): Promise<{ oldName: string; newName: string; renamed: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    try {
      await httpPost(
        `${this.baseUrl}/job/${jobPath(jobName)}/rename?newName=${encodeURIComponent(newName)}`,
        { headers, timeoutMs: this.timeoutMs },
      )
      return { oldName: jobName, newName, renamed: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(jobName)
      throw e
    }
  }

  async copyJob(
    fromName: string,
    newName: string,
  ): Promise<{ fromName: string; newName: string; copied: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    try {
      const sourceFullName = normalizeJobFullName(fromName)
      // The leading slash on `from` is load-bearing, not stray. Jenkins resolves
      // `from` through relative item lookup, so an unprefixed name is looked up
      // relative to the new item's parent folder -- which silently finds the
      // wrong source, or nothing, whenever the copy crosses folders. The slash
      // forces absolute resolution from the instance root. Verified end to end
      // against nested folders; not yet confirmed across Jenkins versions, and
      // the Folders plugin has moved around in this area, so treat a copy that
      // fails only on one instance as a candidate for version sensitivity here.
      const res = await httpPost(
        `${createItemUrl(this.baseUrl, newName)}&from=${encodeURIComponent(`/${sourceFullName}`)}&mode=copy`,
        { headers, timeoutMs: this.timeoutMs },
      )
      if (res.status >= 400)
        throw Errors.unexpected(`Copy job failed: HTTP ${res.status}`)
      return { fromName, newName, copied: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404")) throw Errors.jobNotFound(fromName)
      throw e
    }
  }

  async getNode(nodeName: string): Promise<any> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/computer/${encodeURIComponent(nodeName)}/api/json?depth=1`,
        this.req(),
      )
      return {
        name: data.displayName || nodeName,
        offline: data.offline || false,
        temporarilyOffline: data.temporarilyOffline || false,
        offlineCauseReason: data.offlineCauseReason || "",
        idle: data.idle || false,
        numExecutors: data.numExecutors || 0,
        assignedLabels: (data.assignedLabels || []).map((l: any) => l.name),
        monitorData: data.monitorData || {},
      }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw new McpError("NODE_NOT_FOUND", `Node not found: ${nodeName}`, 404)
      throw e
    }
  }

  async toggleNodeOffline(
    nodeName: string,
    offlineMessage = "",
  ): Promise<{ nodeName: string; toggledOffline: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    try {
      await httpPost(
        `${this.baseUrl}/computer/${encodeURIComponent(nodeName)}/toggleOffline?offlineMessage=${encodeURIComponent(offlineMessage)}`,
        { headers, timeoutMs: this.timeoutMs },
      )
      return { nodeName, toggledOffline: true }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw new McpError("NODE_NOT_FOUND", `Node not found: ${nodeName}`, 404)
      throw e
    }
  }

  async listViews(): Promise<
    { name: string; url: string; jobs: { name: string; url: string }[] }[]
  > {
    const data = await httpGetJson<any>(
      `${this.baseUrl}/api/json${treeQuery("views[name,url,jobs[name,url]]")}`,
      this.req(),
    )
    if (!Array.isArray(data.views)) return []
    return data.views.map((v: any) => ({
      name: v.name || "",
      url: v.url || "",
      jobs: (v.jobs || []).map((j: any) => ({ name: j.name, url: j.url })),
    }))
  }

  async getView(viewName: string): Promise<any> {
    try {
      const data = await httpGetJson<any>(
        `${this.baseUrl}/view/${encodeURIComponent(viewName)}/api/json`,
        this.req(),
      )
      return {
        name: data.name || viewName,
        url: data.url || "",
        description: data.description || "",
        jobs: (data.jobs || []).map((j: any) => ({
          name: j.name,
          url: j.url,
          color: j.color,
        })),
      }
    } catch (e: any) {
      if (e.message?.includes("HTTP 404"))
        throw new McpError("VIEW_NOT_FOUND", `View not found: ${viewName}`, 404)
      throw e
    }
  }

  async quietDown(reason = ""): Promise<{ quietingDown: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    const url = reason
      ? `${this.baseUrl}/quietDown?reason=${encodeURIComponent(reason)}`
      : `${this.baseUrl}/quietDown`
    await httpPost(url, { headers, timeoutMs: this.timeoutMs })
    return { quietingDown: true }
  }

  async cancelQuietDown(): Promise<{ quietingDown: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    await httpPost(`${this.baseUrl}/cancelQuietDown`, {
      headers,
      timeoutMs: this.timeoutMs,
    })
    return { quietingDown: false }
  }

  async safeRestart(): Promise<{ restarting: boolean }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb
    await httpPost(`${this.baseUrl}/safeRestart`, {
      headers,
      timeoutMs: this.timeoutMs,
    })
    return { restarting: true }
  }

  // Replay build (for pipeline jobs)
  async replayBuild(
    jobName: string,
    buildNumber: number,
    mainScript?: string,
  ): Promise<{
    jobName: string
    buildNumber: number
    queueUrl: string
  }> {
    const crumb = await this.ensureCrumb()
    const headers: Record<string, string> = this.headers()
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb

    const init: RequestInit & { timeoutMs?: number } = {
      headers,
      timeoutMs: this.timeoutMs,
    }
    if (mainScript !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded"
      init.body = new URLSearchParams({ mainScript }).toString()
    }
    const url = `${this.baseUrl}/job/${jobPath(jobName)}/${buildNumber}/replay/rebuild`
    // Same rule as the trigger POSTs: a followed redirect turns an
    // authentication bounce into a 200 HTML page that reads as a queued build,
    // so the 3xx itself must surface.
    const res = await httpPost(url, { ...init, redirect: "manual" })
    if (res.status === 404)
      throw await this.buildNotFoundError(jobName, buildNumber)
    if (res.status >= 400)
      throw Errors.unexpected(`Replay failed with status ${res.status}`)
    if (res.status >= 300) {
      const redirect = res.headers["location"]
      throw Errors.unexpected(
        `Replay failed: HTTP ${res.status} for ${url}` +
          (redirect ? `, redirects to ${redirect}, not followed` : ""),
      )
    }
    const queueUrl = res.headers["location"] || null
    if (!queueUrl)
      throw Errors.unexpected(
        `Replay returned HTTP ${res.status} without a queue Location header for ${url}`,
      )
    return { jobName, buildNumber, queueUrl }
  }
}

export const createClient = () => new JenkinsClient()
