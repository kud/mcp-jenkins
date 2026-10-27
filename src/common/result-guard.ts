// An MCP client enforces its own per-message limit on what this server sends,
// and a result that goes past it makes the client disconnect and drop every
// tool the server offers. There is no size negotiation in the protocol, so one
// safe ceiling is applied to every serialised tool result. 1 MB sits far below
// the 16 MB some clients cut off at, and leaves room for framing overhead.
export const MAX_TOOL_RESULT_BYTES = 1048576;

const truncationNote = (actualBytes: number): string =>
  `\n[truncated: result was ${actualBytes} bytes, limit is ${MAX_TOOL_RESULT_BYTES}. Narrow the request, for example with start, maxBytes or pattern on jenkins_get_console_log.]`;

// Cutting a UTF-8 string at a byte offset can land inside a multi-byte
// character; walk back to a character boundary so the decoded head is valid
// UTF-8 and never exceeds its byte budget.
const cutUtf8Safe = (buf: Buffer, maxBytes: number): string => {
  let cut = Math.min(maxBytes, buf.length);
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return buf.subarray(0, cut).toString("utf8");
};

// Passes the serialised tool result through untouched while it fits, and
// replaces an oversized one with a head plus a note naming the actual size.
// Pure, so the handler can import it without starting the server.
export const guardToolResultText = (text: string): string => {
  const actualBytes = Buffer.byteLength(text, "utf8");
  if (actualBytes <= MAX_TOOL_RESULT_BYTES) return text;
  const note = truncationNote(actualBytes);
  const buf = Buffer.from(text, "utf8");
  const head = cutUtf8Safe(buf, MAX_TOOL_RESULT_BYTES - Buffer.byteLength(note, "utf8"));
  return head + note;
};
