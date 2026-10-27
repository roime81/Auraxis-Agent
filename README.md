# BlaBlaBla

![BlaBlaBla interface](https://github.com/user-attachments/assets/cc06146b-51a2-4b2e-a6c4-41aca0a0fb5e)

![CI](https://github.com/yth1120/Auraxis-Agent/actions/workflows/build.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)

BlaBlaBla is a desktop AI agent workbench built with Electron + React 19 + TypeScript. It brings together a unified ReAct execution engine, multi-agent scheduling, Code / Work workflows, MCP connectors, document skills, and local desktop automation in one integrated application.

## Interface Preview

![BlaBlaBla workbench](https://github.com/user-attachments/assets/88f118c2-fc15-4779-8be3-928cb9c04ae8)

## Highlights

- Unified chat experience with multi-agent and Code Mode execution
- 71+ model tools with permission enforcement, approval flow, and sandboxing
- Chat / Work / Code operating modes
- MCP, Lark, DeepSeek Harness, and other connectors
- Word, Excel, PPT, and PDF document skills
- TypeScript and Python SDKs
- Cross-platform support for Windows, macOS, and Linux
- Local accounts, encrypted credentials, memory, and full-text search

## Requirements

- Node.js >= 24
- npm >= 10
- Python >= 3.9 (only required for the Python SDK; on Windows, install via `winget install Python.Python.3.10`)

## Quick Start

```powershell
git clone https://github.com/roime81/Auraxis-Agent.git
cd BlaBlaBla
npm install
Copy-Item .env.example .env
npm run electron:dev
```

Before the first run, fill in `DEEPSEEK_API_KEY` in `.env`, or configure model keys from the app settings page.

## Common Commands

| Command | Purpose |
| --- | --- |
| `npm run electron:dev` | Start the Electron development environment |
| `npm run electron:compile` | Compile the main process |
| `npm run sdk:build` | Build the TypeScript SDK |
| `npm run sdk:test` | Run TypeScript SDK unit tests |
| `npm run test` | Run the project test suite |
| `npm run lint` | Run ESLint |

## Project Structure

- `electron/` — Electron main process, IPC, app shell, and window lifecycle
- `src/` — React renderer and UI app
- `packages/auraxis-sdk/` — TypeScript SDK
- `python/auraxis_sdk/` — Python SDK
- `docs/` — product and architecture documentation

## License

MIT

## Contributing

Contributions are welcome. Please open an issue or start a discussion before making major changes.
