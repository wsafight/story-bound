import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { makeDirectoryPrivate, makeFilePrivate } from '../src/security/filePermissions'

const testDirectory = path.resolve(`./data/test-permissions-${process.pid}`)
const testFile = path.join(testDirectory, 'credential.sqlite')

afterAll(() => {
  rmSync(testFile, { force: true })
  rmSync(testDirectory, { recursive: true, force: true })
})

describe('本地数据权限', () => {
  it('把专用目录和凭据文件限制为当前用户可访问', () => {
    mkdirSync(testDirectory, { recursive: true })
    writeFileSync(testFile, 'test')
    makeDirectoryPrivate(testDirectory)
    makeFilePrivate(testFile)
    expect(statSync(testDirectory).mode & 0o777).toBe(0o700)
    expect(statSync(testFile).mode & 0o777).toBe(0o600)
  })
})
