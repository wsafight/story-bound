import { createRootRoute, Link, Navigate, Outlet } from '@tanstack/react-router'
import { BookOpenText, Library, Settings } from 'lucide-react'

function AppFrame() {
  return (
    <div className="min-h-screen">
      <header className="relative z-20 flex h-[60px] items-center justify-between border-b border-ink/15 bg-[#fafcfa]/95 px-4 shadow-[0_1px_0_rgba(255,255,255,0.7)] sm:px-8">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between">
          <Link
            className="flex items-center gap-[11px] font-serif text-base leading-none font-bold"
            to="/"
            aria-label="Storybound 入戏首页"
          >
            <span className="grid size-[34px] place-items-center rounded-[5px] bg-dark text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <BookOpenText size={18} />
            </span>
            <span>
              Storybound <small className="ml-1 text-[11px] font-medium text-muted">入戏</small>
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="主导航">
            <Link
              className="flex h-9 min-w-[38px] items-center justify-center gap-[7px] rounded px-3 text-[13px] text-muted hover:bg-[#f0f3f0] hover:text-ink"
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: 'bg-green-soft font-bold text-green' }}
            >
              <Library size={15} /> <span>故事库</span>
            </Link>
            <Link
              className="flex h-9 min-w-[38px] items-center justify-center gap-[7px] rounded px-3 text-[13px] text-muted hover:bg-[#f0f3f0] hover:text-ink"
              to="/settings"
              activeProps={{ className: 'bg-green-soft font-bold text-green' }}
              aria-label="设置"
              title="设置"
            >
              <Settings size={18} />
            </Link>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createRootRoute({
  component: AppFrame,
  pendingComponent: () => (
    <div className="mx-auto grid min-h-64 w-[calc(100%-2rem)] max-w-[1240px] place-items-center text-muted sm:w-[calc(100%-4rem)]">
      正在打开…
    </div>
  ),
  notFoundComponent: () => <Navigate to="/" replace />,
})
