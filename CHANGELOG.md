# Changelog

All notable changes to this project are documented here.

---

## [2.3.0] — 2026-09-10

### ✨ Features

- The request deadline is now configurable via the `MCP_JENKINS_TIMEOUT_MS` env var or `--timeout-ms` CLI flag, applying to every configured Jenkins instance (it isn't split per-instance the way credentials are). Default stays 10,000ms, so existing installs see no change. A non-positive or non-integer value is rejected at startup with a clear error instead of silently falling back. The deadline now reaches every request through a single `JenkinsClient.req()` helper — including the crumb fetch and `jenkins_get_version`, which previously had no timeout at all and could hang indefinitely ([#873594f](https://github.com/kud/mcp-jenkins/commit/873594f)).

### 🐛 Bug Fixes

- Fixed `MCP error -32603: Jenkins request timed out` on `jenkins_list_artifacts`, `jenkins_get_build_status`, `jenkins_get_recent_builds`, and `jenkins_get_job_status`, reported in [#18](https://github.com/kud/mcp-jenkins/issues/18) against Jenkins 2.462.2. The report suspected a version incompatibility, but nothing in the server branches on Jenkins version — the error had one source, the server's own hardcoded 10-second deadline, which the new `MCP_JENKINS_TIMEOUT_MS`/`--timeout-ms` setting above now removes as a hard limit. (With no 2.462.2 instance to test against, the version-specific detail in the report was never independently reproduced; the diagnosis comes from the code, and the fix removes the ceiling that made the failure inevitable on any sufficiently slow or busy instance, regardless of version.) ([#873594f](https://github.com/kud/mcp-jenkins/commit/873594f))
- `jenkins_get_recent_builds` now asks Jenkins to slice the build list server-side with a `tree` filter and range suffix, instead of fetching every build a job has ever run (`?depth=1`) and discarding all but the requested `limit` client-side. `jenkins_get_build_status` and `jenkins_get_job_status` now request only the six fields their normalisers actually read rather than the full build record — no change to either tool's output shape. (`jenkins_list_artifacts` already used a `tree` filter; the configurable deadline above is its fix.) ([#873594f](https://github.com/kud/mcp-jenkins/commit/873594f))

### 📝 Documentation

- Documented the new timeout configuration in the README, `configuration.mdx`, and `troubleshooting.mdx` ([#873594f](https://github.com/kud/mcp-jenkins/commit/873594f))

<details>
<summary>🔧 Internal changes (1 commit)</summary>

- `JenkinsClient.getRecentBuilds()` now validates `limit` itself rather than relying on the tool's JSON schema, since `JenkinsClient` is a public API in its own right ([#873594f](https://github.com/kud/mcp-jenkins/commit/873594f))

</details>

---

## [2.2.0] — 2026-08-11

### ✨ Features

- Nested Jenkins folder support — `jenkins_list_jobs` and `jenkins_search_jobs` can now recurse into sub-folders. Originally proposed by @farhanali67 in [#15](https://github.com/kud/mcp-jenkins/pull/15), landed via [#16](https://github.com/kud/mcp-jenkins/pull/16) ([#64d2007](https://github.com/kud/mcp-jenkins/commit/64d2007), [#f7e63a4](https://github.com/kud/mcp-jenkins/commit/f7e63a4)). Recursion is opt-in via `recursive: true` and defaults to `false` — traversal costs one sequential HTTP request per folder, so a blanket default could take minutes on a large instance; released `main` never recursed, so no existing caller's behaviour changes. Multibranch projects are detected but deliberately not descended into, since one child job per branch would make traversal cost scale with branch count.
- MCP tool annotations — all 38 tools now advertise `readOnlyHint`, `destructiveHint`, and `idempotentHint` ([#e41ee66](https://github.com/kud/mcp-jenkins/commit/e41ee66)), so clients like Claude can skip confirmation prompts on read-only calls while still gating anything that writes or destroys state.

### 🐛 Bug Fixes

- Malformed job names now return `Errors.invalidInput` (HTTP 400) instead of an opaque 500, so bad input is distinguishable from a server fault ([#f7e63a4](https://github.com/kud/mcp-jenkins/commit/f7e63a4)).

### 📝 Documentation

- Docs moved off GitHub Pages to [kud.io/projects](https://kud.io/projects) — README slimmed to a front-page hero, reference docs split into multi-page kud-site format, and the old Pages site/workflow removed ([#3ff03e5](https://github.com/kud/mcp-jenkins/commit/3ff03e5), [#34fa926](https://github.com/kud/mcp-jenkins/commit/34fa926), [#cb01c8d](https://github.com/kud/mcp-jenkins/commit/cb01c8d), [#2a49811](https://github.com/kud/mcp-jenkins/commit/2a49811), [#6c08078](https://github.com/kud/mcp-jenkins/commit/6c08078), [#67f2ccd](https://github.com/kud/mcp-jenkins/commit/67f2ccd)).

<details>
<summary>🔧 Internal changes (5 commits)</summary>

- refactor(tools): extract tool manifest for testability, add annotation tests + CI ([#60d1ef8](https://github.com/kud/mcp-jenkins/commit/60d1ef8))
- fix(release): fix npm OIDC workflow pattern ([#c441b6e](https://github.com/kud/mcp-jenkins/commit/c441b6e))
- docs(claude): add distribution and API surface conventions ([#8b4090c](https://github.com/kud/mcp-jenkins/commit/8b4090c))
- chore: remove obsolete GitHub Pages workflow ([#54daad1](https://github.com/kud/mcp-jenkins/commit/54daad1))
- chore: remove old GitHub Pages site ([#ef2cb23](https://github.com/kud/mcp-jenkins/commit/ef2cb23))

</details>

---

## [2.0.0] — 2026-04-18

### ✨ Features

- Add `jenkins_get_job_parameters` tool to query job parameter definitions ([#5aaad99](https://github.com/kud/mcp-jenkins/commit/5aaad99))

### 🐛 Bug Fixes

- Use `console.error` to prevent stdout pollution in MCP transport ([#d1c04d5](https://github.com/kud/mcp-jenkins/commit/d1c04d5))

### 📝 Documentation

- Add initial documentation site with GitHub Pages deployment ([#e3f80e9](https://github.com/kud/mcp-jenkins/commit/e3f80e9))
- Promote env vars as recommended config approach ([#8bb6a10](https://github.com/kud/mcp-jenkins/commit/8bb6a10))
- Update and simplify hero command ([#c64d54f](https://github.com/kud/mcp-jenkins/commit/c64d54f), [#d9b7adb](https://github.com/kud/mcp-jenkins/commit/d9b7adb))

### 📦 Other

- Rename `MCP_JENKINS_TOOLS` to `MCP_JENKINS_ALLOW_TOOLS` ⚠️ breaking ([#03ec72f](https://github.com/kud/mcp-jenkins/commit/03ec72f))

<details>
<summary>🔧 Internal changes (2 commits)</summary>

- test(logger): add 6 unit tests with stderr regression guard ([#e2cdd48](https://github.com/kud/mcp-jenkins/commit/e2cdd48))
- fix(build): add node types to tsconfig and upgrade dependencies ([#4017180](https://github.com/kud/mcp-jenkins/commit/4017180))

</details>
