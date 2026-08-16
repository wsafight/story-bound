import type { ChangeEventHandler } from 'react'

interface ToggleProps {
  checked: boolean
  disabled?: boolean
  title?: string
  onChange: ChangeEventHandler<HTMLInputElement>
}

export function Toggle({ checked, disabled, title, onChange }: ToggleProps) {
  return (
    <label className="inline-flex cursor-pointer items-center" title={title}>
      <input className="peer sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="relative h-5 w-[34px] rounded-full bg-[#b9bfbb] transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-[0_1px_4px_rgba(0,0,0,0.2)] after:transition-transform after:content-[''] peer-checked:bg-green peer-checked:after:translate-x-3.5 peer-disabled:cursor-default peer-disabled:opacity-55" />
    </label>
  )
}
