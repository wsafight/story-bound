import { Copy, Library, RefreshCcw, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode, useMemo, useState } from 'react'
import { buttonClass, cx, noticeClass, ui } from '../shared/ui'

function createErrorId() {
  const bytes = new Uint32Array(2)
  globalThis.crypto?.getRandomValues?.(bytes)
  const suffix = bytes[0] || bytes[1] ? `${bytes[0].toString(36)}${bytes[1].toString(36)}` : Date.now().toString(36)
  return `ui-${suffix}`
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && 'code' in error && 'message' in error) {
    const code = String(error.code || 'REQUEST_FAILED')
    const message = String(error.message || '请求失败，请稍后重试')
    return `${code}：${message}`
  }
  return '页面渲染或加载时发生异常。错误详情已隐藏，请使用错误 ID 定位。'
}

function requestIdFromError(error: unknown) {
  if (error && typeof error === 'object' && 'requestId' in error && typeof error.requestId === 'string') {
    return error.requestId
  }
  return null
}

interface ErrorFallbackProps {
  error: unknown
  errorId?: string
  title?: string
  description?: string
  reset?: () => void
  compact?: boolean
}

export function ErrorFallback({
  error,
  errorId,
  title = '页面暂时无法显示',
  description = '当前视图遇到渲染异常。你可以重试当前页面，或返回故事库继续操作。',
  reset,
  compact = false,
}: ErrorFallbackProps) {
  const generatedId = useMemo(createErrorId, [])
  const stableErrorId = requestIdFromError(error) || errorId || generatedId
  const [copied, setCopied] = useState(false)

  async function copyErrorId() {
    try {
      await navigator.clipboard?.writeText(stableErrorId)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className={cx(ui.page, compact && 'py-8 sm:py-10')} aria-labelledby={`${stableErrorId}-title`}>
      <div className="mx-auto grid max-w-[680px] gap-5 rounded-[6px] border border-line bg-surface p-6 shadow-[0_12px_36px_rgba(24,32,29,0.08)] sm:p-8">
        <div>
          <p className={ui.sectionKicker}>错误 ID：{stableErrorId}</p>
          <h1 id={`${stableErrorId}-title`} className="my-2 font-serif text-3xl leading-tight font-bold">
            {title}
          </h1>
          <p className="m-0 text-sm leading-6 text-muted">{description}</p>
        </div>
        <div className={noticeClass(true)}>
          {errorMessage(error)}
          <span className="block pt-1 text-xs">界面不会展示堆栈、请求正文或凭据。</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reset && (
            <button className={buttonClass('primary')} type="button" onClick={reset}>
              <RotateCcw size={16} /> 重试视图
            </button>
          )}
          <button className={buttonClass('secondary')} type="button" onClick={() => window.location.reload()}>
            <RefreshCcw size={16} /> 刷新
          </button>
          <a className={buttonClass('secondary')} href="/">
            <Library size={16} /> 故事库
          </a>
          <button className={buttonClass('secondary')} type="button" onClick={copyErrorId}>
            <Copy size={16} /> {copied ? '已复制' : '复制错误 ID'}
          </button>
        </div>
      </div>
    </section>
  )
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  fallbackDescription?: string
}

interface ErrorBoundaryState {
  error: unknown
  errorId: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorId: createErrorId() }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, errorId: createErrorId() }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React render error', {
      errorId: this.state.errorId,
      error,
      componentStack: errorInfo.componentStack,
    })
  }

  reset = () => {
    this.setState({ error: null, errorId: createErrorId() })
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          title={this.props.fallbackTitle}
          description={this.props.fallbackDescription}
          reset={this.reset}
        />
      )
    }
    return this.props.children
  }
}

export function RootRouteErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} />
}

export function ConversationRouteErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="当前存档暂时无法显示"
      description="会话视图遇到渲染或加载异常。重试不会提交新的玩家消息；你也可以返回故事库。"
    />
  )
}
