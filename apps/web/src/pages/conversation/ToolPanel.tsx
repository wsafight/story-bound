import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ui } from '../../shared/ui'

interface ToolPanelProps {
  open: boolean
  eyebrow: string
  title: string
  ariaLabel: string
  onClose: () => void
  children: ReactNode
}

export const toolPanelBodyClass = 'min-h-0 overflow-y-auto px-[22px] pt-[18px] pb-[34px]'
export const panelEmptyClass = 'py-10 text-center text-xs text-muted'

export function ToolPanel({ open, eyebrow, title, ariaLabel, onClose, children }: ToolPanelProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-80 flex justify-end">
      <button
        className="absolute inset-0 cursor-default border-0 bg-[#141816]/35"
        type="button"
        onClick={onClose}
        aria-label="关闭面板"
      />
      <aside
        className="relative flex h-full w-full max-w-[460px] flex-col bg-[#f7f8f6] shadow-[-14px_0_40px_rgba(16,22,18,0.16)]"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <header className="flex min-h-[68px] items-center justify-between gap-3.5 border-b border-line bg-surface pr-[18px] pl-[22px]">
          <div className="grid gap-[3px]">
            <span className="text-[9px] text-muted uppercase">{eyebrow}</span>
            <h2 className="m-0 font-serif text-lg leading-[1.2] font-bold">{title}</h2>
          </div>
          <button className={ui.iconButton} type="button" onClick={onClose} title="关闭" aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        {children}
      </aside>
    </div>
  )
}
