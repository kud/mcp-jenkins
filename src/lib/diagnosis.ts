import type { DiagnoseBuildResult, FailedStage } from "@kud/jenkins"
import { Errors } from "../common/index.js"

// The one-screen reading of a failed build, line for line what `jenkins why`
// prints with colour off (formatDiagnosis in @kud/jenkins-cli), so a person
// and an agent looking at the same build read the same facts.

// Stages that carry no failure of their own: Jenkins marks a stage skipped
// after an earlier failure, and an "Error signal" step only raises UNSTABLE.
const SKIPPED = /skipped due to earlier failure/
const saysSkipped = (stage: FailedStage) =>
  stage.steps.length > 0 &&
  stage.steps.every(
    (s) => s.status !== "FAILED" && SKIPPED.test(s.logTail || ""),
  )
// Jenkins also reports a skipped stage as FAILED when a wrapper step ran
// before the body; the skip notice then sits only in the full console. Such a
// stage has only successful steps and no error lines, and comes after a stage
// that really failed.
const looksSkipped = (stage: FailedStage) =>
  stage.status === "FAILED" &&
  stage.steps.length > 0 &&
  stage.steps.every(
    (s) => s.status === "SUCCESS" && (s.errorLines?.length ?? 0) === 0,
  )
const findSkipped = (stages: FailedStage[]): FailedStage[] => {
  const skipped: FailedStage[] = []
  let earlierFailure = false
  for (const stage of stages) {
    if (saysSkipped(stage) || (earlierFailure && looksSkipped(stage)))
      skipped.push(stage)
    else if (stage.status === "FAILED") earlierFailure = true
  }
  return skipped
}
const errorSignal = (stage: FailedStage) =>
  stage.steps.length === 1 && /^error signal$/i.test(stage.steps[0].name)
    ? stage.steps[0]
    : null
const lastLine = (text = "") =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop() ?? ""

export const formatDiagnosis = (
  d: DiagnoseBuildResult,
  { tail = false }: { tail?: boolean } = {},
): string => {
  const out: string[] = []

  out.push(`${d.job} #${d.build}  ${d.result ?? "RUNNING"}`)
  if (d.url) out.push(d.url)

  const skipped = findSkipped(d.failedStages)
  for (const stage of d.failedStages) {
    if (skipped.includes(stage)) continue
    const signal = errorSignal(stage)
    if (signal) {
      const why = lastLine(signal.logTail)
      out.push(
        "",
        `stage ${stage.name}  ${stage.status}  error signal${why ? `: ${why}` : ""}`,
      )
      continue
    }
    out.push("", `stage ${stage.name}  ${stage.status}`)
    if (stage.steps.length === 0) out.push("  (no step details)")
    for (const step of stage.steps) {
      out.push(`step  ${step.name}  ${step.status}`)
      const of = step.logLineCount
        ? ` of ${step.logLineCount.toLocaleString("en-GB")}`
        : ""
      for (const link of step.reportLinks ?? []) out.push(`  report ${link}`)
      for (const block of step.errorLines ?? []) {
        out.push(`  line ${block.line.toLocaleString("en-GB")}${of}`)
        out.push(...block.text.map((l) => `    ${l}`))
      }
      if (step.errorLines && step.errorLines.length === 0)
        out.push("  no error lines found in the step log")
      // Error blocks already show what failed; the tail would mostly repeat
      // them under whatever the step printed afterwards.
      const found = (step.errorLines?.length ?? 0) > 0
      const tailText = (step.logTail || "").replace(/\s+$/, "")
      if (tailText && found && !tail)
        out.push("  last lines hidden (tail: true to show)")
      else if (tailText) {
        out.push("  last lines")
        out.push(...tailText.split("\n").map((l) => `    ${l}`))
      }
    }
  }

  if (skipped.length)
    out.push(
      "",
      `skipped (earlier failure): ${skipped.map((s) => s.name).join(", ")}`,
    )

  if (!d.tests) out.push("", "no JUnit report for this build")
  if (d.tests) {
    out.push("", `junit ${d.tests.failed} failed of ${d.tests.total}`)
    // A stage can fail outside JUnit (remote runners, scripts); say so rather
    // than let "0 failed" read as a clean build.
    if (d.tests.failed === 0 && d.failedStages.length > 0)
      out.push("  the failing stages above are not in this report")
    for (const t of d.tests.first) {
      out.push(`  ✗ ${t.name}`)
      if (t.error) out.push(`    ${t.error.split("\n")[0]}`)
    }
    const more = d.tests.failed - d.tests.first.length
    if (more > 0) out.push(`  … ${more} more`)
  }

  if (d.failedStages.length === 0 && !d.tests?.failed)
    out.push("", "no failing stage or test found")
  for (const h of d.hints) out.push(`hint: ${h}`)

  return out.join("\n")
}

// A build page URL as Jenkins links it, read back into a job full name and a
// build reference: ".../job/repo/job/feature%2Fx/12/" is job "repo/feature/x",
// build 12. Each /job/ segment is decoded, so a branch with a slash comes back
// whole and the core's path walk finds it again. A permalink (lastBuild,
// lastFailedBuild) is kept as given; a job URL with no build leaves it unset.
export const parseBuildUrl = (
  url: string,
  baseUrl: string,
): { jobName: string; build?: number | string } => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw Errors.invalidInput(`Not a URL: ${url}`)
  }
  const basePath = new URL(baseUrl).pathname.replace(/\/+$/, "")
  const path = parsed.pathname.startsWith(basePath + "/")
    ? parsed.pathname.slice(basePath.length)
    : parsed.pathname
  const parts = path.split("/").filter(Boolean)
  const segments: string[] = []
  let i = 0
  while (parts[i] === "job" && parts[i + 1] !== undefined) {
    segments.push(decodeURIComponent(parts[i + 1]))
    i += 2
  }
  if (segments.length === 0)
    throw Errors.invalidInput(`No Jenkins job in URL: ${url}`)
  const ref = parts[i]
  const build = /^\d+$/.test(ref ?? "")
    ? Number(ref)
    : /^last\w*Build$/.test(ref ?? "")
      ? ref
      : undefined
  return { jobName: segments.join("/"), build }
}
