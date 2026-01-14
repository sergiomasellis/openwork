#!/usr/bin/env node
/**
 * Postinstall script - downloads the binary for the current platform
 */

const { install, isCached, VERSION } = require('./binary')

async function main() {
  // Skip if already cached
  if (isCached()) {
    console.log(`openwork v${VERSION} is already installed.`)
    return
  }

  try {
    await install()
  } catch (err) {
    console.error(`\n⚠️  Failed to install openwork binary: ${err.message}`)
    console.error('You can try running "npx openwork" again to download the binary.\n')
    // Don't fail the install - the CLI will try again
    process.exit(0)
  }
}

main()
