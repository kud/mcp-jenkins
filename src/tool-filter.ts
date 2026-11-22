import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ToolFilter } from "./common/index.js"

// A tool that changes Jenkins: anything not annotated readOnlyHint: true.
// The annotations are the single source of truth for what is a write.
export const isWriteTool = (tool: Tool): boolean =>
  tool.annotations?.readOnlyHint !== true

// The tools this process exposes. The same set answers tools/list and gates
// tools/call: a tool hidden from the list must not stay callable by name.
//
// Read-only by default. Console logs, test reports and job descriptions are
// text an attacker can influence, and the model reads them; one injected
// instruction must not be able to replay a build with a new pipeline script.
// Write tools are exposed only with allowWrite (MCP_JENKINS_ALLOW_WRITE=1) or
// when the allowlist names them explicitly. An allowlist wins over a
// blocklist, and a blocklist never adds anything.
export const selectTools = (tools: Tool[], filter: ToolFilter): Tool[] => {
  const { allowlist, blocklist, allowWrite } = filter
  if (allowlist) return tools.filter((t) => allowlist.includes(t.name))
  return tools.filter(
    (t) => (allowWrite || !isWriteTool(t)) && !blocklist.includes(t.name),
  )
}
