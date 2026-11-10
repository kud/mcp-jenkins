// A small in-memory Jenkins behind a stubbed global fetch. It answers by
// path, the way Jenkins does, so the same tests run against any client that
// speaks Jenkins' REST API, whatever query strings or request order it uses.
// Responses are supersets of every field a client might ask for with `tree`.
import { vi } from "vitest"

export const BASE_URL = "https://jenkins.example.com"

export interface FakeBuild {
  number: number
  result: string | null
  building?: boolean
  duration?: number
  timestamp?: number
  log?: string
  artifacts?: { fileName: string; relativePath: string; content: string }[]
  testReport?: unknown
  stages?: unknown
  stageNodes?: Record<string, { stageFlowNodes: unknown[] }>
  stepLogs?: Record<string, string>
  changeSet?: unknown
}

export interface FakeJob {
  // Path segments as Jenkins nests them: a multibranch branch "feature/x" is
  // one segment, ["repo", "feature/x"].
  segments: string[]
  _class: string
  builds?: FakeBuild[]
  parameters?: unknown[]
  config?: string
}

export interface FakeRequest {
  method: string
  path: string
  url: string
  headers: Record<string, string>
  body?: string
}

const WORKFLOW = "org.jenkinsci.plugins.workflow.job.WorkflowJob"
const FOLDER = "com.cloudbees.hudson.plugins.folder.Folder"
const MULTIBRANCH =
  "org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject"

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0)

export const defaultJobs = (): FakeJob[] => [
  {
    segments: ["app"],
    _class: WORKFLOW,
    config: "<project><description>app</description></project>",
    builds: [
      {
        number: 3,
        result: "FAILURE",
        duration: 61000,
        timestamp: T0 + 3000,
        log:
          Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join("\n") +
          "\n",
        artifacts: [
          {
            fileName: "out.txt",
            relativePath: "dist/out.txt",
            content: "hello",
          },
        ],
        testReport: {
          totalCount: 3,
          passCount: 1,
          failCount: 2,
          skipCount: 0,
          duration: 1.5,
          suites: [
            {
              name: "suite",
              cases: [
                { className: "app.Auth", name: "logs in", status: "PASSED" },
                {
                  className: "app.Auth",
                  name: "rejects bad token",
                  status: "FAILED",
                  errorDetails: "expected 401, got 200",
                  errorStackTrace: "AssertionError\n  at auth.test.ts:12",
                },
                {
                  className: "app.Cart",
                  name: "totals",
                  status: "REGRESSION",
                  errorDetails: "expected 30, got 29",
                },
              ],
            },
          ],
        },
        stages: {
          status: "FAILED",
          stages: [
            {
              id: "6",
              name: "Checkout",
              status: "SUCCESS",
              startTimeMillis: T0,
              durationMillis: 1000,
              pauseDurationMillis: 0,
            },
            {
              id: "12",
              name: "Test",
              status: "FAILED",
              startTimeMillis: T0 + 1000,
              durationMillis: 50000,
              pauseDurationMillis: 0,
            },
            {
              id: "20",
              name: "Deploy",
              status: "FAILED",
              startTimeMillis: T0 + 51000,
              durationMillis: 10,
              pauseDurationMillis: 0,
            },
          ],
        },
        stageNodes: {
          "12": {
            stageFlowNodes: [{ id: "13", name: "npm test", status: "FAILED" }],
          },
          "20": {
            stageFlowNodes: [
              { id: "21", name: "deploy.sh", status: "NOT_EXECUTED" },
            ],
          },
        },
        stepLogs: {
          "13":
            "&gt; app@1.0.0 test\n" +
            "running 3 tests\n" +
            "PASS auth logs in\n" +
            "Error: expected 401, got 200\n" +
            "    at auth.test.ts:12\n" +
            "Report Link: https://reports.example.com/app/3\n" +
            "2 failed\n",
          "21": 'Stage "Deploy" skipped due to earlier failure(s)\n',
        },
        changeSet: {
          items: [
            {
              author: { fullName: "Ada" },
              msg: "fix auth",
              commitId: "abc123",
              timestamp: T0,
            },
          ],
        },
      },
      {
        number: 2,
        result: "SUCCESS",
        duration: 42000,
        timestamp: T0 + 2000,
        log: "ok\n",
      },
      {
        number: 1,
        result: null,
        building: true,
        duration: 0,
        timestamp: T0 + 1000,
        log: "running\n",
      },
    ],
  },
  {
    segments: ["deploy"],
    _class: WORKFLOW,
    parameters: [
      {
        _class: "hudson.model.ChoiceParameterDefinition",
        name: "ENV",
        type: "ChoiceParameterDefinition",
        description: "Target",
        defaultParameterValue: { value: "dev" },
        choices: ["dev", "prod"],
      },
      {
        _class: "hudson.model.BooleanParameterDefinition",
        name: "DRY_RUN",
        type: "BooleanParameterDefinition",
        description: "",
        defaultParameterValue: { value: true },
      },
    ],
    builds: [],
  },
  { segments: ["empty"], _class: WORKFLOW, builds: [] },
  { segments: ["Team"], _class: FOLDER },
  {
    segments: ["Team", "svc"],
    _class: WORKFLOW,
    builds: [
      {
        number: 7,
        result: "SUCCESS",
        duration: 1000,
        timestamp: T0,
        log: "svc\n",
      },
    ],
  },
  { segments: ["repo"], _class: MULTIBRANCH },
  {
    segments: ["repo", "feature/x"],
    _class: WORKFLOW,
    builds: [
      {
        number: 4,
        result: "SUCCESS",
        duration: 2000,
        timestamp: T0 + 4000,
        log: "branch log\n",
      },
    ],
  },
]

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
const text = (
  body: string,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...headers },
  })
const notFound = () => text("Not Found", 404)

export interface FakeJenkins {
  jobs: FakeJob[]
  requests: FakeRequest[]
  queue: unknown[]
  fetch: ReturnType<typeof vi.fn>
}

export const installFakeJenkins = (
  jobs: FakeJob[] = defaultJobs(),
): FakeJenkins => {
  const requests: FakeRequest[] = []
  const queue = [
    {
      id: 41,
      blocked: false,
      buildable: true,
      stuck: false,
      why: "Waiting for next available executor",
      task: { name: "app", url: `${BASE_URL}/job/app/` },
      inQueueSince: T0,
    },
  ]
  const key = (segs: string[]) => segs.join("\u0000")
  const byKey = new Map(jobs.map((j) => [key(j.segments), j]))
  const urlOfJob = (j: FakeJob) =>
    `${BASE_URL}/${j.segments.map((s) => `job/${encodeURIComponent(s)}`).join("/")}/`
  const children = (parent: string[]) =>
    jobs.filter(
      (j) =>
        j.segments.length === parent.length + 1 &&
        parent.every((s, i) => j.segments[i] === s),
    )
  const jobSummary = (j: FakeJob): Record<string, unknown> => ({
    name: j.segments[j.segments.length - 1],
    url: urlOfJob(j),
    color: "blue",
    _class: j._class,
    ...(j._class === WORKFLOW
      ? {}
      : {
          jobs: children(j.segments).map(jobSummary),
        }),
  })
  const buildRecord = (j: FakeJob, b: FakeBuild) => ({
    _class: "org.jenkinsci.plugins.workflow.job.WorkflowRun",
    number: b.number,
    id: String(b.number),
    result: b.result,
    building: b.building ?? false,
    duration: b.duration ?? 0,
    timestamp: b.timestamp ?? T0,
    url: `${urlOfJob(j)}${b.number}/`,
    artifacts: (b.artifacts ?? []).map(({ fileName, relativePath }) => ({
      fileName,
      relativePath,
    })),
    changeSet: b.changeSet ?? { items: [] },
    changeSets: b.changeSet ? [b.changeSet] : [],
    culprits: [],
    actions: [],
  })

  const handle = (
    method: string,
    path: string,
    url: URL,
    body?: string,
  ): Response => {
    const parts = path.split("/").filter(Boolean)

    // Instance-level endpoints
    if (parts[0] !== "job") {
      const p = parts.join("/")
      if (p === "crumbIssuer/api/json")
        return json(
          { crumb: "c0ffee", crumbRequestField: "Jenkins-Crumb" },
          200,
          {
            "set-cookie": "JSESSIONID.x=sess1; Path=/",
          },
        )
      if (p === "api/json") {
        if (method === "HEAD") return text("", 200, { "x-jenkins": "2.462.3" })
        return json({
          _class: "hudson.model.Hudson",
          nodeDescription: "the built-in node",
          nodeName: "",
          numExecutors: 2,
          mode: "NORMAL",
          quietingDown: false,
          useCrumbs: true,
          useSecurity: true,
          jobs: children([]).map(jobSummary),
          views: [
            {
              name: "all",
              url: `${BASE_URL}/`,
              jobs: [{ name: "app", url: `${BASE_URL}/job/app/` }],
            },
          ],
        })
      }
      if (p === "queue/api/json") return json({ items: queue })
      if (p === "queue/cancelItem")
        return text("", 302, { location: `${BASE_URL}/queue/` })
      if (p === "computer/api/json")
        return json({
          computer: [
            {
              displayName: "built-in",
              offline: false,
              idle: false,
              numExecutors: 2,
              executors: [{ idle: false }, { idle: true }],
              temporarilyOffline: false,
              offlineCauseReason: "",
              monitorData: {},
            },
          ],
        })
      if (
        parts[0] === "computer" &&
        parts.length === 4 &&
        p.endsWith("/api/json")
      ) {
        const name = decodeURIComponent(parts[1])
        if (name !== "agent-1") return notFound()
        return json({
          displayName: "agent-1",
          offline: true,
          temporarilyOffline: true,
          offlineCauseReason: "maintenance",
          idle: true,
          numExecutors: 4,
          assignedLabels: [{ name: "linux" }, { name: "agent-1" }],
          monitorData: {
            "hudson.node_monitors.ArchitectureMonitor": "Linux (amd64)",
          },
        })
      }
      if (parts[0] === "computer" && parts[2] === "toggleOffline")
        return decodeURIComponent(parts[1]) === "agent-1"
          ? text("")
          : notFound()
      if (parts[0] === "view" && p.endsWith("/api/json")) {
        if (decodeURIComponent(parts[1]) !== "all") return notFound()
        return json({
          name: "all",
          url: `${BASE_URL}/`,
          description: "Everything",
          jobs: [{ name: "app", url: `${BASE_URL}/job/app/`, color: "red" }],
        })
      }
      if (p === "pluginManager/api/json")
        return json({
          plugins: [
            {
              shortName: "git",
              longName: "Git plugin",
              version: "5.2.1",
              enabled: true,
              active: true,
              hasUpdate: false,
            },
          ],
        })
      if (["quietDown", "cancelQuietDown", "safeRestart"].includes(p))
        return text("")
      if (p === "createItem") {
        const name = url.searchParams.get("name") ?? ""
        if (url.searchParams.get("mode") === "copy") {
          const from = (url.searchParams.get("from") ?? "").replace(/^\//, "")
          if (!byKey.has(key(from.split("/")))) return notFound()
        }
        if (byKey.has(key([name]))) return text("A job already exists", 400)
        return text("")
      }
      return notFound()
    }

    // Job-level endpoints: consume job/<seg> pairs
    const segs: string[] = []
    let i = 0
    while (parts[i] === "job" && parts[i + 1] !== undefined) {
      segs.push(decodeURIComponent(parts[i + 1]))
      i += 2
    }
    const job = byKey.get(key(segs))
    if (!job) return notFound()
    const rest = parts.slice(i)
    const r = rest.join("/")

    if (r === "api/json")
      return json({
        ...jobSummary(job),
        fullName: job.segments.join("/"),
        builds: (job.builds ?? []).map((b) => buildRecord(job, b)),
        lastBuild: job.builds?.[0] ? { number: job.builds[0].number } : null,
        property: job.parameters
          ? [
              {
                _class: "hudson.model.ParametersDefinitionProperty",
                parameterDefinitions: job.parameters,
              },
            ]
          : [],
      })
    if (r === "config.xml") {
      if (method === "POST") return text("")
      return new Response(job.config ?? "<project/>", {
        status: 200,
        headers: { "content-type": "application/xml" },
      })
    }
    if (
      ["enable", "disable", "doDelete", "rename", "confirmRename"].includes(r)
    )
      return text("")
    if (r === "createItem") return text("")
    if (r === "build" || r === "buildWithParameters") {
      if (r === "build" && job.parameters?.length)
        return text("Nothing is submitted", 400)
      return text("", 201, { location: `${BASE_URL}/queue/item/42/` })
    }

    const ref = rest[0]
    const builds = job.builds ?? []
    const build =
      ref === "lastBuild"
        ? builds[0]
        : builds.find((b) => String(b.number) === ref)
    if (!build) return notFound()
    const sub = rest.slice(1).join("/")
    if (sub === "api/json") return json(buildRecord(job, build))
    if (sub === "consoleText") return text(build.log ?? "")
    if (sub === "logText/progressiveText") {
      const start = Number(url.searchParams.get("start") ?? 0)
      const all = Buffer.from(build.log ?? "", "utf8")
      return text(all.subarray(start).toString("utf8"), 200, {
        "x-text-size": String(all.length),
        "x-more-data": String(build.building === true),
      })
    }
    if (sub === "testReport/api/json")
      return build.testReport ? json(build.testReport) : notFound()
    if (sub === "wfapi/describe")
      return build.stages ? json(build.stages) : notFound()
    const node = /^execution\/node\/([^/]+)\/wfapi\/(describe|log)$/.exec(sub)
    if (node) {
      if (node[2] === "describe") {
        const n = build.stageNodes?.[node[1]]
        return n ? json(n) : notFound()
      }
      const log = build.stepLogs?.[node[1]]
      return log === undefined
        ? notFound()
        : json({ nodeId: node[1], text: log, length: log.length })
    }
    if (rest[1] === "artifact") {
      const rel = rest.slice(2).map(decodeURIComponent).join("/")
      const a = build.artifacts?.find((x) => x.relativePath === rel)
      return a
        ? new Response(a.content, {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          })
        : notFound()
    }
    if (sub === "stop" || sub === "doDelete") return text("")
    if (sub === "replay/rebuild")
      return text("", 201, { location: `${BASE_URL}/queue/item/43/` })
    return notFound()
  }

  const fetch = vi.fn(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input))
      const method = (init.method ?? "GET").toUpperCase()
      const headers = Object.fromEntries(new Headers(init.headers).entries())
      const body = typeof init.body === "string" ? init.body : undefined
      const path = url.pathname
      requests.push({ method, path, url: url.toString(), headers, body })
      return handle(method, path, url, body)
    },
  )
  vi.stubGlobal("fetch", fetch)
  return { jobs, requests, queue, fetch }
}
