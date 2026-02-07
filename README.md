# Claude App

<p align="center">
  <img src="https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/github/actions/workflow/status/k0ngk0ng/claude-app/ci.yml?label=CI" />
  <img src="https://img.shields.io/github/license/k0ngk0ng/claude-app" />
</p>

A desktop GUI for [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), inspired by OpenAI's Codex app. Spawn local `claude` CLI processes and interact with them through a polished graphical interface — chat with streaming responses, integrated terminal, git diff panel, and session history.

<p align="center">
  <strong>macOS</strong> · <strong>Windows</strong> · <strong>Linux</strong>
</p>

---

## ✨ Features

- 💬 **Chat Interface** — Streaming responses with markdown rendering, syntax highlighting, and tool use blocks
- 📂 **Session History** — Browse and resume all Claude Code sessions from `~/.claude/projects/`
- 🖥️ **Integrated Terminal** — Full terminal emulator (xterm.js + node-pty) embedded in the app
- 📝 **Git Diff Panel** — View unstaged/staged changes, stage/unstage files, commit — all inline
- ⌨️ **Keyboard Shortcuts** — `⌘N` new thread, `⌘T` terminal, `⌘D` diff panel, `⌘B` sidebar
- 🎨 **Dark Theme** — Codex-inspired dark UI with orange accent (`#e87b35`)
- 🖥️ **Cross-Platform** — Native experience on macOS (frameless window), Windows (PowerShell + ConPTY), and Linux

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
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- **Git** (for diff panel features)

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
# → Windows: Squirrel installer
# → Linux: .deb + ZIP
```

## 📁 Project Structure

```
claude-app/
├── .github/workflows/
│   ├── ci.yml                  # CI: typecheck + build verify (push/PR)
│   └── release.yml             # Release: build installers (tag v*)
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
│   │   └── platform.ts         # Cross-platform utilities
│   ├── preload/
│   │   └── index.ts            # contextBridge API
│   └── renderer/               # React UI
│       ├── App.tsx             # Root layout
│       ├── stores/appStore.ts  # Zustand global state
│       ├── types/index.ts      # TypeScript types
│       ├── hooks/              # React hooks
│       │   ├── useClaude.ts    # Claude process communication
│       │   ├── useSessions.ts  # Session management
│       │   ├── useGit.ts       # Git operations
│       │   └── useTerminal.ts  # Terminal lifecycle
│       ├── components/
│       │   ├── Sidebar/        # Thread history sidebar
│       │   ├── TopBar/         # Action bar
│       │   ├── Chat/           # Chat view + messages
│       │   ├── InputBar/       # Message input
│       │   ├── Terminal/       # xterm.js terminal
│       │   ├── DiffPanel/      # Git diff viewer
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

## 🔄 CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** | Push to `main` / PR | TypeScript type check + build verify on macOS, Windows, Linux |
| **Release** | Push tag `v*` | Build installers for all platforms → Draft GitHub Release |

### Release a new version

```bash
# Bump version in package.json, then:
git tag v1.0.0
git push origin v1.0.0
# → GitHub Actions builds DMG, Squirrel, .deb
# → Creates a draft release — review and publish
```

## 🔌 How It Works

1. **Claude CLI Integration** — Spawns `claude` with `--input-format stream-json --output-format stream-json` flags, communicating via NDJSON over stdin/stdout
2. **Session Discovery** — Reads session history from `~/.claude/projects/` (sessions-index.json + JSONL files)
3. **Session Resume** — Click any thread to load its history and resume with `--resume <session-id>`
4. **Terminal** — Real PTY via node-pty, rendered with xterm.js, supporting full ANSI/VT sequences
5. **Git** — Wraps git CLI commands for status, diff, stage, unstage, and commit operations

## 🖥️ Platform Notes

| | macOS | Windows | Linux |
|---|---|---|---|
| Window | Frameless (hiddenInset) | Standard frame | Standard frame |
| Terminal | zsh (default) | PowerShell + ConPTY | bash/zsh |
| Installer | DMG + ZIP | Squirrel (.exe) | .deb + ZIP |
| Claude binary | `~/.local/bin/claude` | `%USERPROFILE%\.local\bin\claude.cmd` | `~/.local/bin/claude` |

## 📄 License

MIT

---

<p align="center">
  Built with ❤️ using Claude Code
</p>
