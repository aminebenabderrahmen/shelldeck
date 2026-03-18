import * as vscode from 'vscode';
import { TerminalManager } from './terminalManager';
import { TerminalWebviewProvider } from './terminalWebviewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const manager = new TerminalManager(context.workspaceState);

  context.subscriptions.push(manager);

  const webviewProvider = new TerminalWebviewProvider(manager, context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shelldeck.terminals', webviewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('shelldeck.newTerminal', () => {
      const defaultName = `Terminal ${manager.getNextCounter()}`;
      const managed = manager.createPlaceholder(defaultName);
      webviewProvider.startEditingNew(managed.id);
    }),

    vscode.commands.registerCommand('shelldeck.openTerminal', (id: string) => {
      manager.openTerminal(id);
    }),

    vscode.commands.registerCommand('shelldeck.renameTerminal', (item?: { id: string }) => {
      const id = item?.id ?? manager.getActiveTerminalId();
      if (id) webviewProvider.startEditing(id);
    }),

    vscode.commands.registerCommand('shelldeck.deleteTerminal', async (item?: { id: string }) => {
      const id = item?.id ?? manager.getActiveTerminalId();
      if (!id) return;
      const name = manager.getTerminalName(id) ?? 'this terminal';
      const choice = await vscode.window.showWarningMessage(
        `Delete "${name}"?`, { modal: true }, 'Delete'
      );
      if (choice === 'Delete') manager.deleteTerminal(id);
    }),

    vscode.commands.registerCommand('shelldeck.nextTerminal', () => {
      const id = manager.getAdjacentTerminalId('next');
      if (id) manager.openTerminal(id);
    }),

    vscode.commands.registerCommand('shelldeck.prevTerminal', () => {
      const id = manager.getAdjacentTerminalId('prev');
      if (id) manager.openTerminal(id);
    }),
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
