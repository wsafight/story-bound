import { useEffect, useState } from 'react'

interface JsonFieldProps {
  label: string
  value: unknown
  rows?: number
  onValidChange: (value: Record<string, unknown>) => void
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

export function JsonField({ label, value, rows = 5, onValidChange }: JsonFieldProps) {
  const [text, setText] = useState(formatJson(value))
  const [error, setError] = useState('')

  useEffect(() => {
    setText(formatJson(value))
    setError('')
  }, [value])

  function commit(nextText: string) {
    setText(nextText)
    try {
      const parsed = JSON.parse(nextText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('需要 JSON 对象')
      setError('')
      onValidChange(parsed as Record<string, unknown>)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 格式不正确')
    }
  }

  return (
    <label className="sm:col-span-2">
      <span>{label}</span>
      <textarea rows={rows} value={text} onChange={(event) => commit(event.target.value)} />
      {error && <small className="text-[10px] leading-[1.5] text-red">{error}</small>}
    </label>
  )
}
