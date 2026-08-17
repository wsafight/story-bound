import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'

const workspaceRoot = path.resolve(import.meta.dir, '..')
const serverEntry = path.join(workspaceRoot, 'apps/server/src/index.ts')
const watchRoots = [path.join(workspaceRoot, 'apps/server/src'), path.join(workspaceRoot, 'packages/shared/src')]
const port = Number(process.env.PORT || 3001)

async function output(args: string[]) {
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'ignore' })
  const text = await new Response(proc.stdout).text()
  return (await proc.exited) === 0 ? text.trim() : ''
}

async function listeningPids() {
  const text = await output(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  return text
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0 && value !== process.pid)
}

async function processInfo(pid: number) {
  const [command, cwdOutput] = await Promise.all([
    output(['ps', '-p', String(pid), '-o', 'command=']),
    output(['lsof', '-a', '-p', String(pid), '-d', 'cwd', '-Fn']),
  ])
  const cwd = cwdOutput
    .split('\n')
    .find((line) => line.startsWith('n'))
    ?.slice(1)
  return { pid, command, cwd: cwd ? path.resolve(cwd) : '' }
}

function isInsideWorkspace(value: string) {
  if (!value) return false
  const relative = path.relative(workspaceRoot, value)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isManagedStoryboundServer(info: Awaited<ReturnType<typeof processInfo>>) {
  if (info.command.includes(serverEntry) || info.command.includes('apps/server/src/index.ts')) return true
  return isInsideWorkspace(info.cwd) && /bun(\s|$)/.test(info.command) && info.command.includes('src/index.ts')
}

function isManagedStoryboundDevProcess(info: Awaited<ReturnType<typeof processInfo>>) {
  if (info.pid === process.pid) return false
  if (info.command.includes(serverEntry)) return true
  if (info.command.includes('scripts/dev-server.ts') && isInsideWorkspace(info.cwd)) return true
  if (info.command.includes('apps/server/src/index.ts') && isInsideWorkspace(info.cwd)) return true
  return isInsideWorkspace(info.cwd) && info.command.includes('bun --watch') && info.command.includes('src/index.ts')
}

async function waitForPortToClear(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await listeningPids()).length === 0) return true
    await Bun.sleep(100)
  }
  return (await listeningPids()).length === 0
}

async function clearPreviousServer() {
  const pids = await listeningPids()
  if (pids.length === 0) return

  const infos = await Promise.all(pids.map(processInfo))
  const managed = infos.filter(isManagedStoryboundServer)
  const unmanaged = infos.filter((info) => !managed.includes(info))
  if (unmanaged.length > 0) {
    for (const info of unmanaged) {
      console.error(`Port ${port} is already used by PID ${info.pid}: ${info.command || 'unknown process'}`)
    }
    process.exit(1)
  }

  console.log(`Stopping previous Storybound server on port ${port}: ${managed.map((info) => info.pid).join(', ')}`)
  for (const info of managed) {
    try {
      process.kill(info.pid, 'SIGTERM')
    } catch {
      // The process may have already exited.
    }
  }
  if (!(await waitForPortToClear(3_000))) {
    console.error(`Port ${port} is still busy after stopping previous Storybound server.`)
    process.exit(1)
  }
}

async function devProcessPids() {
  const text = await output(['pgrep', '-fal', 'dev-server.ts|apps/server/src/index.ts|bun --watch'])
  return text
    .split('\n')
    .map((line) => Number(line.match(/^\d+/)?.[0] || 0))
    .filter((value) => Number.isSafeInteger(value) && value > 0 && value !== process.pid)
}

async function clearPreviousDevProcesses() {
  const infos = await Promise.all((await devProcessPids()).map(processInfo))
  const stale = infos.filter(isManagedStoryboundDevProcess)
  if (stale.length === 0) return
  console.log(`Stopping previous Storybound dev processes: ${stale.map((info) => info.pid).join(', ')}`)
  for (const info of stale) {
    try {
      process.kill(info.pid, 'SIGTERM')
    } catch {
      // The process may have already exited.
    }
  }
  await Bun.sleep(500)
}

let child: Bun.Subprocess | null = null
let stopping = false
let restarting = false
let restartTimer: ReturnType<typeof setTimeout> | null = null
let watchers: FSWatcher[] = []

function startChild() {
  child = Bun.spawn(['bun', serverEntry], {
    cwd: workspaceRoot,
    env: process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const current = child
  current.exited.then((code) => {
    if (child !== current || stopping || restarting) return
    child = null
    closeWatchers()
    process.exit(code)
  })
}

async function stopChild(signal: NodeJS.Signals = 'SIGTERM') {
  const current = child
  if (!current) return
  child = null
  current.kill(signal)
  await Promise.race([
    current.exited,
    Bun.sleep(3_000).then(() => {
      try {
        current.kill('SIGKILL')
      } catch {
        // The process may have already exited.
      }
    }),
  ])
}

function closeWatchers() {
  for (const watcher of watchers) watcher.close()
  watchers = []
}

async function restartServer() {
  if (restarting || stopping) return
  restarting = true
  console.log('Restarting Storybound server...')
  await stopChild()
  await clearPreviousServer()
  startChild()
  restarting = false
}

function scheduleRestart() {
  if (stopping) return
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    void restartServer()
  }, 150)
}

function startWatchers() {
  for (const root of watchRoots) {
    try {
      watchers.push(watch(root, { recursive: true }, scheduleRestart))
    } catch {
      watchers.push(watch(root, scheduleRestart))
    }
  }
}

async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return
  stopping = true
  if (restartTimer) clearTimeout(restartTimer)
  closeWatchers()
  await stopChild(signal)
  process.exit(0)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

await clearPreviousDevProcesses()
await clearPreviousServer()
startWatchers()
startChild()
