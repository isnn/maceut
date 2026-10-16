/**
 * `npm run env:set <KEY>` — set one value in api/.env without it reaching your shell
 * history, your terminal scrollback, or anything that reads either.
 *
 *   npm run env:set HERE_API_KEY          # prompts, input hidden
 *   npm run env:set R2_BUCKET_NAME        # same, for non-secrets too
 *   echo "$VALUE" | npm run env:set -- HERE_API_KEY --stdin
 *
 * Why this exists rather than `sed -i` or an editor:
 *
 *   - `export KEY=value` and `sed -i "s/.../secret/"` both write the secret into
 *     ~/.bash_history in plaintext, where it outlives the terminal.
 *   - Typing into a prompt with echo off keeps it off screen, so it is not in
 *     scrollback and not in a screen share.
 *
 * It rewrites only the one matching line, preserves the rest of the file byte for
 * byte, and prints the value back masked — never in full.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const ENV_PATH = path.resolve(__dirname, '../.env')

/** Keys this script is willing to write, so a typo cannot invent a new one. */
const KNOWN_KEYS = [
  'HERE_API_KEY',
  'HERE_TRAFFIC_FLOW_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_ACCESS_KEY_SECRET',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'R2_ENDPOINT',
  'INTERNAL_EMAILS',
  'JWT_SECRET',
  'FRONTEND_URL',
  'RENDER_BASE_URL',
  'APP_BASE_URL',
] as const

/** Treated as secret: never echoed, and masked in the confirmation. */
const SECRET_KEYS = new Set(['HERE_API_KEY', 'R2_ACCESS_KEY_ID', 'R2_ACCESS_KEY_SECRET', 'JWT_SECRET'])

function mask(value: string): string {
  if (value.length <= 4) return '(too short to mask)'
  return `…${value.slice(-4)} (${value.length} chars)`
}

function usage(): never {
  console.error('Usage: npm run env:set -- <KEY> [--stdin]\n')
  console.error('Keys:')
  for (const k of KNOWN_KEYS) console.error(`  ${k}${SECRET_KEYS.has(k) ? '  (secret)' : ''}`)
  process.exit(1)
}

/** Reads a line with terminal echo off, so nothing appears on screen. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })

    // readline writes each keystroke back by default; muting the output stream is
    // what keeps the value off the screen.
    let muted = false
    const stdout = process.stdout as NodeJS.WriteStream & { _write?: unknown }
    const original = stdout.write.bind(stdout)
    ;(stdout as unknown as { write: typeof original }).write = ((chunk: string, ...rest: unknown[]) => {
      if (muted) return true
      return original(chunk, ...(rest as []))
    }) as typeof original

    rl.question(question, (answer) => {
      ;(stdout as unknown as { write: typeof original }).write = original
      process.stdout.write('\n')
      rl.close()
      resolve(answer)
    })
    muted = true
  })
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
  })
}

/**
 * Replaces the value of `key`, leaving every other byte of the file untouched.
 *
 * Deliberately not a parse-and-rewrite: api/.env is full of comments explaining each
 * setting, and a round-trip through a dotenv parser would throw all of them away.
 */
function setValue(contents: string, key: string, value: string): { next: string; found: boolean } {
  const lines = contents.split('\n')
  let found = false

  const next = lines.map((line) => {
    if (found) return line
    // Only a real assignment at the start of a line — not a mention inside a comment.
    if (!new RegExp(`^${key}=`).test(line)) return line
    found = true
    return `${key}=${value}`
  })

  return { next: next.join('\n'), found }
}

async function main() {
  const args = process.argv.slice(2)
  const key = args[0]
  const fromStdin = args.includes('--stdin')

  if (!key || key.startsWith('-')) usage()
  if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
    console.error(`Unknown key "${key}".\n`)
    usage()
  }

  if (!fs.existsSync(ENV_PATH)) {
    console.error(`api/.env not found. Copy it from api/.env.example first:\n  cp api/.env.example api/.env`)
    process.exit(1)
  }

  const raw = fromStdin ? await readStdin() : await promptHidden(`${key} (input hidden): `)
  const value = raw.trim()

  if (!value) {
    console.error('No value given — nothing changed.')
    process.exit(1)
  }
  if (value.includes('\n')) {
    console.error('Value contains a newline — that would corrupt the file. Nothing changed.')
    process.exit(1)
  }
  // A pasted `KEY=value` is a common slip and would write `KEY=KEY=value`.
  if (value.startsWith(`${key}=`)) {
    console.error(`Value starts with "${key}=" — paste only the value itself. Nothing changed.`)
    process.exit(1)
  }

  const contents = fs.readFileSync(ENV_PATH, 'utf8')
  const { next, found } = setValue(contents, key, value)

  if (!found) {
    console.error(`No "${key}=" line in api/.env. Add it (see api/.env.example), then retry.`)
    process.exit(1)
  }

  fs.writeFileSync(ENV_PATH, next, { mode: 0o600 })

  const shown = SECRET_KEYS.has(key) ? mask(value) : value
  console.log(`${key} set to ${shown}`)
  console.log('\nRestart so the API picks it up, then verify:')
  console.log('  docker compose restart api worker && docker compose exec api npm run env:check')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
