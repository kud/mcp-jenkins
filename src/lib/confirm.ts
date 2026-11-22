import { McpError } from "../common/index.js"

// Irreversible tools refuse to run unless the caller passes confirm: true.
// Checked in the tool function, not only in the schema, which binds MCP
// callers only.
export const requireConfirm = (
  input: { confirm?: unknown },
  action: string,
): void => {
  if (input.confirm !== true)
    throw new McpError(
      "CONFIRM_REQUIRED",
      `Set confirm: true to ${action}. This cannot be undone.`,
      400,
    )
}
