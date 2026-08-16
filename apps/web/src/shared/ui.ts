export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const buttonBase =
  'inline-flex min-h-10.5 cursor-pointer items-center justify-center gap-2 rounded-[5px] border border-transparent px-4 text-[13px] font-[650] transition-[background,border-color,box-shadow,opacity] duration-150 disabled:cursor-default disabled:opacity-55'

const buttonVariants = {
  primary: 'bg-red text-white shadow-[0_5px_14px_rgba(155,64,56,0.18)] hover:not-disabled:bg-[#84382f]',
  secondary:
    'border-line bg-surface shadow-[0_1px_2px_rgba(24,32,29,0.03)] hover:not-disabled:border-[#9faca5] hover:not-disabled:bg-[#fbfcfb]',
  glass: 'border-white/30 bg-white/10 text-white backdrop-blur-lg hover:not-disabled:bg-white/16',
} as const

export function buttonClass(variant: keyof typeof buttonVariants = 'secondary', extra?: string) {
  return cx(buttonBase, buttonVariants[variant], extra)
}

export function noticeClass(error = false, extra?: string) {
  return cx(
    'border-l-[3px] border-gold bg-[#f3f0e8] px-[15px] py-[13px] text-[13px] leading-[1.6] text-[#5d5548]',
    error && 'border-red bg-red-soft text-[#703d36]',
    extra,
  )
}

export function emptyStateClass(compact = false, extra?: string) {
  return cx(
    'grid min-h-[250px] place-items-center border border-dashed border-[#bac5be] bg-white/35 text-muted',
    compact && 'min-h-[120px]',
    extra,
  )
}

export const ui = {
  page: 'mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-10 sm:w-[calc(100%-4rem)] sm:py-[62px] sm:pb-[88px]',
  narrowPage: 'max-w-[960px]',
  backLink: 'inline-flex w-fit items-center gap-[7px] text-[13px] text-muted',
  sectionKicker: 'm-0 flex items-center gap-[7px] text-xs font-bold text-red uppercase',
  iconButton:
    'grid size-9 shrink-0 cursor-pointer place-items-center rounded border-0 bg-transparent text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-default disabled:opacity-45',
  field:
    'w-full resize-y rounded border border-line bg-surface px-3 py-[11px] outline-none transition-[border-color,box-shadow] focus:border-green focus:shadow-[0_0_0_3px_rgba(50,94,75,0.09)]',
  fieldLabel: 'text-xs font-semibold text-[#505652]',
} as const
