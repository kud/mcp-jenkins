import { describe, it, expect } from "vitest"
import { rawTools } from "../src/tool-manifest.js"

// The set of tools whose operations delete, overwrite, abort, or halt Jenkins state.
// A mis-annotation here is dangerous: marking one of these read-only would let an MCP
// client auto-run it without confirmation. This list is the safety contract — if a tool
// is added to or removed from the destructive category, update it deliberately.
const DESTRUCTIVE_TOOLS = new Set([
  "jenkins_stop_build",
  "jenkins_delete_build",
  "jenkins_cancel_queue",
  "jenkins_disable_job",
  "jenkins_delete_job",
  "jenkins_update_job_config",
  "jenkins_rename_job",
  "jenkins_toggle_node_offline",
  "jenkins_quiet_down",
  "jenkins_safe_restart",
])

const annotationsOf = (name: string) =>
  rawTools.find((tool) => tool.name === name)?.annotations

describe("tool annotations", () => {
  it("defines annotations for every tool", () => {
    const missing = rawTools
      .filter((tool) => !tool.annotations)
      .map((t) => t.name)
    expect(missing).toEqual([])
  })

  it("marks every destructive tool as destructive and not read-only", () => {
    for (const name of DESTRUCTIVE_TOOLS) {
      const annotations = annotationsOf(name)
      expect(annotations, `${name} is missing from rawTools`).toBeDefined()
      expect(
        annotations?.destructiveHint,
        `${name} should be destructiveHint: true`,
      ).toBe(true)
      expect(
        annotations?.readOnlyHint,
        `${name} must never be readOnlyHint: true`,
      ).toBe(false)
    }
  })

  it("never marks a tool as both read-only and destructive", () => {
    const contradictory = rawTools
      .filter(
        (tool) =>
          tool.annotations?.readOnlyHint && tool.annotations?.destructiveHint,
      )
      .map((t) => t.name)
    expect(contradictory).toEqual([])
  })

  it("marks read-only tools (readOnlyHint) as non-destructive", () => {
    const readOnly = rawTools.filter(
      (tool) => tool.annotations?.readOnlyHint === true,
    )
    // Sanity: the read-only set is the majority of the surface, and none may be destructive.
    expect(readOnly.length).toBeGreaterThan(DESTRUCTIVE_TOOLS.size)
    for (const tool of readOnly) {
      expect(
        tool.annotations?.destructiveHint,
        `${tool.name} is read-only but destructiveHint`,
      ).toBe(false)
      expect(
        DESTRUCTIVE_TOOLS.has(tool.name),
        `${tool.name} is read-only but in DESTRUCTIVE_TOOLS`,
      ).toBe(false)
    }
  })
})
