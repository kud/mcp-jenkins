import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ToolFilter } from "./common/index.js"

// The tools this process exposes, given MCP_JENKINS_ALLOW_TOOLS and
// MCP_JENKINS_BLOCK_TOOLS. An allowlist wins over a blocklist. The same set
// answers tools/list and gates tools/call: a tool hidden from the list must
// not stay callable by name.
export const selectTools = (tools: Tool[], filter: ToolFilter): Tool[] => {
  const { allowlist, blocklist } = filter
  if (allowlist) return tools.filter((t) => allowlist.includes(t.name))
  if (blocklist.length) return tools.filter((t) => !blocklist.includes(t.name))
  return tools
}
