import type { ReactNode } from 'react'

interface SetupSectionHeaderProps {
  number: string
  title: string
  description: string
  children: ReactNode
}

export const setupFormGridClass =
  'grid gap-[17px] sm:ml-14 sm:grid-cols-2 [&>label]:grid [&>label]:min-w-0 [&>label]:gap-[7px] [&>label>span]:text-xs [&>label>span]:font-semibold [&>label>span]:text-[#505652] [&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:border-line [&_input]:bg-surface [&_input]:px-3 [&_input]:py-[11px] [&_input]:outline-none [&_input]:focus:border-green [&_input]:focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)] [&_select]:min-h-10.5 [&_select]:w-full [&_select]:rounded [&_select]:border [&_select]:border-line [&_select]:bg-surface [&_select]:px-3 [&_select]:py-[11px] [&_select]:outline-none [&_select]:focus:border-green [&_select]:focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded [&_textarea]:border [&_textarea]:border-line [&_textarea]:bg-surface [&_textarea]:px-3 [&_textarea]:py-[11px] [&_textarea]:outline-none [&_textarea]:focus:border-green [&_textarea]:focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)]'

export function SetupSection({ number, title, description, children }: SetupSectionHeaderProps) {
  return (
    <section className="border-t border-line py-[38px] pb-12">
      <header className="mb-6 grid grid-cols-[42px_1fr] items-start gap-3.5">
        <span className="font-mono text-xs leading-[1.8] font-semibold text-red">{number}</span>
        <div>
          <h2 className="m-0 font-serif text-[23px] leading-[1.35] font-bold">{title}</h2>
          <p className="mt-1 mb-0 text-[13px] text-muted">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}
