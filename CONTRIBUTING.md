# Contributing to Shelldeck

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repo and clone your fork
2. Install dependencies: `npm install`
3. Start watch mode: `npm run watch`
4. Press `F5` in VS Code to launch the Extension Development Host
5. Make your changes and test them in the dev host

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Make sure `npm run compile` passes with no errors
- Write a clear description of what changed and why
- If adding a new feature, update the README

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- VS Code version and OS
- Any error messages from the Output panel (Shelldeck)

## Code Style

- TypeScript strict mode
- No external UI frameworks — the webview uses vanilla HTML/CSS/JS
- Follow existing patterns in the codebase
- Keep it simple — no over-engineering

## Architecture

Before diving in, read the Architecture section in the [README](README.md). The four-layer design (extension → terminalManager → processManager → webviewProvider) is intentional — keep concerns separated.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
