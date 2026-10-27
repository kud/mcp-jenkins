import { describe, it, expect, vi, beforeEach } from "vitest"
import { replayBuild } from "../../src/tools/replay-build.js"
import { JenkinsClient } from "../../src/lib/jenkins-client.js"

describe("replayBuild tool", () => {
  let mockClient: JenkinsClient

  beforeEach(() => {
    mockClient = {
      replayBuild: vi.fn(),
    } as any
  })

  it("should replay a build without a mainScript", async () => {
    const mockResponse = {
      jobName: "my-pipeline",
      buildNumber: 42,
      queueUrl: "https://jenkins.example.com/queue/item/123/",
    }
    vi.mocked(mockClient.replayBuild).mockResolvedValue(mockResponse)

    const result = await replayBuild(mockClient, {
      jobName: "my-pipeline",
      buildNumber: 42,
    })

    expect(mockClient.replayBuild).toHaveBeenCalledWith(
      "my-pipeline",
      42,
      undefined,
    )
    expect(result).toEqual(mockResponse)
  })

  it("should replay a build with a custom mainScript", async () => {
    const mockResponse = {
      jobName: "my-pipeline",
      buildNumber: 7,
      queueUrl: "https://jenkins.example.com/queue/item/456/",
    }
    const script =
      'pipeline { agent any; stages { stage("Test") { steps { echo "hi" } } } }'
    vi.mocked(mockClient.replayBuild).mockResolvedValue(mockResponse)

    const result = await replayBuild(mockClient, {
      jobName: "my-pipeline",
      buildNumber: 7,
      mainScript: script,
    })

    expect(mockClient.replayBuild).toHaveBeenCalledWith(
      "my-pipeline",
      7,
      script,
    )
    expect(result).toEqual(mockResponse)
  })

  it("should return the queueUrl the client reports", async () => {
    vi.mocked(mockClient.replayBuild).mockResolvedValue({
      jobName: "my-pipeline",
      buildNumber: 1,
      queueUrl: "https://jenkins.example.com/queue/item/123/",
    })

    const result = await replayBuild(mockClient, {
      jobName: "my-pipeline",
      buildNumber: 1,
    })

    expect(result.queueUrl).toBe(
      "https://jenkins.example.com/queue/item/123/",
    )
  })

  it("should propagate a missing Location header error from the client", async () => {
    vi.mocked(mockClient.replayBuild).mockRejectedValue(
      new Error(
        "Replay returned HTTP 201 without a queue Location header for https://jenkins.example.com/job/my-pipeline/1/replay/rebuild",
      ),
    )

    await expect(
      replayBuild(mockClient, { jobName: "my-pipeline", buildNumber: 1 }),
    ).rejects.toThrow("without a queue Location header")
  })

  it("should propagate errors from the client", async () => {
    vi.mocked(mockClient.replayBuild).mockRejectedValue(
      new Error("Job not found: missing-pipeline"),
    )

    await expect(
      replayBuild(mockClient, { jobName: "missing-pipeline", buildNumber: 3 }),
    ).rejects.toThrow("Job not found: missing-pipeline")
  })
})
