#!/usr/bin/env node
/**
 * openwork CLI - Downloads binary if needed, then launches the app
 */

const { install, isCached, run, VERSION, getBinaryPath } = require('../lib/binary')

async function main() {
  const args = process.argv.slice(2)

  // Handle --version flag
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`openwork v${VERSION}`)
    process.exit(0)
  }

  // Handle --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
openwork v${VERSION}

A tactical agent interface for deepagentsjs.

Usage:
  openwork              Launch the application
  openwork --version    Show version
  openwork --help       Show this help

The application binary is cached at: ${getBinaryPath()}
`)
    process.exit(0)
  }

  // Install if not cached
  if (!isCached()) {
    console.log('First run - downloading openwork...\n')
    try {
      await install()
      console.log('')
    } catch (err) {
      console.error(`❌ Failed to download openwork: ${err.message}`)
      process.exit(1)
    }
  }

  // Launch the app
  console.log('Launching openwork...')

  try {
    const child = run(args)

    // For Electron apps, we want to exit the Node process after spawning
    // The app will continue running in its own process
    setTimeout(() => {
      process.exit(0)
    }, 1000)
  } catch (err) {
    console.error(`❌ Failed to launch openwork: ${err.message}`)
    process.exit(1)
  }
}

main()
