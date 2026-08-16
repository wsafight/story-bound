import { apiContracts, type StoryImportReport } from '@storybound/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Clock3, FileJson, Library, Play, Plus, Search } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { post } from '../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../app/apiQueries'
import { PageHeadingBlock } from '../blocks/PageHeadingBlock'
import { buttonClass, cx, emptyStateClass, noticeClass, ui } from '../shared/ui'
import { StoryImportPanel } from './story-library/StoryImportPanel'

function relativeDate(value: string | null) {
  if (!value) return '尚未开始'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value))
}

export function StoryLibraryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'builtin' | 'mine'>('all')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importReport, setImportReport] = useState<StoryImportReport | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const storiesQuery = useQuery(apiQueryOptions(apiContracts.stories()))
  const stories = storiesQuery.data?.stories || []
  const error = storiesQuery.error instanceof Error ? storiesQuery.error.message : ''

  const filtered = stories.filter((story) => {
    if (scope === 'builtin' && !story.isBuiltin) return false
    if (scope === 'mine' && story.isBuiltin) return false
    const target = `${story.title} ${story.summary} ${story.tags.join(' ')}`.toLowerCase()
    return target.includes(query.trim().toLowerCase())
  })

  function parseImportJson() {
    try {
      return JSON.parse(importText)
    } catch {
      setImportError('JSON 格式不正确')
      return null
    }
  }

  async function inspectImport(event?: FormEvent) {
    event?.preventDefault()
    const parsed = parseImportJson()
    if (!parsed) return null
    setImporting(true)
    setImportError('')
    try {
      const result = await post(apiContracts.importStory(), { package: parsed, dryRun: true })
      setImportReport(result.report)
      return result.report
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : '导入检查失败')
      return null
    } finally {
      setImporting(false)
    }
  }

  async function importStory() {
    const parsed = parseImportJson()
    if (!parsed) return
    setImporting(true)
    setImportError('')
    try {
      const result = await post(apiContracts.importStory(), { package: parsed, dryRun: false })
      setImportReport(result.report)
      await queryClient.invalidateQueries({ queryKey: apiQueryKey(apiContracts.stories()), exact: true })
      if (result.story) {
        await navigate({ to: '/stories/$storyId/edit', params: { storyId: result.story.id } })
      }
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  async function readImportFile(file: File) {
    setImportError('')
    try {
      setImportText(await file.text())
      setImportReport(null)
    } catch {
      setImportError('无法读取文件')
    }
  }

  return (
    <div className={ui.page}>
      <PageHeadingBlock
        eyebrow={
          <>
            <Library size={14} /> Storybound · 入戏
          </>
        }
        title="走进一个故事"
        description="选择故事卡，带着自己的身份进入；每一次都会成为独立存档。"
        actions={
          <div className="flex w-full max-w-[430px] flex-col items-stretch justify-end gap-2.5 sm:flex-row sm:items-center">
            <label className="flex h-11 min-w-0 flex-1 basis-[280px] items-center gap-2.5 rounded-[5px] border border-line bg-surface px-[13px] text-muted shadow-[0_1px_2px_rgba(24,32,29,0.03)] focus-within:border-[#838983] focus-within:shadow-[0_0_0_3px_rgba(50,94,75,0.1)] sm:max-w-[310px] sm:basis-auto">
              <Search size={17} />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none"
                aria-label="搜索故事"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题或标签"
              />
            </label>
            <Link className={buttonClass('primary', 'h-11 shrink-0 whitespace-nowrap px-3.5')} to="/stories/new">
              <Plus size={17} />
              <span>新建故事</span>
            </Link>
            <button
              className={buttonClass('secondary', 'h-11 shrink-0 whitespace-nowrap px-3.5')}
              type="button"
              onClick={() => {
                setShowImport(true)
                setImportError('')
              }}
            >
              <FileJson size={17} />
              <span>导入 JSON</span>
            </button>
          </div>
        }
      />

      {error && <div className={noticeClass(true, 'mb-6')}>{error}</div>}
      <div className="mb-5 flex min-h-12 items-center justify-between gap-[18px] border-y border-line">
        <fieldset className="flex items-center gap-0.5 border-0 p-0">
          <legend className="sr-only">故事范围</legend>
          <button
            className={cx(
              'min-h-8 cursor-pointer rounded border-0 bg-transparent px-3 text-xs text-muted hover:bg-white/70 hover:text-ink',
              scope === 'all' && 'bg-surface font-bold text-green shadow-[inset_0_0_0_1px_var(--color-line)]',
            )}
            type="button"
            onClick={() => setScope('all')}
          >
            全部
          </button>
          <button
            className={cx(
              'min-h-8 cursor-pointer rounded border-0 bg-transparent px-3 text-xs text-muted hover:bg-white/70 hover:text-ink',
              scope === 'builtin' && 'bg-surface font-bold text-green shadow-[inset_0_0_0_1px_var(--color-line)]',
            )}
            type="button"
            onClick={() => setScope('builtin')}
          >
            内置故事
          </button>
          <button
            className={cx(
              'min-h-8 cursor-pointer rounded border-0 bg-transparent px-3 text-xs text-muted hover:bg-white/70 hover:text-ink',
              scope === 'mine' && 'bg-surface font-bold text-green shadow-[inset_0_0_0_1px_var(--color-line)]',
            )}
            type="button"
            onClick={() => setScope('mine')}
          >
            我的故事
          </button>
        </fieldset>
        <span className="shrink-0 text-[11px] whitespace-nowrap text-muted">{filtered.length} 个故事</span>
      </div>
      <section className="grid grid-cols-1 gap-[26px] xl:grid-cols-2" aria-live="polite">
        {filtered.map((story) => (
          <article
            className="group relative grid min-w-0 grid-cols-1 overflow-hidden rounded-[7px] border border-line bg-surface shadow-[0_2px_8px_rgba(25,34,29,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-[#aebbb4] hover:shadow-story sm:min-h-[348px] sm:grid-cols-[minmax(200px,43%)_minmax(0,1fr)]"
            key={story.id}
          >
            <Link
              className="absolute inset-0 z-[1]"
              to={story.status === 'draft' ? '/stories/$storyId/edit' : '/stories/$storyId'}
              params={{ storyId: story.id }}
              aria-label={`打开${story.title}`}
            />
            <div className="relative aspect-[3/2] overflow-hidden bg-[#29312d] sm:min-h-[348px] sm:aspect-auto">
              <img
                className="size-full object-cover transition-transform duration-450 group-hover:scale-[1.025]"
                src={story.cover}
                alt={`${story.title}封面`}
              />
              <span className="absolute top-3.5 left-3.5 grid h-7 min-w-[34px] place-items-center rounded-[3px] bg-[#141816]/80 text-[11px] text-white">
                {String(stories.indexOf(story) + 1).padStart(2, '0')}
              </span>
              {story.status === 'draft' && (
                <span className="absolute top-3.5 right-3.5 rounded-[3px] bg-[#eee4d4] px-2 py-1.5 text-[11px] font-bold text-[#6e5940]">
                  草稿
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col px-6 pt-[27px] pb-[21px]">
              <div className="flex items-start justify-between gap-2.5">
                <h2 className="m-0 font-serif text-[25px] leading-[1.35] font-bold">{story.title}</h2>
                <ArrowUpRight size={20} />
              </div>
              <p className="mt-3.5 mb-[19px] text-[13px] leading-[1.8] text-[#4f5954]">{story.summary}</p>
              <div className="flex flex-wrap gap-[7px]">
                {story.tags.map((tag) => (
                  <span
                    className="rounded-[3px] border border-[#e0e6e2] bg-[#eef2ef] px-2 py-1 text-[10px] text-[#56635d]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <footer className="mt-auto flex flex-wrap justify-between gap-2 border-t border-[#e3e2dc] pt-[18px] text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  {story.isBuiltin ? '内置故事' : story.status === 'draft' ? '草稿' : '我的故事'} ·{' '}
                  {story.conversationCount} 个存档
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock3 size={14} /> {relativeDate(story.lastPlayedAt)}
                </span>
              </footer>
              {story.recentConversationId && (
                <Link
                  className="relative z-[2] mt-3 inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded border border-[#b9cbc1] bg-green-soft text-[11px] font-bold text-green hover:bg-[#dce9e1]"
                  to="/conversations/$conversationId"
                  params={{ conversationId: story.recentConversationId }}
                >
                  <Play size={14} /> 继续最近存档
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>
      {!error && stories.length > 0 && filtered.length === 0 && (
        <div className={emptyStateClass()}>没有匹配的故事。</div>
      )}
      <StoryImportPanel
        open={showImport}
        jsonText={importText}
        report={importReport}
        importing={importing}
        error={importError}
        onJsonTextChange={(value) => {
          setImportText(value)
          setImportReport(null)
        }}
        onFile={(file) => void readImportFile(file)}
        onInspect={(event) => void inspectImport(event)}
        onImport={() => void importStory()}
        onClose={() => setShowImport(false)}
      />
    </div>
  )
}
