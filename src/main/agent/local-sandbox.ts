/**
 * LocalSandbox: Execute shell commands locally on the host machine.
 *
 * Extends FilesystemBackend with command execution capability.
 * Commands run in the workspace directory with configurable timeout and output limits.
 *
 * Security note: This has NO built-in safeguards except for the human-in-the-loop
 * middleware provided by the agent framework. All command approval should be
 * handled via HITL configuration.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { FilesystemBackend, type ExecuteResponse, type SandboxBackendProtocol } from 'deepagents'

/**
 * Options for LocalSandbox configuration.
 */
export interface LocalSandboxOptions {
  /** Root directory for file operations and command execution (default: process.cwd()) */
  rootDir?: string
  /** Enable virtual path mode where "/" maps to rootDir (default: false) */
  virtualMode?: boolean
  /** Maximum file size in MB for file operations (default: 10) */
  maxFileSizeMb?: number
  /** Command timeout in milliseconds (default: 120000 = 2 minutes) */
  timeout?: number
  /** Maximum output bytes before truncation (default: 100000 = ~100KB) */
  maxOutputBytes?: number
  /** Environment variables to pass to commands (default: process.env) */
  env?: Record<string, string>
}

/**
 * LocalSandbox backend with shell command execution.
 *
 * Extends FilesystemBackend to inherit all file operations (ls, read, write,
 * edit, glob, grep) and adds execute() for running shell commands locally.
 *
 * @example
 * ```typescript
 * const sandbox = new LocalSandbox({
 *   rootDir: '/path/to/workspace',
 *   virtualMode: true,
 *   timeout: 60_000,
 * });
 *
 * const result = await sandbox.execute('npm test');
 * console.log(result.output);
 * console.log('Exit code:', result.exitCode);
 * ```
 */
export class LocalSandbox extends FilesystemBackend implements SandboxBackendProtocol {
  /** Unique identifier for this sandbox instance */
  readonly id: string

  private readonly timeout: number
  private readonly maxOutputBytes: number
  private readonly env: Record<string, string>
  private readonly workingDir: string

  constructor(options: LocalSandboxOptions = {}) {
    super({
      rootDir: options.rootDir,
      virtualMode: options.virtualMode,
      maxFileSizeMb: options.maxFileSizeMb
    })

    this.id = `local-sandbox-${randomUUID().slice(0, 8)}`
    this.timeout = options.timeout ?? 120_000 // 2 minutes default
    this.maxOutputBytes = options.maxOutputBytes ?? 100_000 // ~100KB default
    this.env = options.env ?? ({ ...process.env } as Record<string, string>)
    this.workingDir = options.rootDir ?? process.cwd()
  }

  /**
   * Execute a shell command in the workspace directory.
   *
   * @param command - Shell command string to execute
   * @returns ExecuteResponse with combined output, exit code, and truncation flag
   *
   * @example
   * ```typescript
   * const result = await sandbox.execute('echo "Hello World"');
   * // result.output: "Hello World\n"
   * // result.exitCode: 0
   * // result.truncated: false
   * ```
   */
  async execute(command: string): Promise<ExecuteResponse> {
    if (!command || typeof command !== 'string') {
      return {
        output: 'Error: Shell tool expects a non-empty command string.',
        exitCode: 1,
        truncated: false
      }
    }

    return new Promise<ExecuteResponse>((resolve) => {
      const outputParts: string[] = []
      let totalBytes = 0
      let truncated = false
      let resolved = false

      // Determine shell based on platform
      const isWindows = process.platform === 'win32'

      // Convert forward slashes to backslashes in Windows paths for cmd.exe compatibility
      // This handles paths like "C:/Users/..." which need to be "C:\Users\..." for Windows commands
      let processedCommand = command
      if (isWindows) {
        // Match Windows absolute paths (drive letter followed by colon and forward slashes)
        // and convert forward slashes to backslashes within quoted strings and bare paths
        processedCommand = command.replace(
          /([A-Za-z]:)(\/[^"'\s]*|\/[^"]*(?=")|\/[^']*(?='))/g,
          (_match, drive, path) => drive + path.replace(/\//g, '\\')
        )
      }

      // Determine shell and arguments
      let shell: string
      let shellArgs: string[]

      if (isWindows) {
        // Check if command is a PowerShell command - run it directly via powershell.exe
        // to avoid cmd.exe interpreting $ variables (e.g., $_ becomes empty)
        const isPowerShellCommand = /^powershell(?:\.exe)?\s+/i.test(processedCommand)

        if (isPowerShellCommand) {
          // Extract the PowerShell arguments after "powershell" or "powershell.exe"
          const psArgs = processedCommand.replace(/^powershell(?:\.exe)?\s+/i, '')
          shell = 'powershell.exe'
          // Parse the -Command argument if present, otherwise pass as-is
          if (/^-Command\s+/i.test(psArgs)) {
            let cmdContent = psArgs.replace(/^-Command\s+/i, '')
            // Remove surrounding quotes that were meant for cmd.exe parsing
            // PowerShell receives the command directly, so we need to unwrap it
            if ((cmdContent.startsWith('"') && cmdContent.endsWith('"')) ||
                (cmdContent.startsWith("'") && cmdContent.endsWith("'"))) {
              cmdContent = cmdContent.slice(1, -1)
            }
            shellArgs = ['-NoProfile', '-NonInteractive', '-Command', cmdContent]
          } else {
            shellArgs = ['-NoProfile', '-NonInteractive', '-Command', psArgs]
          }
        } else {
          shell = 'cmd.exe'
          shellArgs = ['/c', processedCommand]
        }
      } else {
        shell = '/bin/sh'
        shellArgs = ['-c', command]
      }

      const proc = spawn(shell, shellArgs, {
        cwd: this.workingDir,
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      // Handle timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true
          proc.kill('SIGTERM')
          // Give it a moment, then force kill
          setTimeout(() => proc.kill('SIGKILL'), 1000)
          resolve({
            output: `Error: Command timed out after ${(this.timeout / 1000).toFixed(1)} seconds.`,
            exitCode: null,
            truncated: false
          })
        }
      }, this.timeout)

      // Collect stdout
      proc.stdout.on('data', (data: Buffer) => {
        if (truncated) return

        const chunk = data.toString()
        const newTotal = totalBytes + chunk.length

        if (newTotal > this.maxOutputBytes) {
          // Truncate to fit within limit
          const remaining = this.maxOutputBytes - totalBytes
          if (remaining > 0) {
            outputParts.push(chunk.slice(0, remaining))
          }
          truncated = true
          totalBytes = this.maxOutputBytes
        } else {
          outputParts.push(chunk)
          totalBytes = newTotal
        }
      })

      // Collect stderr with [stderr] prefix per line
      proc.stderr.on('data', (data: Buffer) => {
        if (truncated) return

        const chunk = data.toString()
        // Prefix each line with [stderr]
        const prefixedLines = chunk
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => `[stderr] ${line}`)
          .join('\n')

        if (prefixedLines.length === 0) return

        const withNewline = prefixedLines + (chunk.endsWith('\n') ? '\n' : '')
        const newTotal = totalBytes + withNewline.length

        if (newTotal > this.maxOutputBytes) {
          const remaining = this.maxOutputBytes - totalBytes
          if (remaining > 0) {
            outputParts.push(withNewline.slice(0, remaining))
          }
          truncated = true
          totalBytes = this.maxOutputBytes
        } else {
          outputParts.push(withNewline)
          totalBytes = newTotal
        }
      })

      // Handle process exit
      proc.on('close', (code, signal) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutId)

        let output = outputParts.join('')

        // Add truncation notice if needed
        if (truncated) {
          output += `\n\n... Output truncated at ${this.maxOutputBytes} bytes.`
        }

        // If no output, show placeholder
        if (!output.trim()) {
          output = '<no output>'
        }

        resolve({
          output,
          exitCode: signal ? null : code,
          truncated
        })
      })

      // Handle spawn errors
      proc.on('error', (err) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutId)

        resolve({
          output: `Error: Failed to execute command: ${err.message}`,
          exitCode: 1,
          truncated: false
        })
      })
    })
  }
}
