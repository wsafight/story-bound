import type { ReactNode } from 'react'

interface PageHeadingBlockProps {
  eyebrow: ReactNode
  title: string
  description: string
  actions?: ReactNode
}

export function PageHeadingBlock({ eyebrow, title, description, actions }: PageHeadingBlockProps) {
  return (
    <section className="mb-9 flex flex-col gap-6 sm:mb-[38px] sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div>
        <p className="m-0 flex items-center gap-[7px] text-xs font-bold text-red uppercase">{eyebrow}</p>
        <h1 className="my-2 font-serif text-[clamp(2rem,8vw,2.75rem)] leading-[1.2] font-bold sm:mt-2 sm:mb-[11px]">
          {title}
        </h1>
        <p className="m-0 text-muted">{description}</p>
      </div>
      {actions}
    </section>
  )
}
