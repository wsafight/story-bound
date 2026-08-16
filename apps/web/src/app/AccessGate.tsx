import { apiContracts } from '@storybound/shared'
import { KeyRound, RefreshCw } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { buttonClass, noticeClass, ui } from '../shared/ui'
import { ApiError, setAccessToken } from './apiClient'
import { apiQueryOptions } from './apiQueries'
import { queryClient } from './queryClient'

export function AccessGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [locked, setLocked] = useState(false)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  async function checkAccess() {
    try {
      await queryClient.fetchQuery(apiQueryOptions(apiContracts.access(), 5_000))
      setAuthorized(true)
      setLocked(false)
      setError('')
    } catch (reason) {
      setAuthorized(false)
      if (reason instanceof ApiError && reason.status === 401) {
        setAccessToken('')
        queryClient.clear()
        setLocked(true)
        if (token) setError('访问令牌不正确')
      } else {
        setError(reason instanceof Error ? reason.message : '无法连接服务端')
      }
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void checkAccess()
  }, [])

  async function unlock(event: FormEvent) {
    event.preventDefault()
    setError('')
    setAccessToken(token.trim())
    queryClient.clear()
    setChecking(true)
    await checkAccess()
  }

  if (checking)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f3f4f6] p-6">
        <p>正在连接 Storybound...</p>
      </div>
    )
  if (authorized) return <>{children}</>

  if (!locked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f4f6] p-6">
        <div className="grid w-full max-w-[380px] gap-[18px] rounded-lg border border-[#d9dde3] bg-white p-7 shadow-[0_12px_32px_rgb(0_0_0/8%)] [&_h1]:m-0 [&_p]:m-0">
          <RefreshCw size={28} />
          <div>
            <h1>无法连接服务端</h1>
            <p className="mt-1.5 text-[#69707a]">{error || 'Storybound 服务暂时不可用。'}</p>
          </div>
          <button
            className={buttonClass('primary')}
            type="button"
            onClick={() => {
              setChecking(true)
              void checkAccess()
            }}
          >
            重试
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f4f6] p-6">
      <form
        className="grid w-full max-w-[380px] gap-[18px] rounded-lg border border-[#d9dde3] bg-white p-7 shadow-[0_12px_32px_rgb(0_0_0/8%)] [&_h1]:m-0 [&_p]:m-0"
        onSubmit={unlock}
      >
        <KeyRound size={28} />
        <div>
          <h1>访问 Storybound</h1>
          <p className="mt-1.5 text-[#69707a]">此服务已启用访问令牌。</p>
        </div>
        <label className="grid gap-[7px]">
          <span className="text-[13px] font-[650]">访问令牌</span>
          <input
            className={ui.field}
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <div className={noticeClass(true)}>{error}</div>}
        <button className={buttonClass('primary')} type="submit">
          解锁
        </button>
      </form>
    </main>
  )
}
