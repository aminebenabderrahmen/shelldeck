let counter = 0;

export function generateId(): string {
  return `terminal-${Date.now()}-${counter++}`;
}
