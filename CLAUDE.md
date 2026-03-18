# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Shelldeck

A VS Code extension for centralized terminal management via a sidebar webview panel. Users can create, name, open, and manage persistent terminal sessions that survive process death and can be reconnected.

## Build Commands

- `npm run compile` — Type-check and bundle (production build)
- `npm run watch` — esbuild watch mode for development
- `npm run check-types` — TypeScript type checking only
- `vsce package` — Package .vsix for distribution

There are no tests or linting configured.

## Architecture

The extension has four layers that flow top-down:

**extension.ts** → registers commands, wires managers together, handles activation/deactivation.

**terminalManager.ts** → owns the list of `ManagedTerminal` objects and their lifecycle. Creates VS Code terminals backed by `ShellPseudoterminal` (implements `vscode.Pseudoterminal`), which bridges VS Code's terminal API to the process layer. Persists terminal metadata (id, name, createdAt) to workspace state. Fires `onDidChange` events consumed by the webview.

**processManager.ts** → manages `node-pty` PTY processes. Each terminal ID maps to a `ManagedProcess` with a PTY instance, a 5000-line output buffer, and a pub/sub listener set. Handles shell resolution (SHELL env → fallback chain) and CWD validation. Has a two-step node-pty loading strategy: prefers VS Code's bundled copy for ABI compatibility, falls back to the extension's own copy.

**terminalWebviewProvider.ts** → sidebar webview rendering the terminal list. Embedded HTML/CSS/JS using VS Code theme variables. Supports inline rename editing, status indicators (active/running/stopped), and keyboard navigation. Tracks `pendingShowIds` for terminals being created (not yet spawned).

### Terminal Lifecycle

1. Placeholder created (no process) → 2. User confirms name via inline edit → 3. PTY process spawned → 4. Pseudoterminal connects to process output → 5. On process death, terminal persists and can be restarted

### Key Externals

- `node-pty` is external to the esbuild bundle (loaded at runtime)
- `vscode` is external (provided by the host)
- Build target: Node 18, CommonJS, ES2022

## Conventions

- IDs generated via timestamp+counter (`utils.ts`)
- Event-driven: managers emit events, webview subscribes
- All managers follow the `vscode.Disposable` pattern
- Workspace state key: `shelldeck.terminals`
