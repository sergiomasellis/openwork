const { execSync, spawn } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { createWriteStream } = require('fs')

// Package version is injected at publish time
const VERSION = require('../package.json').version

// Checksums are injected at publish time
const CHECKSUMS = require('./checksums.json')

// GitHub repo for releases
const REPO = 'langchain-ai/openwork'

// Cache directory
const CACHE_DIR = path.join(os.homedir(), '.openwork')
const BIN_DIR = path.join(CACHE_DIR, 'bin')

/**
 * Get platform-specific configuration
 */
function getPlatformConfig() {
  const platform = os.platform()
  const arch = os.arch()

  const configs = {
    'darwin-arm64': {
      assetPattern: `openwork-${VERSION}-arm64-mac.zip`,
      extractedName: 'openwork.app',
      binaryPath: 'openwork.app/Contents/MacOS/openwork',
      needsExtract: true
    },
    'darwin-x64': {
      assetPattern: `openwork-${VERSION}-mac.zip`,
      extractedName: 'openwork.app',
      binaryPath: 'openwork.app/Contents/MacOS/openwork',
      needsExtract: true
    },
    'linux-x64': {
      assetPattern: `openwork-${VERSION}-x64.AppImage`,
      extractedName: 'openwork.AppImage',
      binaryPath: 'openwork.AppImage',
      needsExtract: false
    },
    'linux-arm64': {
      assetPattern: `openwork-${VERSION}-arm64.AppImage`,
      extractedName: 'openwork.AppImage',
      binaryPath: 'openwork.AppImage',
      needsExtract: false
    },
    'win32-x64': {
      assetPattern: `openwork-${VERSION}-win-x64.zip`,
      extractedName: 'openwork-win',
      binaryPath: 'openwork-win/openwork.exe',
      needsExtract: true
    }
  }

  const key = `${platform}-${arch}`
  const config = configs[key]

  if (!config) {
    throw new Error(`Unsupported platform: ${platform}-${arch}`)
  }

  return { ...config, platform, arch, key }
}

/**
 * Get the versioned binary directory
 */
function getVersionedBinDir() {
  return path.join(BIN_DIR, VERSION)
}

/**
 * Check if binary is already cached
 */
function isCached() {
  const config = getPlatformConfig()
  const binaryPath = path.join(getVersionedBinDir(), config.binaryPath)
  return fs.existsSync(binaryPath)
}

/**
 * Get the path to the cached binary
 */
function getBinaryPath() {
  const config = getPlatformConfig()
  return path.join(getVersionedBinDir(), config.binaryPath)
}

/**
 * Calculate SHA256 checksum of a file
 */
function calculateChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(fileBuffer).digest('hex')
}

/**
 * Verify file checksum
 */
function verifyChecksum(filePath, filename) {
  const expectedChecksum = CHECKSUMS.files[filename]

  if (!expectedChecksum) {
    console.warn(`⚠️  No checksum found for ${filename}, skipping verification`)
    return true
  }

  const actualChecksum = calculateChecksum(filePath)

  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Checksum verification failed for ${filename}!\n` +
      `Expected: ${expectedChecksum}\n` +
      `Actual:   ${actualChecksum}\n` +
      `The downloaded file may be corrupted or tampered with.`
    )
  }

  console.log(`✓ Checksum verified for ${filename}`)
  return true
}

/**
 * Download a file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)

    const request = (urlString) => {
      https.get(urlString, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`))
          return
        }

        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      }).on('error', (err) => {
        fs.unlink(destPath, () => {})
        reject(err)
      })
    }

    request(url)
  })
}

/**
 * Extract a zip file
 */
async function extractZip(zipPath, destDir) {
  const platform = os.platform()

  if (platform === 'win32') {
    // Use PowerShell on Windows
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'inherit'
    })
  } else {
    // Use unzip on macOS/Linux
    execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`, {
      stdio: 'inherit'
    })
  }
}

/**
 * Download and install the binary
 */
async function install() {
  const config = getPlatformConfig()
  const versionedBinDir = getVersionedBinDir()

  console.log(`Installing openwork v${VERSION} for ${config.key}...`)

  // Create directories
  fs.mkdirSync(versionedBinDir, { recursive: true })

  // Build download URL
  const assetUrl = `https://github.com/${REPO}/releases/download/v${VERSION}/${config.assetPattern}`
  const downloadPath = path.join(versionedBinDir, config.assetPattern)

  console.log(`Downloading from ${assetUrl}...`)

  try {
    await downloadFile(assetUrl, downloadPath)
  } catch (err) {
    throw new Error(`Failed to download binary: ${err.message}\nURL: ${assetUrl}`)
  }

  // Verify checksum
  console.log('Verifying checksum...')
  verifyChecksum(downloadPath, config.assetPattern)

  // Extract if needed
  if (config.needsExtract) {
    console.log('Extracting...')
    await extractZip(downloadPath, versionedBinDir)
    // Clean up zip
    fs.unlinkSync(downloadPath)
  } else {
    // Rename to standard name
    const finalPath = path.join(versionedBinDir, config.extractedName)
    fs.renameSync(downloadPath, finalPath)
  }

  // Make executable on Unix
  if (os.platform() !== 'win32') {
    const binaryPath = getBinaryPath()
    fs.chmodSync(binaryPath, 0o755)
  }

  console.log(`✅ Installed openwork v${VERSION}`)
}

/**
 * Run the binary with given arguments
 */
function run(args = []) {
  const binaryPath = getBinaryPath()

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at ${binaryPath}. Run 'npx openwork' to install.`)
  }

  // Spawn the process
  const child = spawn(binaryPath, args, {
    stdio: 'inherit',
    detached: os.platform() !== 'win32'
  })

  // On Unix, detach the child so it keeps running after npm exits
  if (os.platform() !== 'win32') {
    child.unref()
  }

  return child
}

module.exports = {
  VERSION,
  CACHE_DIR,
  getPlatformConfig,
  isCached,
  getBinaryPath,
  install,
  run
}
