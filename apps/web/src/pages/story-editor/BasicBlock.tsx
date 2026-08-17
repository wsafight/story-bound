import { UploadCloud } from 'lucide-react'
import {
  EditorSectionHeader,
  editorFieldsClass,
  editorLongFieldsClass,
} from '../../components/forms/EditorSectionHeader'
import type { StoryDraft } from './types'

interface BasicBlockProps {
  draft: StoryDraft
  onChange: (draft: StoryDraft) => void
}

function lines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function BasicBlock({ draft, onChange }: BasicBlockProps) {
  return (
    <section>
      <EditorSectionHeader kicker="01 · 基础设定" title="这会是一个怎样的故事？" />
      <div className="grid items-start gap-[30px] pb-9 sm:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="aspect-[3/4] overflow-hidden rounded-[5px] border border-line bg-[#29312d]">
          <img className="size-full object-cover" src={draft.cover || '/covers/rain-terminal.png'} alt="故事封面预览" />
        </div>
        <div className={editorFieldsClass}>
          <label data-story-path="title">
            <span>故事标题</span>
            <input
              value={draft.title}
              maxLength={120}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              required
            />
          </label>
          <label data-story-path="cover">
            <span>封面地址</span>
            <div className="grid grid-cols-[34px_minmax(0,1fr)] items-center rounded border border-line bg-surface text-muted focus-within:border-green focus-within:shadow-[0_0_0_3px_rgba(50,94,75,0.09)] [&>svg]:justify-self-center">
              <UploadCloud size={15} />
              <input
                className="!border-0 !bg-transparent !shadow-none"
                value={draft.cover}
                onChange={(event) => onChange({ ...draft, cover: event.target.value })}
                placeholder="/assets/covers/example.png"
              />
            </div>
          </label>
          <label className="sm:col-span-2" data-story-path="summary">
            <span>一句话简介</span>
            <textarea
              rows={3}
              value={draft.summary}
              onChange={(event) => onChange({ ...draft, summary: event.target.value })}
            />
          </label>
          <label className="sm:col-span-2" data-story-path="description">
            <span>详情页引言</span>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </label>
          <label data-story-path="tags">
            <span>标签（逗号分隔）</span>
            <input
              value={draft.tags.join(', ')}
              onChange={(event) =>
                onChange({
                  ...draft,
                  tags: event.target.value
                    .split(/[,，]/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        </div>
      </div>
      <div className={editorLongFieldsClass}>
        <label data-story-path="background">
          <span>故事背景</span>
          <textarea
            rows={9}
            value={draft.background}
            onChange={(event) => onChange({ ...draft, background: event.target.value })}
          />
        </label>
        <label data-story-path="worldRules">
          <span>世界规则与叙事约束</span>
          <textarea
            rows={9}
            value={draft.worldRules}
            onChange={(event) => onChange({ ...draft, worldRules: event.target.value })}
          />
        </label>
        <label data-story-path="contentWarnings">
          <span>内容提示（每行一项）</span>
          <textarea
            rows={5}
            value={draft.contentWarnings.join('\n')}
            onChange={(event) => onChange({ ...draft, contentWarnings: lines(event.target.value) })}
          />
        </label>
        <label data-story-path="contentBoundaries">
          <span>内容边界（每行一项）</span>
          <textarea
            rows={5}
            value={draft.contentBoundaries.join('\n')}
            onChange={(event) => onChange({ ...draft, contentBoundaries: lines(event.target.value) })}
          />
        </label>
      </div>
    </section>
  )
}
