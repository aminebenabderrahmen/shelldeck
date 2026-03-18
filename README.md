# Shelldeck

**Terminals belong next to your code, not hidden in a panel.** Shelldeck turns terminal sessions into editor tabs — create, name, and organize them from a sidebar, right alongside your files.

![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-0.1.0-orange)

---

## Why Shelldeck?

Developers constantly switch between code and terminal — but VS Code keeps them in separate worlds. Your code lives in editor tabs, your terminals hide in a bottom panel. You end up juggling between the two, losing context every time.

**Shelldeck brings terminals into the editor.** Terminal sessions open as tabs, right next to your code files. One workspace, one view, everything centralized — code and shell side by side.

- **Terminals as editor tabs** — Shell sessions live next to your code, not buried in a bottom panel. Split, arrange, and switch between code and terminal like any other file
- **Named sessions** — Give each terminal a real name (`api-server`, `db-migrate`, `tests`) instead of "bash (1)", "bash (2)", "bash (3)"
- **Sidebar overview** — A dedicated panel to see, organize, and manage all your terminals at a glance with live status indicators
- **Persistent sessions** — Terminal metadata survives restarts. Processes reconnect on demand — your workspace stays intact

## Features

### Sidebar Terminal Manager
A dedicated sidebar panel lists all your terminal sessions with:
- Live status indicators (running / stopped)
- Active terminal highlighting
- Inline rename editing
- One-click open, rename, and delete

### Keyboard-First Workflow

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| New terminal | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| Next terminal | `Ctrl+Shift+Down` | `Cmd+Shift+Down` |
| Previous terminal | `Ctrl+Shift+Up` | `Cmd+Shift+Up` |
| Rename terminal | `Ctrl+Shift+R` | `Cmd+Shift+R` |
| Delete terminal | `Ctrl+Shift+W` | `Cmd+Shift+W` |

### Process Lifecycle
1. Create a terminal from the sidebar (+)
2. Name it via inline edit
3. A real PTY shell process spawns (zsh/bash/sh)
4. Close the editor tab — the process keeps running in the background
5. Reopen anytime from the sidebar with full output history

## Installation

### From Source

```bash
git clone https://github.com/aminebenabderrahmen/shelldeck.git
cd shelldeck
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

### Package as .vsix

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension shelldeck-0.1.0.vsix
```

## Architecture

```
extension.ts              → Entry point, wires everything together
terminalManager.ts        → Terminal lifecycle, state persistence
processManager.ts         → PTY process management (node-pty)
terminalWebviewProvider.ts → Sidebar webview UI
```

**Four layers, top-down:**

- **Extension** registers commands and connects managers
- **TerminalManager** owns `ManagedTerminal` objects, persists metadata to workspace state, fires change events
- **ProcessManager** manages `node-pty` PTY processes with output buffering (5000 lines) and pub/sub listeners
- **WebviewProvider** renders the sidebar with inline editing, status indicators, and keyboard navigation

## Requirements

- VS Code 1.85+
- Node.js 18+
- macOS, Linux, or Windows

## Development

```bash
# Watch mode (auto-rebuild on save)
npm run watch

# Type checking only
npm run check-types

# Full build
npm run compile
```

No test framework is configured yet — contributions welcome!

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
