import type { ReactNode } from 'react'
import { cx, ui } from '../../shared/ui'

interface EditorSectionHeaderProps {
  kicker: string
  title: string
  action?: ReactNode
}

export function EditorSectionHeader({ kicker, title, action }: EditorSectionHeaderProps) {
  return (
    <header className={cx('mb-[30px]', Boolean(action) && 'flex items-end justify-between gap-5')}>
      <div>
        <p className={ui.sectionKicker}>{kicker}</p>
        <h1 className="mt-[7px] mb-0 font-serif text-[clamp(1.6rem,6vw,1.9375rem)] leading-[1.25] font-bold">
          {title}
        </h1>
      </div>
      {action}
    </header>
  )
}

const editorControls =
  '[&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:border-line [&_input]:bg-surface [&_input]:px-[11px] [&_input]:py-2.5 [&_input]:leading-[1.55] [&_input]:outline-none [&_input]:focus:border-green [&_input]:focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded [&_textarea]:border [&_textarea]:border-line [&_textarea]:bg-surface [&_textarea]:px-[11px] [&_textarea]:py-2.5 [&_textarea]:leading-[1.55] [&_textarea]:outline-none [&_textarea]:focus:border-green [&_textarea]:focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)] [&_select]:min-h-10 [&_select]:w-full [&_select]:rounded [&_select]:border [&_select]:border-line [&_select]:bg-surface [&_select]:px-[11px] [&_select]:py-2.5 [&_select]:leading-[1.55] [&_select]:outline-none [&_select]:focus:border-green [&_select]:focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)]'

const editorLabels =
  '[&>label]:grid [&>label]:min-w-0 [&>label]:content-start [&>label]:gap-[7px] [&>label>span]:text-[11px] [&>label>span]:font-bold [&>label>span]:text-[#505652]'

export const editorFieldsClass = cx('grid min-w-0 gap-[15px] sm:grid-cols-2', editorLabels, editorControls)
export const editorSingleFieldsClass = cx('grid max-w-[680px] min-w-0 gap-[15px]', editorLabels, editorControls)
export const editorLongFieldsClass = cx(
  'grid gap-5 border-t border-line pt-[30px] sm:grid-cols-2',
  editorLabels,
  editorControls,
)
export const editorFormGridClass = cx('grid gap-3.5 p-[17px] sm:grid-cols-2', editorLabels, editorControls)
export const editorItemClass = 'rounded-md border border-line bg-surface shadow-[0_2px_8px_rgba(25,34,29,0.04)]'
export const editorItemHeaderClass =
  'grid min-h-[52px] grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-line px-3.5 [&>span:first-child]:font-mono [&>span:first-child]:text-[11px] [&>span:first-child]:leading-none [&>span:first-child]:font-semibold [&>span:first-child]:text-gold [&>strong]:truncate [&>strong]:font-serif [&>strong]:text-sm [&>strong]:leading-[1.2] [&>strong]:font-bold'
