import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  downloadArtifactToFile,
  getArtifact,
} from "../../src/tools/get-artifact.js"

const artifact = Buffer.alloc(1024 * 1024 + 1, 0x5a)
const input = { jobName: "job", buildNumber: 1, relativePath: "dist/app.apk" }

describe("artifact downloads", () => {
  let directory: string

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("writes a large artifact to a new absolute path without base64 output", async () => {
    directory = await mkdtemp(join(tmpdir(), "jenkins-mcp-test-"))
    const destinationPath = join(directory, "app.apk")
    const client = {
      downloadArtifact: vi.fn(async () => artifact),
    }

    const result = await downloadArtifactToFile(client as never, {
      ...input,
      destinationPath,
    })

    expect(result).toEqual({
      fileName: "app.apk",
      relativePath: input.relativePath,
      destinationPath,
      size: artifact.length,
    })
    expect("base64" in result).toBe(false)
    expect(await readFile(destinationPath)).toEqual(artifact)
  })

  it("rejects relative paths and does not overwrite files or symlinks", async () => {
    directory = await mkdtemp(join(tmpdir(), "jenkins-mcp-test-"))
    const existing = join(directory, "existing")
    const link = join(directory, "link")
    await writeFile(existing, "original")
    await symlink(existing, link)
    const client = { downloadArtifact: vi.fn(async () => artifact) }

    await expect(
      downloadArtifactToFile(client as never, {
        ...input,
        destinationPath: "relative.apk",
      }),
    ).rejects.toThrow("destinationPath must be an absolute path.")
    await expect(
      downloadArtifactToFile(client as never, {
        ...input,
        destinationPath: existing,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" })
    await expect(
      downloadArtifactToFile(client as never, {
        ...input,
        destinationPath: link,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" })
    expect(await readFile(existing, "utf8")).toBe("original")
  })

  it("preserves the base64 tool and propagates failed downloads", async () => {
    directory = await mkdtemp(join(tmpdir(), "jenkins-mcp-test-"))
    const client = { downloadArtifact: vi.fn(async () => Buffer.from("small")) }
    const result = await getArtifact(client as never, input)
    expect(result.base64).toBe(Buffer.from("small").toString("base64"))

    const failingClient = {
      downloadArtifact: vi.fn(async () => {
        throw new Error("download failed")
      }),
    }
    const destinationPath = join(directory, "app.apk")
    await expect(
      downloadArtifactToFile(failingClient as never, {
        ...input,
        destinationPath,
      }),
    ).rejects.toThrow("download failed")
    await expect(readFile(destinationPath)).rejects.toMatchObject({
      code: "ENOENT",
    })
  })
})
