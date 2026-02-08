# Claude App

<p align="center">
  <img src="https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/github/actions/workflow/status/k0ngk0ng/claude-app/ci.yml?label=CI" />
  <img src="https://img.shields.io/github/v/release/k0ngk0ng/claude-app?label=Release" />
  <img src="https://img.shields.io/github/license/k0ngk0ng/claude-app" />
</p>

A desktop GUI for [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), inspired by OpenAI's Codex app. Spawn local `claude` CLI processes and interact with them through a polished graphical interface — chat with streaming responses, real-time tool activity display, integrated terminal, git diff panel, and full session history.

<p align="center">
  <strong>macOS</strong> · <strong>Windows</strong> · <strong>Linux</strong>
</p>

---

## ✨ Features

- 💬 **Chat Interface** — Streaming responses with markdown rendering, syntax highlighting, and code blocks
- 🔧 **Real-time Tool Activity** — See Claude's tool calls (Read, Write, Bash, etc.) as collapsible cards with input/output details, matching Claude Code CLI style
- 📂 **Session History** — Browse and resume all Claude Code sessions from `~/.claude/projects/`
- 🔄 **Multi-session Support** — Switch between threads without losing streaming state; per-session runtime preservation
- 🖥️ **Integrated Terminal** — Full terminal emulator (xterm.js + node-pty) embedded in the app
- 📝 **Git Integration** — View unstaged/staged changes, stage/unstage files, commit, push, and push tags — all inline
- 🖼️ **Image Paste** — Paste images from clipboard (⌘V / Ctrl+V) to include in conversations
- 📁 **Open in Editor** — Quick-open project in VS Code, Cursor, Zed, Windsurf, or other detected editors
- ⌨️ **Keyboard Shortcuts** — `⌘N` new thread, `⌘T` terminal, `⌘D` diff panel, `⌘B` sidebar
- 📐 **Resizable Panels** — Drag to resize sidebar, terminal, and diff panel
- 🎨 **Dark Theme** — Codex-inspired dark UI with orange accent
- 🖥️ **Cross-Platform** — Native experience on macOS (frameless window), Windows (PowerShell + ConPTY), and Linux
- ⚙️ **Settings** — Model selection, permissions, MCP servers, git config, appearance, keybindings
- 🔍 **Dependency Check** — Auto-detects missing Claude CLI or Git on startup with install hints

## 📸 Screenshots

> *Coming soon — run `npm start` to see it in action!*

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Claude CLI    │ │ Git Manager  │ │ Terminal Manager     │ │
│  │ Process Mgr   │ │ (git ops)    │ │ (node-pty)           │ │
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

- **Node.js** 20+
- **Claude Code CLI** installed and authenticated
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude  # Follow auth prompts
  ```
- **Git** (for diff panel and commit features)
  - macOS: `xcode-select --install`
  - Windows: [git-scm.com](https://git-scm.com/download/win)
  - Linux: `sudo apt install git`

> 💡 The app checks for these dependencies on startup and shows install hints if anything is missing.

### Install & Run

```bash
# Clone the repo
git clone https://github.com/k0ngk0ng/claude-app.git
cd claude-app

# Install dependencies
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

### Download Pre-built Releases

Check the [Releases](https://github.com/k0ngk0ng/claude-app/releases) page for pre-built installers for macOS, Windows, and Linux.

## 📁 Project Structure

```
claude-app/
├── .github/workflows/
│   ├── ci.yml                  # CI: typecheck + build verify (push/PR)
│   └── release.yml             # Release: build installers (tag v*)
├── scripts/
│   └── sync-version.mjs        # Sync version from git tag / commit hash
├── assets/
│   ├── icon.icns               # macOS app icon (Claude)
│   ├── icon.ico                # Windows app icon (Claude)
│   └── icon.png                # Linux / source icon (512×512)
├── forge.config.ts             # Electron Forge config
├── vite.main.config.ts         # Vite config — main process
├── vite.preload.config.ts      # Vite config — preload script
├── vite.renderer.config.ts     # Vite config — React renderer
├── tsconfig.json
├── src/
│   ├── main/                   # Electron Main Process
│   │   ├── index.ts            # App entry, BrowserWindow
│   │   ├── claude-process.ts   # Claude CLI process manager
│   │   ├── session-manager.ts  # Session history reader
│   │   ├── git-manager.ts      # Git operations wrapper
│   │   ├── terminal-manager.ts # node-pty terminal manager
│   │   ├── ipc-handlers.ts     # IPC channel registration
│   │   └── platform.ts         # Cross-platform utilities + dependency check
│   ├── preload/
│   │   └── preload.ts          # contextBridge API
│   └── renderer/               # React UI
│       ├── App.tsx             # Root layout (3-panel)
│       ├── stores/
│       │   ├── appStore.ts     # Zustand global state + per-session runtime
│       │   └── settingsStore.ts # Settings state
│       ├── types/index.ts      # TypeScript types
│       ├── hooks/
│       │   ├── useClaude.ts    # Claude stream-json protocol handler
│       │   ├── useSessions.ts  # Session management + runtime save/restore
│       │   ├── useGit.ts       # Git operations
│       │   ├── useTerminal.ts  # Terminal lifecycle
│       │   └── useResizable.ts # Panel drag-to-resize
│       ├── components/
│       │   ├── Sidebar/        # Thread history sidebar
│       │   ├── TopBar/         # Action bar (Open, Commit, Push)
│       │   ├── Chat/           # Chat view + messages + tool cards
│       │   ├── InputBar/       # Message input + file attach + image paste
│       │   ├── Terminal/       # xterm.js terminal panel
│       │   ├── DiffPanel/      # Git diff viewer
│       │   ├── Settings/       # Settings modal
│       │   └── StatusBar/      # Bottom status bar
│       └── styles/
│           └── globals.css     # Tailwind CSS 4 + custom theme
```

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | Electron 35 (electron-forge + Vite) |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| State Management | Zustand 5 |
| Terminal | xterm.js + node-pty |
| Git Diff | diff2html |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Build | Vite 6 + electron-forge |

## 🔌 How It Works

### Claude CLI Integration

The app communicates with Claude Code CLI via the **stream-json protocol**:

```
App → stdin:  {"type":"user","message":{"role":"user","content":"..."}}
CLI → stdout: {"type":"stream_event","event":{"type":"content_block_delta",...}}
```

Key flags: `--print --input-format stream-json --output-format stream-json --verbose --include-partial-messages`

### Stream Protocol Events

| Event | Description |
|---|---|
| `system` | Session initialization, provides session_id |
| `stream_event/message_start` | New assistant message begins |
| `stream_event/content_block_start` | Text or tool_use block starts |
| `stream_event/content_block_delta` | Streaming text or tool input JSON |
| `stream_event/content_block_stop` | Block complete |
| `assistant` | Complete assistant message snapshot |
| `user` | Tool results (tool_result blocks) |
| `result` | Final result with cost, duration, session_id |

### Session Management

- **Discovery** — Reads from `~/.claude/projects/` (sessions-index.json + JSONL files)
- **Resume** — Spawns CLI with `--resume <session-id>` to continue conversations
- **Runtime Preservation** — Switching threads saves/restores streaming state (tool activities, content)

### Tool Activity Display

Tool calls are shown as collapsible cards matching Claude Code CLI style:
- ▶ Spinner while running → ✓ Checkmark when done
- Tool name + brief input shown inline
- Expand to see full input JSON and output

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
| Terminal | zsh (default) | PowerShell + ConPTY | bash/zsh |
| Installer | DMG + ZIP | Squirrel (.exe) | .deb + ZIP |
| Claude binary | `~/.local/bin/claude` | `%USERPROFILE%\.local\bin\claude.cmd` | `~/.local/bin/claude` |
| App icon | .icns | .ico | .png |

## 📄 License

MIT

---

<p align="center">
  Built with ❤️ using Claude Code
</p>
