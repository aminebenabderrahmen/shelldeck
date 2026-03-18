import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Load node-pty: prefer VS Code's bundled copy (correct Electron ABI + executable spawn-helper),
// fall back to extension's own copy with a chmod fix for spawn-helper permissions.
function loadNodePty(): typeof import('node-pty') {
  const appRoot = vscode.env.appRoot;

  // Try VS Code's bundled node-pty (compiled for its Electron version)
  for (const modulesDir of ['node_modules.asar.unpacked', 'node_modules']) {
    try {
      return require(path.join(appRoot, modulesDir, 'node-pty'));
    } catch {
      // continue
    }
  }

  // Fall back to extension's own node-pty, fixing spawn-helper permissions
  const extensionPty = require('node-pty');
  if (os.platform() !== 'win32') {
    try {
      const helperDir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', `${os.platform()}-${os.arch()}`);
      const helperPath = path.join(helperDir, 'spawn-helper');
      if (fs.existsSync(helperPath)) {
        fs.chmodSync(helperPath, 0o755);
      }
    } catch {
      // best effort
    }
  }
  return extensionPty;
}

const pty = loadNodePty();

const MAX_BUFFER_LINES = 5000;

interface ManagedProcess {
  ptyProcess: any;
  outputBuffer: string[];
  listeners: Set<(data: string) => void>;
}

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private onProcessExit?: (id: string) => void;
  lastError?: string;

  constructor(onProcessExit?: (id: string) => void) {
    this.onProcessExit = onProcessExit;
  }

  spawn(id: string, cwd?: string): ManagedProcess | undefined {
    // Resolve shell: prefer SHELL env, validate it exists, fallback to known paths
    let shell = process.env.SHELL;
    if (!shell || !fs.existsSync(shell)) {
      if (os.platform() === 'win32') {
        shell = 'powershell.exe';
      } else {
        for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
          if (fs.existsSync(candidate)) {
            shell = candidate;
            break;
          }
        }
        if (!shell) { shell = '/bin/sh'; }
      }
    }

    // Validate cwd exists, fall back to homedir
    const resolvedCwd = cwd || os.homedir();
    const validCwd = fs.existsSync(resolvedCwd) ? resolvedCwd : os.homedir();

    let ptyProcess;
    try {
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: validCwd,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ShellDeck] Failed to spawn pty for ${id}: shell=${shell}, cwd=${validCwd}, error=${msg}`);
      this.lastError = `${msg} (shell=${shell})`;
      return undefined;
    }

    const managed: ManagedProcess = {
      ptyProcess,
      outputBuffer: [],
      listeners: new Set(),
    };

    ptyProcess.onData((data: string) => {
      managed.outputBuffer.push(data);
      if (managed.outputBuffer.length > MAX_BUFFER_LINES) {
        managed.outputBuffer.splice(0, managed.outputBuffer.length - MAX_BUFFER_LINES);
      }
      for (const listener of managed.listeners) {
        listener(data);
      }
    });

    ptyProcess.onExit(() => {
      this.processes.delete(id);
      this.onProcessExit?.(id);
    });

    this.processes.set(id, managed);
    return managed;
  }

  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id);
  }

  has(id: string): boolean {
    return this.processes.has(id);
  }

  write(id: string, data: string): void {
    this.processes.get(id)?.ptyProcess.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.processes.get(id)?.ptyProcess.resize(cols, rows);
  }

  subscribe(id: string, listener: (data: string) => void): (() => void) | undefined {
    const managed = this.processes.get(id);
    if (!managed) return undefined;
    managed.listeners.add(listener);
    return () => managed.listeners.delete(listener);
  }

  getBuffer(id: string): string[] {
    return this.processes.get(id)?.outputBuffer ?? [];
  }

  kill(id: string): void {
    const managed = this.processes.get(id);
    if (managed) {
      managed.ptyProcess.kill();
      managed.listeners.clear();
      this.processes.delete(id);
    }
  }

  dispose(): void {
    for (const id of [...this.processes.keys()]) {
      this.kill(id);
    }
  }
}
