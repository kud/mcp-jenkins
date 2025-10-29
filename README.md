# Jenkins MCP Server

```
     ██╗███████╗███╗   ██╗██╗  ██╗██╗███╗   ██╗███████╗    ███╗   ███╗ ██████╗██████╗
     ██║██╔════╝████╗  ██║██║ ██╔╝██║████╗  ██║██╔════╝    ████╗ ████║██╔════╝██╔══██╗
     ██║█████╗  ██╔██╗ ██║█████╔╝ ██║██╔██╗ ██║███████╗    ██╔████╔██║██║     ██████╔╝
██   ██║██╔══╝  ██║╚██╗██║██╔═██╗ ██║██║╚██╗██║╚════██║    ██║╚██╔╝██║██║     ██╔═══╝
╚█████╔╝███████╗██║ ╚████║██║  ██╗██║██║ ╚████║███████║    ██║ ╚═╝ ██║╚██████╗██║
 ╚════╝ ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝    ╚═╝     ╚═╝ ╚═════╝╚═╝
```

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple?logo=anthropic)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**🚀 The most comprehensive Jenkins MCP server with 25+ tools**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation-guides) • [Tools](#-available-tools) • [Development](#-development)

</div>

---

## 🌟 Features

- **🔐 Flexible Authentication** - Bearer tokens, Basic auth, OAuth support
- **🛠️ 25+ Tools** - Complete Jenkins API coverage
- **⚡ Modern Stack** - TypeScript 5.3+, ES2023, Native Fetch API
- **📦 MCP Protocol** - Native integration with Claude Desktop, Claude Code CLI
- **🔄 Real-time** - Build status, queue management, pipeline stages
- **🧪 Test Results** - View test pass/fail counts and suites
- **🎯 Job Control** - Enable/disable, trigger, stop, replay builds
- **📊 System Monitoring** - Nodes, plugins, version info
- **🔍 Debug Tools** - MCP inspector for interactive testing

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Jenkins API token ([how to get one](#get-your-jenkins-api-token))

### Installation

```bash
# Clone or download this repository
cd mcp-jenkins

# Install dependencies
npm install

# Build
npm run build
```

### Configure with Claude Code CLI (Recommended)

```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://your-jenkins.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_token \
  -- node ~/path/to/mcp-jenkins/dist/index.js
```

✅ Done! Now you can use Jenkins commands in Claude.

---

## 📚 Installation Guides

### 🎯 Claude Code CLI

<details>
<summary><b>Click to expand Claude Code CLI setup</b></summary>

#### 1. Install Claude Code CLI

```bash
# macOS/Linux
curl -fsSL https://cli.claude.com/install.sh | sh

# Or via npm
npm install -g @anthropic-ai/claude-code
```

#### 2. Verify Installation

```bash
claude --version
```

#### 3. Add Jenkins MCP Server

**With Bearer Token:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_BEARER_TOKEN=your_bearer_token \
  -- node $HOME/path/to/mcp-jenkins/dist/index.js
```

**With Basic Auth:**
```bash
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- node $HOME/path/to/mcp-jenkins/dist/index.js
```

#### 4. Verify Setup

```bash
claude mcp list
```

You should see `jenkins` in the list.

#### 5. Test It

```bash
claude
```

Then ask: "List all Jenkins jobs"

</details>

---

### 🖥️ Claude Desktop

<details>
<summary><b>Click to expand Claude Desktop setup</b></summary>

#### 1. Get Your Jenkins API Token

1. Log in to your Jenkins instance
2. Click your username (top-right)
3. Click "Configure"
4. Under "API Token", click "Add new Token"
5. Give it a name and click "Generate"
6. **Copy the token** (you won't see it again!)

#### 2. Open Configuration File

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
notepad %APPDATA%\Claude\claude_desktop_config.json
```

#### 3. Add Configuration

**With Bearer Token:**
```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jenkins/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_BEARER_TOKEN": "your_jenkins_api_token"
      }
    }
  }
}
```

**With Basic Auth:**
```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jenkins/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

#### 4. Restart Claude Desktop

Completely quit (Cmd+Q on Mac) and reopen Claude Desktop.

#### 5. Verify

Ask Claude: "List all Jenkins jobs"

</details>

---

### 📝 VSCode with Claude Dev

<details>
<summary><b>Click to expand VSCode setup</b></summary>

#### 1. Install Claude Dev Extension

1. Open VSCode
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search for "Claude Dev"
4. Click Install

#### 2. Configure MCP Server

1. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
2. Type: "Claude Dev: Open MCP Settings"
3. Add this configuration:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jenkins/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

#### 3. Reload VSCode

Press Cmd+Shift+P / Ctrl+Shift+P → "Reload Window"

#### 4. Test

Open Claude Dev panel and ask: "List all Jenkins jobs"

</details>

---

### 🔧 WebStorm / IntelliJ IDEA

<details>
<summary><b>Click to expand WebStorm/IntelliJ setup</b></summary>

#### 1. Install AI Assistant Plugin

1. Go to Settings → Plugins
2. Search for "AI Assistant" or "Claude"
3. Install and restart

#### 2. Configure External Tools

1. Go to Settings → Tools → External Tools
2. Click "+" to add new tool
3. Configure:
   - **Name:** Jenkins MCP
   - **Program:** `node`
   - **Arguments:** `$ProjectFileDir$/mcp-jenkins/dist/index.js`
   - **Working directory:** `$ProjectFileDir$`

#### 3. Set Environment Variables

In your run configuration or `.env` file:

```bash
JENKINS_URL=https://pipeline.yourcompany.com
JENKINS_USER=your_username
JENKINS_API_TOKEN=your_api_token
```

#### 4. Alternative: Terminal Integration

Add to your shell profile (~/.zshrc or ~/.bashrc):

```bash
export JENKINS_URL="https://pipeline.yourcompany.com"
export JENKINS_USER="your_username"
export JENKINS_API_TOKEN="your_api_token"

alias jenkins-mcp="node /path/to/mcp-jenkins/dist/index.js"
```

Then use Claude CLI from WebStorm terminal:
```bash
claude
```

</details>

---

### 🌐 Cursor

<details>
<summary><b>Click to expand Cursor setup</b></summary>

#### 1. Install Cursor

Download from [cursor.sh](https://cursor.sh)

#### 2. Configure MCP

Open Cursor settings (Cmd+, / Ctrl+,) → Search for "MCP"

Add configuration:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jenkins/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://pipeline.yourcompany.com",
        "JENKINS_USER": "your_username",
        "JENKINS_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

#### 3. Restart Cursor

#### 4. Test

Open Cursor AI and ask: "List all Jenkins jobs"

</details>

---

### 🎨 Codex / GitHub Copilot

<details>
<summary><b>Click to expand Codex/Copilot setup</b></summary>

**Note:** Codex and GitHub Copilot don't natively support MCP protocol. You'll need to use this as a standalone tool via Claude CLI.

#### Option 1: Via Claude CLI

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Configure Jenkins MCP
claude mcp add --transport stdio --scope user jenkins \
  --env JENKINS_URL=https://pipeline.yourcompany.com \
  --env JENKINS_USER=your_username \
  --env JENKINS_API_TOKEN=your_api_token \
  -- node ~/path/to/mcp-jenkins/dist/index.js

# Use in terminal
claude
```

Then ask Jenkins questions!

#### Option 2: HTTP Wrapper (Advanced)

If you need HTTP access for integration:

1. Run the MCP inspector:
```bash
npm run inspect
```

2. This starts a web UI at `http://localhost:5173`
3. You can then build a simple HTTP wrapper around it

</details>

---

## 🛠️ Available Tools

### 📋 Job Operations (5 tools)

| Tool | Description |
|------|-------------|
| `jenkins_list_jobs` | List all Jenkins jobs |
| `jenkins_search_jobs` | Search jobs by name |
| `jenkins_get_job_status` | Get last build status |
| `jenkins_enable_job` | Enable a disabled job |
| `jenkins_disable_job` | Disable a job |
| `jenkins_delete_job` | Delete a job (⚠️ permanent) |
| `jenkins_get_job_config` | Get job XML configuration |

### 🔨 Build Operations (9 tools)

| Tool | Description |
|------|-------------|
| `jenkins_get_build_status` | Get specific build status |
| `jenkins_get_recent_builds` | Get recent builds (last N) |
| `jenkins_trigger_build` | Trigger a new build |
| `jenkins_stop_build` | Stop/abort running build |
| `jenkins_delete_build` | Delete a build |
| `jenkins_replay_build` | Replay a pipeline build |
| `jenkins_get_console_log` | Get build console output |
| `jenkins_get_build_changes` | Get Git commits for build |
| `jenkins_get_pipeline_stages` | Get pipeline stage status |

### 🧪 Testing & Artifacts (3 tools)

| Tool | Description |
|------|-------------|
| `jenkins_get_test_results` | Get test pass/fail counts |
| `jenkins_list_artifacts` | List build artifacts |
| `jenkins_get_artifact` | Download artifact (base64) |

### 📊 Queue Management (2 tools)

| Tool | Description |
|------|-------------|
| `jenkins_get_queue` | View pending builds |
| `jenkins_cancel_queue` | Cancel queued build |

### 🖥️ System Information (5 tools)

| Tool | Description |
|------|-------------|
| `jenkins_list_nodes` | List all agents/nodes |
| `jenkins_get_system_info` | Get Jenkins system info |
| `jenkins_get_version` | Get Jenkins version |
| `jenkins_get_plugins` | List installed plugins |

**Total: 25 Tools** covering ~90% of Jenkins API operations!

---

## 💬 Example Conversations

Once configured, interact with Jenkins naturally:

```
You: "List all my Jenkins jobs"
Claude: *Shows list of all jobs*

You: "What's the status of the 'api-backend' build?"
Claude: *Shows latest build status, duration, result*

You: "Get the test results for build #42 of 'mobile-pipeline'"
Claude: *Shows pass/fail counts, test suites*

You: "Show me the pipeline stages for that failed build"
Claude: *Shows which stage failed and durations*

You: "Trigger a build for 'deploy-staging' with VERSION=2.1.0"
Claude: *Triggers build with parameters*

You: "Stop build #966 of 'mobile-pipeline'"
Claude: *Stops the running build*

You: "Show me the queue"
Claude: *Lists all pending builds*

You: "What version of Jenkins are we running?"
Claude: *Shows Jenkins version*
```

---

## 🧪 Development

### Project Structure

```
mcp-jenkins/
├── src/
│   ├── common/              # Shared utilities
│   │   ├── env.ts           # Environment config
│   │   ├── errors.ts        # Error handling
│   │   ├── http.ts          # HTTP client (native fetch)
│   │   ├── logger.ts        # JSON logging
│   │   └── index.ts         # Exports
│   ├── lib/
│   │   └── jenkins-client.ts  # Jenkins API client
│   ├── tools/               # 25 MCP tool implementations
│   │   ├── get-job-status.ts
│   │   ├── trigger-build.ts
│   │   ├── get-test-results.ts
│   │   ├── stop-build.ts
│   │   └── ... (21 more)
│   └── index.ts             # MCP server entrypoint
├── dist/                    # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run build:watch` | Watch mode - rebuild on changes |
| `npm run dev` | Run in development (tsx) |
| `npm start` | Run compiled server |
| `npm run inspect` | Open MCP inspector |
| `npm run inspect:dev` | Inspector in dev mode (no build) |
| `npm run typecheck` | Type check without building |
| `npm run clean` | Remove build artifacts |

### Development Workflow

```bash
# Terminal 1: Watch mode
npm run build:watch

# Terminal 2: Test with inspector
npm run inspect:dev
```

### Testing with MCP Inspector

```bash
export JENKINS_URL=https://pipeline.yourcompany.com
export JENKINS_USER=your_username
export JENKINS_API_TOKEN=your_token

npm run inspect:dev
```

Opens `http://localhost:5173` - test all tools interactively!

### Adding New Tools

1. Create tool file in `src/tools/`:

```typescript
// src/tools/my-new-tool.ts
import { JenkinsClient } from '../lib/jenkins-client.js';

export interface MyToolInput {
  someParam: string;
}

export const myNewTool = async (client: JenkinsClient, input: MyToolInput) => {
  // Implementation
  return { result: 'success' };
};
```

2. Add method to `JenkinsClient` (src/lib/jenkins-client.ts)

3. Register in `src/index.ts`:
   - Import the tool
   - Add to `tools` array
   - Add to `toolHandlers` map

4. Rebuild:
```bash
npm run build
```

---

## 🔐 Authentication

### Get Your Jenkins API Token

1. Log in to Jenkins
2. Click your **username** (top-right)
3. Click **Configure**
4. Scroll to **API Token** section
5. Click **Add new Token**
6. Name it (e.g., "Claude MCP")
7. Click **Generate**
8. **Copy immediately** (won't be shown again!)

### Bearer Token vs Basic Auth

**Bearer Token (Recommended):**
```bash
--env JENKINS_BEARER_TOKEN=your_token
```

**Basic Auth:**
```bash
--env JENKINS_USER=your_username
--env JENKINS_API_TOKEN=your_token
```

### OAuth Support

This server forwards any `Authorization` header to Jenkins. If your Jenkins uses OAuth (via plugins), just pass the OAuth token as `JENKINS_BEARER_TOKEN`.

---

## 🐛 Troubleshooting

### Server Not Showing in Claude

1. ✅ Check path is absolute
2. ✅ Run `npm install && npm run build`
3. ✅ Verify environment variables
4. ✅ Restart Claude completely

### Authentication Errors

```bash
# Test your credentials
curl -u username:token https://your-jenkins.com/api/json
```

If this returns JSON, your credentials are valid!

### Build Errors

```bash
# Clean rebuild
npm run clean && npm run build
```

### Check Logs

**Claude Desktop logs:**
- macOS: `~/Library/Logs/Claude/mcp*.log`
- Windows: `%APPDATA%\Claude\logs\mcp*.log`

**Claude Code CLI logs:**
```bash
claude mcp get jenkins
```

---

## 🔒 Security Best Practices

- ✅ Use environment variables (never hardcode tokens)
- ✅ Use bearer tokens over basic auth when possible
- ✅ Rotate tokens regularly
- ✅ Use restricted tokens (limit permissions in Jenkins)
- ✅ Never commit tokens to version control
- ✅ Protect config files (`claude_desktop_config.json`)

---

## 📊 Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.3+
- **Target:** ES2023
- **Protocol:** MCP 1.0 (stdio transport)
- **HTTP Client:** Native Fetch API
- **Module System:** ESM

---

## 🤝 Contributing

Contributions welcome! Please ensure:

1. TypeScript strict mode compliance
2. All tools properly typed
3. Build passes: `npm run build`
4. Tools registered in both `tools` array and `toolHandlers`

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol](https://modelcontextprotocol.io/)
- Powered by [Anthropic Claude](https://anthropic.com/claude)
- Jenkins REST API by [Jenkins Project](https://www.jenkins.io/)

---

## 📮 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/yourusername/mcp-jenkins/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/yourusername/mcp-jenkins/discussions)

---

<div align="center">

**Made with ❤️ for the Jenkins & AI community**

⭐ Star this repo if it helped you!

[Back to Top](#jenkins-mcp-server)

</div>
