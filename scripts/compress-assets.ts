import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

// Bun.serve does not compress responses; precompress the client build so
// server.mjs can serve .br/.gz variants (the ACS calling SDK alone is >5MB).
const CLIENT_ROOT = join(process.cwd(), 'dist', 'client')
const COMPRESSIBLE_EXTENSIONS = new Set(['.js', '.css', '.svg', '.json', '.txt', '.html'])
const MIN_BYTES = 1024

let fileCount = 0
let sourceBytes = 0
let brotliBytes = 0

function compressFile(filePath: string) {
  const source = readFileSync(filePath)

  if (source.byteLength < MIN_BYTES) {
    return
  }

  const brotli = brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.byteLength,
    },
  })
  const gzip = gzipSync(source, { level: constants.Z_BEST_COMPRESSION })

  if (brotli.byteLength < source.byteLength) {
    writeFileSync(`${filePath}.br`, brotli)
  }

  if (gzip.byteLength < source.byteLength) {
    writeFileSync(`${filePath}.gz`, gzip)
  }

  fileCount += 1
  sourceBytes += source.byteLength
  brotliBytes += Math.min(brotli.byteLength, source.byteLength)
}

function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      walk(entryPath)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const extension = extname(entry.name)

    if (extension === '.br' || extension === '.gz') {
      continue
    }

    if (COMPRESSIBLE_EXTENSIONS.has(extension)) {
      compressFile(entryPath)
    }
  }
}

if (!existsSync(CLIENT_ROOT)) {
  console.error(`[compress-assets] missing ${CLIENT_ROOT}; run \`bun run build\` first.`)
  process.exit(1)
}

walk(CLIENT_ROOT)

const toMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
console.log(
  `[compress-assets] precompressed ${fileCount} files: ${toMb(sourceBytes)}MB -> ${toMb(brotliBytes)}MB (brotli)`,
)
