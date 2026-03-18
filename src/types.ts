import * as vscode from 'vscode';

export interface ManagedTerminal {
  id: string;
  name: string;
  terminal?: vscode.Terminal;
  createdAt: number;
}

export interface PersistedTerminalEntry {
  id: string;
  name: string;
  createdAt: number;
}
