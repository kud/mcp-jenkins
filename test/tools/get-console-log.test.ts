import { describe, it, expect, vi, beforeEach } from "vitest"
import { getConsoleLog } from "../../src/tools/get-console-log.js"
import { JenkinsClient } from "../../src/lib/jenkins-client.js"

describe("getConsoleLog tool", () => {
  let mockClient: JenkinsClient

  beforeEach(() => {
    mockClient = {
      getConsoleLog: vi.fn(),
    } as any
  })

  it("passes jobName and buildNumber through", async () => {
    vi.mocked(mockClient.getConsoleLog).mockResolvedValue({})
    await getConsoleLog(mockClient, {
      jobName: "acme/api-gateway/PR-123",
      buildNumber: 12,
    })
    expect(mockClient.getConsoleLog).toHaveBeenCalledWith(
      "acme/api-gateway/PR-123",
      12,
      { maxSnippetLength: undefined, start: undefined, maxBytes: undefined, pattern: undefined },
    )
  })

  it("passes the paging and search inputs through", async () => {
    vi.mocked(mockClient.getConsoleLog).mockResolvedValue({})
    await getConsoleLog(mockClient, {
      jobName: "acme/web",
      buildNumber: 4,
      start: 2048,
      maxBytes: 4096,
      pattern: "ERROR.*timeout",
      maxSnippetLength: 80,
    })
    expect(mockClient.getConsoleLog).toHaveBeenCalledWith("acme/web", 4, {
      start: 2048,
      maxBytes: 4096,
      pattern: "ERROR.*timeout",
      maxSnippetLength: 80,
    })
  })

  it("propagates the client's result untouched", async () => {
    const mockResponse = {
      jobName: "acme/web",
      buildNumber: 7,
      logSnippet: "log",
      text: "tail",
      truncated: true,
      totalBytes: 90000,
      returnedBytes: 204800,
    }
    vi.mocked(mockClient.getConsoleLog).mockResolvedValue(mockResponse)

    const result = await getConsoleLog(mockClient, { jobName: "acme/web", buildNumber: 7 })

    expect(result).toBe(mockResponse)
  })

  it("propagates errors from the client", async () => {
    vi.mocked(mockClient.getConsoleLog).mockRejectedValue(
      new Error("Build 3 not found for job acme/web"),
    )

    await expect(
      getConsoleLog(mockClient, { jobName: "acme/web", buildNumber: 3 }),
    ).rejects.toThrow("Build 3 not found")
  })
})
