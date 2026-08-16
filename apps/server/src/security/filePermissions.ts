import { chmodSync } from 'node:fs'

export function usePrivateFileCreationMask() {
  process.umask(0o077)
}

export function makeFilePrivate(filePath: string) {
  try {
    chmodSync(filePath, 0o600)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

export function makeDirectoryPrivate(directoryPath: string) {
  chmodSync(directoryPath, 0o700)
}
