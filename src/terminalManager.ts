import * as vscode from 'vscode';
import { ManagedTerminal, PersistedTerminalEntry } from './types';
import { generateId } from './utils';
import { ProcessManager } from './processManager';

const STORAGE_KEY = 'shelldeck.terminals';

class ShellPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  private unsubscribe?: () => void;

  constructor(
    private processManager: ProcessManager,
    private terminalId: string,
  ) {}

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    // Replay buffered output
    const buffer = this.processManager.getBuffer(this.terminalId);
    for (const chunk of buffer) {
      this.writeEmitter.fire(chunk);
    }

    // Subscribe to new output
    this.unsubscribe = this.processManager.subscribe(this.terminalId, (data) => {
      this.writeEmitter.fire(data);
    });

    // Set initial dimensions
    if (initialDimensions) {
      this.processManager.resize(this.terminalId, initialDimensions.columns, initialDimensions.rows);
    }

    // If process already exited, close the terminal
    if (!this.processManager.has(this.terminalId)) {
      this.closeEmitter.fire(0);
    }
  }

  handleInput(data: string): void {
    this.processManager.write(this.terminalId, data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.processManager.resize(this.terminalId, dimensions.columns, dimensions.rows);
  }

  close(): void {
    // IMPORTANT: we do NOT kill the process here!
    // We only disconnect the Pseudoterminal from the process.
    this.unsubscribe?.();
  }
}

export class TerminalManager implements vscode.Disposable {
  private terminals = new Map<string, ManagedTerminal>();
  private activeTerminalId: string | undefined;
  private counter = 1;
  private disposables: vscode.Disposable[] = [];
  private processManager = new ProcessManager((id) => {
    this._onDidChange.fire(); // refresh sidebar when process dies
  });

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly workspaceState: vscode.Memento) {
    this.restoreFromState();

    this.disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        for (const [id, managed] of this.terminals) {
          if (managed.terminal === closed) {
            managed.terminal = undefined;
            if (this.activeTerminalId === id) {
              this.activeTerminalId = undefined;
            }
            this.persist();
            this._onDidChange.fire();
            break;
          }
        }
      }),

      vscode.window.onDidChangeActiveTerminal((active) => {
        this.activeTerminalId = undefined;
        if (active) {
          for (const [id, managed] of this.terminals) {
            if (managed.terminal === active) {
              this.activeTerminalId = id;
              break;
            }
          }
        }
        this._onDidChange.fire();
      }),

      this._onDidChange,
    );
  }

  createTerminal(name: string): ManagedTerminal {
    const id = generateId();

    // Spawn the real shell process
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const proc = this.processManager.spawn(id, cwd);

    if (!proc) {
      vscode.window.showErrorMessage(`ShellDeck: Failed to start shell process. ${this.processManager.lastError || ''}`);
      const managed: ManagedTerminal = {
        id,
        name,
        terminal: undefined,
        createdAt: Date.now(),
      };
      this.terminals.set(id, managed);
      this.persist();
      this._onDidChange.fire();
      return managed;
    }

    // Create VS Code terminal with our Pseudoterminal
    const pty = new ShellPseudoterminal(this.processManager, id);
    const terminal = vscode.window.createTerminal({
      name,
      pty,
      location: vscode.TerminalLocation.Editor,
    });

    const managed: ManagedTerminal = {
      id,
      name,
      terminal,
      createdAt: Date.now(),
    };

    this.terminals.set(id, managed);
    this.activeTerminalId = id;
    this.persist();
    this._onDidChange.fire();
    terminal.show();
    return managed;
  }

  createPlaceholder(name: string): ManagedTerminal {
    const id = generateId();
    const managed: ManagedTerminal = {
      id,
      name,
      terminal: undefined,
      createdAt: Date.now(),
    };

    this.terminals.set(id, managed);
    this.persist();
    this._onDidChange.fire();
    return managed;
  }

  deleteTerminal(id: string): void {
    const managed = this.terminals.get(id);
    if (managed) {
      managed.terminal?.dispose();
      this.processManager.kill(id);
      this.terminals.delete(id);
      if (this.activeTerminalId === id) {
        this.activeTerminalId = undefined;
      }
      this.persist();
      this._onDidChange.fire();
    }
  }

  renameTerminal(id: string, newName: string): void {
    const managed = this.terminals.get(id);
    if (managed) {
      managed.name = newName;
      if (managed.terminal) {
        managed.terminal.show();
        vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: newName });
      }
      this.persist();
      this._onDidChange.fire();
    }
  }

  openTerminal(id: string): void {
    const managed = this.terminals.get(id);
    if (!managed) return;

    if (!managed.terminal) {
      this.restartTerminal(id);
      return;
    }

    managed.terminal.show();
    this.activeTerminalId = id;
    this._onDidChange.fire();
  }

  restartTerminal(id: string): void {
    const managed = this.terminals.get(id);
    if (!managed) return;

    // If process died, spawn a new one
    if (!this.processManager.has(id)) {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const proc = this.processManager.spawn(id, cwd);
      if (!proc) {
        vscode.window.showErrorMessage(`ShellDeck: Failed to restart shell process. ${this.processManager.lastError || ''}`);
        return;
      }
    }

    // Create a new Pseudoterminal connected to the process (existing or new)
    const pty = new ShellPseudoterminal(this.processManager, id);
    const terminal = vscode.window.createTerminal({
      name: managed.name,
      pty,
      location: vscode.TerminalLocation.Editor,
    });

    managed.terminal = terminal;
    this.activeTerminalId = id;
    this.persist();
    this._onDidChange.fire();
    terminal.show();
  }

  isRunning(id: string): boolean {
    return this.processManager.has(id);
  }

  getNextCounter(): number {
    return this.counter++;
  }

  getTerminals(): ManagedTerminal[] {
    return Array.from(this.terminals.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  getAdjacentTerminalId(direction: 'next' | 'prev'): string | undefined {
    const list = this.getTerminals();
    if (list.length === 0) return undefined;

    const currentIndex = this.activeTerminalId
      ? list.findIndex(t => t.id === this.activeTerminalId)
      : -1;

    if (direction === 'next') {
      return currentIndex === -1 || currentIndex === list.length - 1
        ? list[0].id
        : list[currentIndex + 1].id;
    } else {
      return currentIndex === -1 || currentIndex === 0
        ? list[list.length - 1].id
        : list[currentIndex - 1].id;
    }
  }

  getActiveTerminalId(): string | undefined {
    return this.activeTerminalId;
  }

  getTerminalName(id: string): string | undefined {
    return this.terminals.get(id)?.name;
  }

  isActive(id: string): boolean {
    return this.activeTerminalId === id;
  }

  private persist(): void {
    const entries: PersistedTerminalEntry[] = Array.from(this.terminals.values()).map(t => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
    }));
    this.workspaceState.update(STORAGE_KEY, entries);
  }

  private restoreFromState(): void {
    const entries = this.workspaceState.get<PersistedTerminalEntry[]>(STORAGE_KEY, []);
    let maxSuffix = 0;

    for (const entry of entries) {
      this.terminals.set(entry.id, {
        id: entry.id,
        name: entry.name,
        terminal: undefined,
        createdAt: entry.createdAt,
      });

      const match = entry.name.match(/^Terminal (\d+)$/);
      if (match) {
        maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10));
      }
    }

    if (maxSuffix > 0) {
      this.counter = maxSuffix + 1;
    }

    if (entries.length > 0) {
      this._onDidChange.fire();
    }
  }

  dispose(): void {
    this.processManager.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
