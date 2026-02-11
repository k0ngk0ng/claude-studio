# ClaudeStudio

<p align="center">
  <img src="https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/github/actions/workflow/status/k0ngk0ng/claude-studio/ci.yml?label=CI" />
  <img src="https://img.shields.io/github/v/release/k0ngk0ng/claude-studio?label=Release" />
  <img src="https://img.shields.io/github/license/k0ngk0ng/claude-studio" />
</p>

A desktop GUI for [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), inspired by OpenAI's Codex app. Spawn local `claude` CLI processes and interact with them through a polished graphical interface — chat with streaming responses, real-time tool activity display, integrated terminal, git diff panel, and full session history.

<p align="center">
  <strong>macOS</strong> · <strong>Windows</strong> · <strong>Linux</strong>
</p>

---

## ✨ Features

- 💬 **Chat Interface** — Streaming responses with markdown rendering, syntax highlighting, and code blocks
- 🔧 **Real-time Tool Activity** — See Claude's tool calls (Read, Write, Bash, etc.) as collapsible cards with input/output details; subagent (Task) progress with live status updates
- 📂 **Session History** — Browse and resume all Claude Code sessions from `~/.claude/projects/`
- 🔄 **Multi-session Support** — Switch between threads without losing streaming state; per-session runtime preservation
- 🖥️ **Integrated Terminal** — Full terminal emulator (xterm.js + node-pty) embedded in the app
- 📝 **Git Integration** — View unstaged/staged changes, stage/unstage files, commit, push, and push tags — all inline
- 🖼️ **Image Paste** — Paste images from clipboard (⌘V / Ctrl+V) to include in conversations
- 📁 **Open in Editor** — Quick-open project in VS Code, Cursor, Zed, Windsurf, or other detected editors
- ⌨️ **Keyboard Shortcuts** — `⌘N` new thread, `⌘T` terminal, `⌘D` diff panel, `⌘B` sidebar, `⌘,` settings
- 📐 **Resizable Panels** — Drag to resize sidebar, terminal, and diff panel
- 🎨 **Theme Support** — Dark, Light, and System (auto-switch) themes
- 🔗 **Claude Code Config Sync** — Bidirectional sync with `~/.claude/settings.json` — env vars, `includeCoAuthoredBy`, and more
- 🔐 **Permission Modes** — Default, Accept Edits, Plan, Bypass Permissions, Don't Ask
- ⚙️ **Settings** — Claude Code config, permissions, MCP servers, git, appearance, keybindings
- 🔍 **Dependency Check** — Auto-detects missing Claude CLI or Git on startup with install hints
- 🖥️ **Cross-Platform** — Native experience on macOS, Windows, and Linux — install and use, no extra setup needed

## 📸 Screenshots

> *Coming soon — run `npm start` to see it in action!*

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Claude SDK    │ │ Git Manager  │ │ Terminal Manager     │ │
│  │ Agent Query   │ │ (git ops)    │ │ (node-pty)           │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘ │
│         │                │                     │             │
│  ┌──────┴────────────────┴─────────────────────┴───────────┐ │
│  │                    IPC Handlers                          │ │
│  └──────────────────────┬──────────────────────────────────┘ │
│                         │ contextBridge                      │
├─────────────────────────┼────────────────────────────────────┤
│                         │                                    │
│  ┌──────────────────────┴──────────────────────────────────┐ │
│  │                  React Renderer                          │ │
│  │  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐  │ │
│  │  │ Sidebar │ │ Chat View │ │ Terminal │ │ Diff Panel│  │ │
│  │  │         │ │ + Input   │ │ (xterm)  │ │ (diff2html│  │ │
│  │  └─────────┘ └───────────┘ └──────────┘ └───────────┘  │ │
│  │                    Zustand Store                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- **Claude Code CLI** installed and authenticated
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude  # Follow auth prompts
  ```
- **Git** (for diff panel and commit features)
  - macOS: `xcode-select --install`
  - Windows: [git-scm.com](https://git-scm.com/download/win)
  - Linux: `sudo apt install git`

### Download Pre-built Releases

Check the [Releases](https://github.com/k0ngk0ng/claude-studio/releases) page for pre-built installers:

| Platform | Format |
|---|---|
| macOS | `.dmg` (Apple Silicon + Intel) |
| Windows | `.exe` (Squirrel installer) |
| Linux | `.deb` + `.zip` |

> 💡 All dependencies are bundled — install and use, no extra setup needed.

### Build from Source

```bash
# Clone the repo
git clone https://github.com/k0ngk0ng/claude-studio.git
cd claude-studio

# Install dependencies (auto-rebuilds node-pty for Electron)
npm install

# Launch in dev mode
npm start
```

### Build Installers

```bash
# Package the app (no installer)
npm run package

# Build platform-specific installer
npm run make
# → macOS: DMG + ZIP
# → Windows: Squirrel installer (.exe)
# → Linux: .deb + ZIP
```

## ⚙️ Settings

### Claude Code Configuration

The app provides a **Claude Code** settings panel that bidirectionally syncs with `~/.claude/settings.json`:

- **API Configuration** — `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`
- **Model Settings** — `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `CLAUDE_MODEL`
- **Proxy** — `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`
- **Custom Environment Variables** — Add any env var for the Claude process
- **Include Co-Authored-By** — Toggle `includeCoAuthoredBy` in `~/.claude/settings.json`
- **Import / Export** — Import/export settings in `~/.claude/settings.json` compatible format

Changes made in the app are written back to `~/.claude/settings.json`, and vice versa.

### Other Settings

- **General** — Send key, permission mode, notifications, debug mode
- **Permissions** — File read/write, bash, MCP access controls
- **MCP Servers** — Configure Model Context Protocol servers
- **Git** — Auto-stage, diff on commit, auto-push, commit prefix
- **Appearance** — Theme (Dark/Light/System), font size, font family, line numbers
- **Keybindings** — Customize keyboard shortcuts

## 📁 Project Structure

```
claude-studio/
├── .github/workflows/
│   ├── ci.yml                  # CI: typecheck + build verify (push/PR)
│   └── release.yml             # Release: build installers (tag v*)
├── scripts/
│   └── sync-version.mjs        # Sync version from git tag / commit hash
├── assets/
│   ├── icon.icns               # macOS app icon
│   ├── icon.ico                # Windows app icon
│   └── icon.png                # Linux / source icon (512×512)
├── forge.config.ts             # Electron Forge config (packaging, native modules)
├── vite.main.config.ts         # Vite config — main process
├── vite.preload.config.ts      # Vite config — preload script
├── vite.renderer.config.ts     # Vite config — React renderer
├── tsconfig.json
├── src/
│   ├── main/                   # Electron Main Process
│   │   ├── index.ts            # App entry, BrowserWindow, PATH fix
│   │   ├── claude-process.ts   # Claude Agent SDK integration
│   │   ├── session-manager.ts  # Session history reader
│   │   ├── git-manager.ts      # Git operations wrapper
│   │   ├── terminal-manager.ts # node-pty terminal manager
│   │   ├── ipc-handlers.ts     # IPC channel registration
│   │   └── platform.ts         # Cross-platform utilities + Claude config
│   ├── preload/
│   │   └── preload.ts          # contextBridge API
│   └── renderer/               # React UI
│       ├── App.tsx             # Root layout (3-panel) + theme switching
│       ├── stores/
│       │   ├── appStore.ts     # Zustand global state + per-session runtime
│       │   ├── settingsStore.ts # Settings state (localStorage + sync)
│       │   └── debugLogStore.ts # Debug log store
│       ├── types/index.ts      # TypeScript types
│       ├── hooks/
│       │   ├── useClaude.ts    # Claude Agent SDK event handler
│       │   ├── useSessions.ts  # Session management + runtime save/restore
│       │   ├── useGit.ts       # Git operations
│       │   ├── useTerminal.ts  # Terminal lifecycle
│       │   └── useResizable.ts # Panel drag-to-resize
│       ├── components/
│       │   ├── Sidebar/        # Thread history sidebar
│       │   ├── TopBar/         # Action bar (Open, Commit, Push)
│       │   ├── Chat/           # Chat view + messages + tool cards
│       │   ├── InputBar/       # Message input + file attach + image paste
│       │   ├── BottomPanel/    # Terminal + Debug Logs tabs
│       │   ├── DiffPanel/      # Git diff viewer
│       │   ├── Settings/       # Settings (General, Claude Code, Permissions, etc.)
│       │   └── StatusBar/      # Bottom status bar
│       └── styles/
│           └── globals.css     # Tailwind CSS 4 + dark/light theme variables
```

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | Electron 35 (electron-forge + Vite) |
| Claude Integration | @anthropic-ai/claude-agent-sdk |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| State Management | Zustand 5 |
| Terminal | xterm.js + node-pty |
| Git Diff | diff2html |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Build | Vite 6 + electron-forge |

## 🔌 How It Works

### Claude Agent SDK Integration

The app uses the **@anthropic-ai/claude-agent-sdk** to communicate with Claude Code:

- **`query()`** — Starts a streaming conversation with Claude
- **`canUseTool`** callback — Bridges permission requests to the UI (auto-allows in bypass mode)
- **`setPermissionMode()`** — Runtime permission mode changes
- **Subagent events** — Task tool progress is extracted and displayed on tool cards (e.g. `Task (Explore) → Reading package.json`)

### Session Management

- **Discovery** — Reads from `~/.claude/projects/` (sessions-index.json + JSONL files)
- **Resume** — Uses SDK `resume` option to continue conversations
- **Runtime Preservation** — Switching threads saves/restores streaming state (tool activities, content)

### Tool Activity Display

Tool calls are shown as collapsible cards matching Claude Code CLI style:
- ▶ Spinner while running → ✓ Checkmark when done
- Tool name + brief input shown inline (e.g. `Read → src/App.tsx`)
- Subagent tools show type and live progress (e.g. `Task (Explore) → Grep: TODO`)
- Expand to see full input JSON and output

### Packaging

Native modules are handled automatically during packaging:
- **node-pty** — Rebuilt for Electron ABI via `@electron/rebuild`, then copied into the asar (with native files unpacked)
- **claude-agent-sdk** — Copied into the asar with `cli.js` unpacked for child process spawning
- **PATH fix** — macOS Dock-launched apps get full user PATH by sourcing the login shell

## 🔄 CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** | Push to `main` / PR | TypeScript type check + build verify on macOS, Windows, Linux |
| **Release** | Push tag `v*` | Build installers for all platforms → Publish GitHub Release |

### Versioning

App version is automatically synced from git:
- **Tagged commit** (`v1.2.3`) → version `1.2.3`
- **Untagged commit** → version `0.0.0-<commit-hash>`

### Release a new version

```bash
git tag v1.0.0
git push --tags
# → GitHub Actions builds DMG, Squirrel (.exe), .deb for all platforms
# → Creates a GitHub Release with all artifacts
```

## 🖥️ Platform Notes

| | macOS | Windows | Linux |
|---|---|---|---|
| Window | Frameless (hiddenInset) | Standard frame | Standard frame |
| Terminal | zsh (default) | cmd.exe (COMSPEC) | bash/zsh |
| Installer | DMG + ZIP | Squirrel (.exe) | .deb + ZIP |
| Editors | VS Code, Cursor, Zed, Xcode, etc. | VS Code, Cursor (shell: true) | VS Code, Cursor, Zed |
| App icon | .icns | .ico | .png |

## 📄 License

MIT

---

<p align="center">
  Built with ❤️ using Claude Code
</p>
