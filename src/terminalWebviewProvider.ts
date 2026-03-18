import * as vscode from 'vscode';
import { TerminalManager } from './terminalManager';

export class TerminalWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private editingId?: string;
  private pendingShowIds = new Set<string>();

  constructor(
    private readonly manager: TerminalManager,
    private readonly extensionUri: vscode.Uri,
  ) {
    manager.onDidChange(() => this.refresh());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'open':
          vscode.commands.executeCommand('shelldeck.openTerminal', msg.id);
          break;
        case 'delete':
          vscode.commands.executeCommand('shelldeck.deleteTerminal', { id: msg.id });
          break;
        case 'rename':
          this.startEditing(msg.id);
          break;
        case 'confirmRename':
          this.editingId = undefined;
          if (msg.name) {
            this.manager.renameTerminal(msg.id, msg.name);
          }
          if (this.pendingShowIds.has(msg.id)) {
            this.pendingShowIds.delete(msg.id);
            this.manager.openTerminal(msg.id);
          }
          break;
        case 'editDone':
          this.editingId = undefined;
          if (this.pendingShowIds.has(msg.id)) {
            this.pendingShowIds.delete(msg.id);
            this.manager.openTerminal(msg.id);
          }
          break;
      }
    });

    this.refresh();
  }

  startEditing(id: string): void {
    this.editingId = id;
    this.view?.webview.postMessage({ type: 'startEdit', id });
  }

  startEditingNew(id: string): void {
    this.pendingShowIds.add(id);
    this.startEditing(id);
  }

  private refresh(): void {
    if (!this.view) {
      return;
    }

    const terminals = this.manager.getTerminals();
    const items = terminals.map((t) => {
      const isActive = this.manager.isActive(t.id);
      const isRunning = this.pendingShowIds.has(t.id) || this.manager.isRunning(t.id);
      return `
        <div class="item ${isActive ? 'active' : ''} ${!isRunning ? 'stopped' : ''}" data-id="${t.id}">
          <div class="item-content" data-action="open" data-id="${t.id}">
            <span class="indicator ${isActive ? 'on' : ''} ${!isRunning ? 'stopped' : ''}"></span>
            <span class="name" data-id="${t.id}">${this.escapeHtml(t.name)}</span>
            ${isActive ? '<span class="badge">active</span>' : ''}
            ${!isRunning ? '<span class="badge stopped-badge">stopped</span>' : ''}
          </div>
          <div class="actions">
            <button class="action-btn" data-action="rename" data-id="${t.id}" title="Rename">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/></svg>
            </button>
            <button class="action-btn delete" data-action="delete" data-id="${t.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm2 2h1v5H7V6zm2 0h1v5H9V6z"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    const emptyState = terminals.length === 0
      ? '<div class="empty">No terminals yet.<br>Click <strong>+</strong> above to create one.</div>'
      : '';

    this.view.webview.html = this.getHtml(items + emptyState);

    // Re-trigger inline edit after refresh if editing was in progress
    if (this.editingId) {
      const id = this.editingId;
      // Small delay to let the webview initialize its script
      setTimeout(() => {
        this.view?.webview.postMessage({ type: 'startEdit', id });
      }, 50);
    }
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  private getHtml(body: string): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 4px 0;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 12px;
    cursor: pointer;
    border-radius: 4px;
    margin: 2px 4px;
    transition: background-color 0.1s;
  }
  .item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .item.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    height: 100%;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--vscode-foreground);
    opacity: 0.4;
    flex-shrink: 0;
  }
  .indicator.on {
    background: var(--vscode-terminal-ansiGreen);
    border-color: var(--vscode-terminal-ansiGreen);
    opacity: 1;
  }

  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .name-input {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-focusBorder);
    font-family: inherit;
    font-size: inherit;
    font-weight: 500;
    padding: 2px 4px;
    border-radius: 2px;
    outline: none;
    width: 100%;
  }

  .badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: var(--vscode-terminal-ansiGreen);
    color: var(--vscode-editor-background);
    font-weight: 600;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }
  .item:hover .actions { opacity: 1; }

  .action-btn {
    background: none;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .action-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }
  .action-btn.delete:hover {
    color: var(--vscode-errorForeground);
  }

  .item.stopped { opacity: 0.6; }
  .indicator.stopped {
    border-color: var(--vscode-disabledForeground);
    background: none;
    opacity: 0.6;
  }
  .stopped-badge {
    background: var(--vscode-disabledForeground) !important;
  }

  .empty {
    text-align: center;
    padding: 24px 12px;
    opacity: 0.6;
    line-height: 1.6;
  }
</style>
</head>
<body>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentEditingId = null;

    function startInlineEdit(id) {
      if (currentEditingId) {
        cancelEdit(currentEditingId);
      }
      const nameSpan = document.querySelector('.name[data-id="' + id + '"]');
      if (!nameSpan) return;

      currentEditingId = id;
      const currentName = nameSpan.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'name-input';
      input.value = currentName;

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmEdit(id, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit(id);
        }
      });

      input.addEventListener('blur', () => {
        // Confirm on blur
        if (currentEditingId === id) {
          confirmEdit(id, input.value);
        }
      });

      // Prevent click from bubbling to the item (which would trigger open)
      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      nameSpan.replaceWith(input);
      input.focus();
      input.select();
    }

    function confirmEdit(id, name) {
      const trimmed = name.trim();
      currentEditingId = null;
      if (trimmed) {
        vscode.postMessage({ type: 'confirmRename', id, name: trimmed });
      } else {
        vscode.postMessage({ type: 'editDone', id });
      }
    }

    function cancelEdit(id) {
      currentEditingId = null;
      vscode.postMessage({ type: 'editDone', id: id });
    }

    // Listen for messages from the extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'startEdit') {
        startInlineEdit(msg.id);
      }
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'open') {
        vscode.postMessage({ type: 'open', id });
      } else if (action === 'rename') {
        e.stopPropagation();
        startInlineEdit(id);
      } else if (action === 'delete') {
        e.stopPropagation();
        vscode.postMessage({ type: 'delete', id });
      }
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

}
