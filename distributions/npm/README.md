# openwork

A tactical agent interface for [deepagentsjs](https://github.com/langchain-ai/deepagentsjs) - an opinionated harness for building deep agents with filesystem capabilities, planning, and subagent delegation.

## Installation

```bash
# Run directly (downloads binary on first run)
npx openwork

# Or install globally
npm install -g openwork
openwork
```

The CLI automatically downloads the correct binary for your platform on first run. Binaries are cached in `~/.openwork/bin/`.

## Supported Platforms

| Platform | Architecture |
|----------|-------------|
| macOS | Apple Silicon (arm64) |
| macOS | Intel (x64) |
| Linux | x64 |
| Linux | arm64 |
| Windows | x64 |

## Features

- **Chat Interface** - Stream conversations with your AI agent in real-time
- **TODO Tracking** - Visual task list showing agent's planning progress
- **Filesystem Browser** - See files the agent reads, writes, and edits
- **Subagent Monitoring** - Track spawned subagents and their status
- **Human-in-the-Loop** - Approve, edit, or reject sensitive tool calls
- **Multi-Model Support** - Use Claude, GPT-4, Gemini, or local models

## Links

- [GitHub Repository](https://github.com/langchain-ai/openwork)
- [Documentation](https://github.com/langchain-ai/openwork#readme)
- [Issues](https://github.com/langchain-ai/openwork/issues)

## License

MIT
