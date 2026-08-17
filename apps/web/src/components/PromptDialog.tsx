import { Check, X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { buttonClass, cx, noticeClass, ui } from '../shared/ui'

type PromptKind = 'text' | 'json'

interface PromptRequest {
  kind: PromptKind
  title: string
  label: string
  initialValue: string
  confirmLabel: string
  maxLength?: number
  required?: boolean
  resolve: (value: string | Record<string, unknown> | null) => void
}

interface PromptDialogProps {
  request: PromptRequest | null
  value: string
  error: string
  setValue: (value: string) => void
  setError: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}

function focusableElements(root: HTMLDialogElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)
}

function PromptDialog({ request, value, error, setValue, setError, onCancel, onSubmit }: PromptDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (request && !dialog.open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (!request && dialog.open) {
      dialog.close()
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [request])

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const items = focusableElements(dialog)
    if (items.length === 0) return
    const first = items[0]
    const last = items.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(640px,calc(100vw-2rem))] rounded-[6px] border border-line bg-surface p-0 text-ink shadow-[0_24px_72px_rgba(24,32,29,0.24)] backdrop:bg-[#141815]/40"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onKeyDown={onKeyDown}
    >
      {request && (
        <form
          className="grid gap-5 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className={ui.sectionKicker}>输入</p>
              <h2 className="m-0 mt-1 font-serif text-2xl leading-tight font-bold">{request.title}</h2>
            </div>
            <button className={ui.iconButton} type="button" aria-label="关闭" onClick={onCancel}>
              <X size={18} />
            </button>
          </header>
          <label className="grid gap-2">
            <span className={ui.fieldLabel}>{request.label}</span>
            {request.kind === 'json' ? (
              <textarea
                ref={inputRef as RefObject<HTMLTextAreaElement>}
                className={cx(ui.field, 'min-h-[220px] font-mono text-[13px] leading-6')}
                value={value}
                spellCheck={false}
                onChange={(event) => {
                  setValue(event.target.value)
                  setError('')
                }}
              />
            ) : (
              <input
                ref={inputRef as RefObject<HTMLInputElement>}
                className={ui.field}
                value={value}
                maxLength={request.maxLength}
                onChange={(event) => {
                  setValue(event.target.value)
                  setError('')
                }}
              />
            )}
          </label>
          {error && <div className={noticeClass(true)}>{error}</div>}
          <footer className="flex flex-wrap justify-end gap-2">
            <button className={buttonClass('secondary')} type="button" onClick={onCancel}>
              取消
            </button>
            <button className={buttonClass('primary')} type="submit">
              <Check size={16} /> {request.confirmLabel}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  )
}

export function usePromptDialog(): {
  promptText: (input: {
    title: string
    label?: string
    initialValue?: string
    confirmLabel?: string
    maxLength?: number
  }) => Promise<string | null>
  promptJson: (input: {
    title: string
    label?: string
    initialValue?: Record<string, unknown>
  }) => Promise<Record<string, unknown> | null>
  promptDialog: ReactNode
} {
  const [request, setRequest] = useState<PromptRequest | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const requestRef = useRef<PromptRequest | null>(null)

  const open = useCallback((next: Omit<PromptRequest, 'resolve'>) => {
    return new Promise<string | Record<string, unknown> | null>((resolve) => {
      const requestWithResolver = { ...next, resolve }
      requestRef.current = requestWithResolver
      setValue(next.initialValue)
      setError('')
      setRequest(requestWithResolver)
    })
  }, [])

  const settle = useCallback((result: string | Record<string, unknown> | null) => {
    const active = requestRef.current
    requestRef.current = null
    setRequest(null)
    if (active) active.resolve(result)
  }, [])

  const promptText = useCallback(
    async (input: {
      title: string
      label?: string
      initialValue?: string
      confirmLabel?: string
      maxLength?: number
    }) => {
      const result = await open({
        kind: 'text',
        title: input.title,
        label: input.label || input.title,
        initialValue: input.initialValue || '',
        confirmLabel: input.confirmLabel || '确认',
        maxLength: input.maxLength,
        required: true,
      })
      return typeof result === 'string' ? result.trim() : null
    },
    [open],
  )

  const promptJson = useCallback(
    async (input: { title: string; label?: string; initialValue?: Record<string, unknown> }) => {
      const result = await open({
        kind: 'json',
        title: input.title,
        label: input.label || input.title,
        initialValue: JSON.stringify(input.initialValue || {}, null, 2),
        confirmLabel: '应用',
        required: true,
      })
      return result && typeof result === 'object' && !Array.isArray(result) ? result : null
    },
    [open],
  )

  const submit = useCallback(() => {
    if (!requestRef.current) return
    const active = requestRef.current
    const trimmed = value.trim()
    if (active.required && !trimmed) {
      setError('不能为空')
      return
    }
    if (active.maxLength && trimmed.length > active.maxLength) {
      setError(`不能超过 ${active.maxLength} 个字符`)
      return
    }
    if (active.kind === 'json') {
      try {
        const parsed = JSON.parse(trimmed)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('需要 JSON 对象')
        settle(parsed as Record<string, unknown>)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'JSON 格式不正确')
      }
      return
    }
    settle(trimmed)
  }, [settle, value])

  return {
    promptText,
    promptJson,
    promptDialog: (
      <PromptDialog
        request={request}
        value={value}
        error={error}
        setValue={setValue}
        setError={setError}
        onCancel={() => settle(null)}
        onSubmit={submit}
      />
    ),
  }
}
