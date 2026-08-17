import { Plus, Trash2 } from 'lucide-react'
import {
  EditorSectionHeader,
  editorFormGridClass,
  editorItemClass,
  editorItemHeaderClass,
} from '../../components/forms/EditorSectionHeader'
import { createUuid } from '../../shared/id'
import { buttonClass, cx, emptyStateClass, ui } from '../../shared/ui'
import { JsonField } from './JsonField'
import type { DraftDeclarativeMod, DraftLorebookEntry, DraftStoryFact, DraftStoryNode, StoryDraft } from './types'

interface StateStructureBlockProps {
  draft: StoryDraft
  onChange: (draft: StoryDraft) => void
}

const emptyObjectSchema = { type: 'object', properties: {}, additionalProperties: false }
const fieldTypes = ['string', 'number', 'integer', 'boolean'] as const

function schemaProperties(draft: StoryDraft) {
  const schema = draft.stateSchema as Record<string, any>
  return schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? (schema.properties as Record<string, any>)
    : {}
}

function requiredFields(draft: StoryDraft) {
  return new Set(
    Array.isArray((draft.stateSchema as Record<string, any>).required) ? (draft.stateSchema as any).required : [],
  )
}

function policyFor(draft: StoryDraft, key: string) {
  return draft.statePolicy.find((item) => item.path === `/custom/${key}`)
}

function parseDefaultValue(type: string, value: string) {
  if (type === 'boolean') return value === 'true'
  if (type === 'number' || type === 'integer') return value === '' ? 0 : Number(value)
  return value
}

function defaultInputValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === undefined || value === null) return ''
  return String(value)
}

export function StateStructureBlock({ draft, onChange }: StateStructureBlockProps) {
  const properties = schemaProperties(draft)
  const required = requiredFields(draft)
  const fieldKeys = Object.keys(properties)

  function updateStateSchema(nextProperties: Record<string, unknown>, nextRequired = Array.from(required)) {
    onChange({
      ...draft,
      stateSchema: {
        ...(draft.stateSchema as Record<string, unknown>),
        type: 'object',
        properties: nextProperties,
        required: nextRequired,
        additionalProperties: false,
      },
    })
  }

  function addStateField() {
    const key = `field_${fieldKeys.length + 1}`
    onChange({
      ...draft,
      stateSchema: {
        ...(draft.stateSchema as Record<string, unknown>),
        type: 'object',
        properties: { ...properties, [key]: { type: 'string', title: '新状态字段' } },
        required: Array.from(required),
        additionalProperties: false,
      },
      defaultState: { ...draft.defaultState, [key]: '' },
      statePolicy: [
        ...draft.statePolicy,
        { path: `/custom/${key}`, label: '新状态字段', playerEditable: true, storyEditable: true, appManaged: false },
      ],
    })
  }

  function renameStateField(key: string, nextKey: string) {
    const normalized = nextKey.trim().replace(/[^A-Za-z0-9_-]/g, '_')
    if (!normalized || normalized === key || properties[normalized]) return
    const nextProperties = Object.fromEntries(
      Object.entries(properties).map(([itemKey, value]) => [itemKey === key ? normalized : itemKey, value]),
    )
    const nextDefaultState = Object.fromEntries(
      Object.entries(draft.defaultState).map(([itemKey, value]) => [itemKey === key ? normalized : itemKey, value]),
    )
    onChange({
      ...draft,
      stateSchema: {
        ...(draft.stateSchema as Record<string, unknown>),
        type: 'object',
        properties: nextProperties,
        required: Array.from(required).map((item) => (item === key ? normalized : item)),
        additionalProperties: false,
      },
      defaultState: nextDefaultState,
      statePolicy: draft.statePolicy.map((item) =>
        item.path === `/custom/${key}` ? { ...item, path: `/custom/${normalized}` } : item,
      ),
    })
  }

  function removeStateField(key: string) {
    const nextProperties = { ...properties }
    delete nextProperties[key]
    const nextDefaultState = { ...draft.defaultState }
    delete nextDefaultState[key]
    onChange({
      ...draft,
      stateSchema: {
        ...(draft.stateSchema as Record<string, unknown>),
        type: 'object',
        properties: nextProperties,
        required: Array.from(required).filter((item) => item !== key),
        additionalProperties: false,
      },
      defaultState: nextDefaultState,
      statePolicy: draft.statePolicy.filter((item) => item.path !== `/custom/${key}`),
    })
  }

  function updateStatePolicy(key: string, values: { label?: string; playerEditable?: boolean }) {
    const existing = policyFor(draft, key)
    const next = {
      path: `/custom/${key}`,
      label: properties[key]?.title || key,
      playerEditable: true,
      storyEditable: true,
      appManaged: false,
      ...existing,
      ...values,
    }
    onChange({
      ...draft,
      statePolicy: existing
        ? draft.statePolicy.map((item) => (item.path === `/custom/${key}` ? next : item))
        : [...draft.statePolicy, next],
    })
  }

  function updateFact(index: number, values: Partial<DraftStoryFact>) {
    onChange({
      ...draft,
      facts: draft.facts.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)),
    })
  }

  function updateLorebookEntry(index: number, values: Partial<DraftLorebookEntry>) {
    onChange({
      ...draft,
      lorebookEntries: draft.lorebookEntries.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...values } : item,
      ),
    })
  }

  function updateNode(index: number, values: Partial<DraftStoryNode>) {
    onChange({
      ...draft,
      nodes: draft.nodes.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)),
    })
  }

  function updateDeclarativeMod(index: number, values: Partial<DraftDeclarativeMod>) {
    onChange({
      ...draft,
      declarativeMods: draft.declarativeMods.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...values } : item,
      ),
    })
  }

  return (
    <section className="grid gap-10" data-story-path="state">
      <div data-story-path="stateSchema">
        <EditorSectionHeader
          kicker="05 · 状态"
          title="故事运行时有哪些确定状态？"
          action={
            <button className={buttonClass('secondary')} type="button" onClick={addStateField}>
              <Plus size={15} /> 添加字段
            </button>
          }
        />
        {fieldKeys.length === 0 && <div className={emptyStateClass(true)}>这个故事暂时没有作者自定义状态字段。</div>}
        <div className="grid gap-[13px]">
          {fieldKeys.map((key) => {
            const field = properties[key] || {}
            const policy = policyFor(draft, key)
            return (
              <article className={editorItemClass} data-story-path={`stateSchema.properties.${key}`} key={key}>
                <header className={editorItemHeaderClass}>
                  <span>ST</span>
                  <strong>{field.title || key}</strong>
                  <button
                    className={cx(ui.iconButton, 'text-red')}
                    type="button"
                    onClick={() => removeStateField(key)}
                    title="删除状态字段"
                    aria-label="删除状态字段"
                  >
                    <Trash2 size={16} />
                  </button>
                </header>
                <div className={editorFormGridClass}>
                  <label>
                    <span>字段 Key</span>
                    <input defaultValue={key} onBlur={(event) => renameStateField(key, event.target.value)} />
                  </label>
                  <label>
                    <span>显示名称</span>
                    <input
                      value={field.title || ''}
                      onChange={(event) => {
                        const title = event.target.value
                        const existing = policyFor(draft, key)
                        const nextPolicy = {
                          path: `/custom/${key}`,
                          playerEditable: true,
                          storyEditable: true,
                          appManaged: false,
                          ...existing,
                          label: title,
                        }
                        onChange({
                          ...draft,
                          stateSchema: {
                            ...(draft.stateSchema as Record<string, unknown>),
                            type: 'object',
                            properties: { ...properties, [key]: { ...field, title } },
                            required: Array.from(required),
                            additionalProperties: false,
                          },
                          statePolicy: existing
                            ? draft.statePolicy.map((item) => (item.path === `/custom/${key}` ? nextPolicy : item))
                            : [...draft.statePolicy, nextPolicy],
                        })
                      }}
                    />
                  </label>
                  <label>
                    <span>类型</span>
                    <select
                      value={field.type || 'string'}
                      onChange={(event) => {
                        const type = event.target.value
                        onChange({
                          ...draft,
                          stateSchema: {
                            ...(draft.stateSchema as Record<string, unknown>),
                            type: 'object',
                            properties: { ...properties, [key]: { ...field, type } },
                            required: Array.from(required),
                            additionalProperties: false,
                          },
                          defaultState: {
                            ...draft.defaultState,
                            [key]: parseDefaultValue(type, defaultInputValue(draft.defaultState[key])),
                          },
                        })
                      }}
                    >
                      {fieldTypes.map((type) => (
                        <option value={type} key={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>默认值</span>
                    {field.type === 'boolean' ? (
                      <select
                        value={defaultInputValue(draft.defaultState[key]) || 'false'}
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            defaultState: { ...draft.defaultState, [key]: event.target.value === 'true' },
                          })
                        }
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        value={defaultInputValue(draft.defaultState[key])}
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            defaultState: {
                              ...draft.defaultState,
                              [key]: parseDefaultValue(field.type || 'string', event.target.value),
                            },
                          })
                        }
                      />
                    )}
                  </label>
                  <label className="!flex !flex-row !items-center !gap-2">
                    <input
                      className="!min-h-[17px] !w-[17px] accent-green"
                      type="checkbox"
                      checked={required.has(key)}
                      onChange={(event) => {
                        const next = new Set(required)
                        if (event.target.checked) next.add(key)
                        else next.delete(key)
                        updateStateSchema(properties, Array.from(next))
                      }}
                    />
                    <span>必填</span>
                  </label>
                  <label className="!flex !flex-row !items-center !gap-2">
                    <input
                      className="!min-h-[17px] !w-[17px] accent-green"
                      type="checkbox"
                      checked={policy?.playerEditable !== false}
                      onChange={(event) => updateStatePolicy(key, { playerEditable: event.target.checked })}
                    />
                    <span>玩家可编辑</span>
                  </label>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div data-story-path="facts">
        <EditorSectionHeader
          kicker="06 · 事实"
          title="哪些信息是事实或秘密？"
          action={
            <button
              className={buttonClass('secondary')}
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  facts: [
                    ...draft.facts,
                    {
                      id: createUuid(),
                      title: '',
                      content: '',
                      visibility: 'public',
                      knownByCharacterIds: [],
                      tags: [],
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> 添加事实
            </button>
          }
        />
        {draft.facts.length === 0 && <div className={emptyStateClass(true)}>还没有结构化事实。</div>}
        <div className="grid gap-[13px]">
          {draft.facts.map((fact, index) => (
            <article className={editorItemClass} data-story-path={`facts.${index}`} key={fact.id}>
              <header className={editorItemHeaderClass}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{fact.title || '未命名事实'}</strong>
                <button
                  className={cx(ui.iconButton, 'text-red')}
                  type="button"
                  onClick={() =>
                    onChange({ ...draft, facts: draft.facts.filter((_, itemIndex) => itemIndex !== index) })
                  }
                  title="删除事实"
                  aria-label="删除事实"
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className={editorFormGridClass}>
                <label data-story-path={`facts.${index}.title`}>
                  <span>标题</span>
                  <input value={fact.title} onChange={(event) => updateFact(index, { title: event.target.value })} />
                </label>
                <label data-story-path={`facts.${index}.visibility`}>
                  <span>可见性</span>
                  <select
                    value={fact.visibility}
                    onChange={(event) =>
                      updateFact(index, { visibility: event.target.value as DraftStoryFact['visibility'] })
                    }
                  >
                    <option value="public">公开事实</option>
                    <option value="secret">秘密</option>
                  </select>
                </label>
                <label className="sm:col-span-2" data-story-path={`facts.${index}.content`}>
                  <span>内容</span>
                  <textarea
                    rows={3}
                    value={fact.content}
                    onChange={(event) => updateFact(index, { content: event.target.value })}
                  />
                </label>
                <label data-story-path={`facts.${index}.tags`}>
                  <span>标签（逗号分隔）</span>
                  <input
                    value={fact.tags.join(', ')}
                    onChange={(event) =>
                      updateFact(index, {
                        tags: event.target.value
                          .split(/[,，]/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <div className="grid gap-2" data-story-path={`facts.${index}.knownByCharacterIds`}>
                  <span className="text-[11px] font-bold text-[#505652]">知情人物</span>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.characters.map((character) => (
                      <label
                        className="inline-flex min-h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-[11px]"
                        key={character.id}
                      >
                        <input
                          className="accent-green"
                          type="checkbox"
                          checked={fact.knownByCharacterIds.includes(character.id)}
                          onChange={(event) => {
                            const ids = new Set(fact.knownByCharacterIds)
                            if (event.target.checked) ids.add(character.id)
                            else ids.delete(character.id)
                            updateFact(index, { knownByCharacterIds: Array.from(ids) })
                          }}
                        />
                        {character.name || '未命名'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div data-story-path="lorebookEntries">
        <EditorSectionHeader
          kicker="07 · 世界书"
          title="哪些背景资料需要按关键词召回？"
          action={
            <button
              className={buttonClass('secondary')}
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  lorebookEntries: [
                    ...draft.lorebookEntries,
                    {
                      id: createUuid(),
                      title: '',
                      content: '',
                      keywords: [],
                      condition: {},
                      scope: 'story',
                      sceneIds: [],
                      characterIds: [],
                      chapterNumbers: [],
                      priority: 'medium',
                      enabled: true,
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> 添加资料
            </button>
          }
        />
        {draft.lorebookEntries.length === 0 && <div className={emptyStateClass(true)}>还没有世界书资料。</div>}
        <div className="grid gap-[13px]">
          {draft.lorebookEntries.map((entry, index) => (
            <article className={editorItemClass} data-story-path={`lorebookEntries.${index}`} key={entry.id}>
              <header className={editorItemHeaderClass}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{entry.title || '未命名资料'}</strong>
                <button
                  className={cx(ui.iconButton, 'text-red')}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...draft,
                      lorebookEntries: draft.lorebookEntries.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                  title="删除世界书资料"
                  aria-label="删除世界书资料"
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className={editorFormGridClass}>
                <label data-story-path={`lorebookEntries.${index}.title`}>
                  <span>标题</span>
                  <input
                    value={entry.title}
                    onChange={(event) => updateLorebookEntry(index, { title: event.target.value })}
                  />
                </label>
                <label data-story-path={`lorebookEntries.${index}.priority`}>
                  <span>优先级</span>
                  <select
                    value={entry.priority}
                    onChange={(event) =>
                      updateLorebookEntry(index, { priority: event.target.value as DraftLorebookEntry['priority'] })
                    }
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </label>
                <label data-story-path={`lorebookEntries.${index}.keywords`}>
                  <span>关键词（逗号分隔）</span>
                  <input
                    value={entry.keywords.join(', ')}
                    onChange={(event) =>
                      updateLorebookEntry(index, {
                        keywords: event.target.value
                          .split(/[,，]/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label data-story-path={`lorebookEntries.${index}.scope`}>
                  <span>作用域</span>
                  <select
                    value={entry.scope}
                    onChange={(event) =>
                      updateLorebookEntry(index, { scope: event.target.value as DraftLorebookEntry['scope'] })
                    }
                  >
                    <option value="story">全故事</option>
                    <option value="scene">场景</option>
                    <option value="character">人物</option>
                    <option value="chapter">章节</option>
                  </select>
                </label>
                <label className="!flex !flex-row !items-center !gap-2">
                  <input
                    className="!min-h-[17px] !w-[17px] accent-green"
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(event) => updateLorebookEntry(index, { enabled: event.target.checked })}
                  />
                  <span>启用</span>
                </label>
                {entry.scope === 'scene' && (
                  <div className="grid gap-2 sm:col-span-2" data-story-path={`lorebookEntries.${index}.sceneIds`}>
                    <span className="text-[11px] font-bold text-[#505652]">限定场景</span>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.scenes.map((scene) => (
                        <label
                          className="inline-flex min-h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-[11px]"
                          key={scene.id}
                        >
                          <input
                            className="accent-green"
                            type="checkbox"
                            checked={entry.sceneIds.includes(scene.id)}
                            onChange={(event) => {
                              const ids = new Set(entry.sceneIds)
                              if (event.target.checked) ids.add(scene.id)
                              else ids.delete(scene.id)
                              updateLorebookEntry(index, { sceneIds: Array.from(ids) })
                            }}
                          />
                          {scene.title || '未命名'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {entry.scope === 'character' && (
                  <div className="grid gap-2 sm:col-span-2" data-story-path={`lorebookEntries.${index}.characterIds`}>
                    <span className="text-[11px] font-bold text-[#505652]">限定人物</span>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.characters.map((character) => (
                        <label
                          className="inline-flex min-h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-[11px]"
                          key={character.id}
                        >
                          <input
                            className="accent-green"
                            type="checkbox"
                            checked={entry.characterIds.includes(character.id)}
                            onChange={(event) => {
                              const ids = new Set(entry.characterIds)
                              if (event.target.checked) ids.add(character.id)
                              else ids.delete(character.id)
                              updateLorebookEntry(index, { characterIds: Array.from(ids) })
                            }}
                          />
                          {character.name || '未命名'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {entry.scope === 'chapter' && (
                  <label data-story-path={`lorebookEntries.${index}.chapterNumbers`}>
                    <span>章节序号（逗号分隔）</span>
                    <input
                      value={entry.chapterNumbers.join(', ')}
                      onChange={(event) =>
                        updateLorebookEntry(index, {
                          chapterNumbers: event.target.value
                            .split(/[,，]/)
                            .map((item) => Number(item.trim()))
                            .filter((item) => Number.isInteger(item) && item > 0),
                        })
                      }
                    />
                  </label>
                )}
                <label className="sm:col-span-2" data-story-path={`lorebookEntries.${index}.content`}>
                  <span>资料内容</span>
                  <textarea
                    rows={4}
                    value={entry.content}
                    onChange={(event) => updateLorebookEntry(index, { content: event.target.value })}
                  />
                </label>
                <JsonField
                  label="附加条件"
                  value={entry.condition}
                  rows={4}
                  onValidChange={(condition) => updateLorebookEntry(index, { condition })}
                />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div data-story-path="nodes">
        <EditorSectionHeader
          kicker="08 · 节点"
          title="哪些剧情节点会被当前状态触发？"
          action={
            <button
              className={buttonClass('secondary')}
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  nodes: [
                    ...draft.nodes,
                    { id: createUuid(), title: '', description: '', condition: {}, prompt: '', enabled: true },
                  ],
                })
              }
            >
              <Plus size={15} /> 添加节点
            </button>
          }
        />
        {draft.nodes.length === 0 && <div className={emptyStateClass(true)}>还没有故事节点。</div>}
        <div className="grid gap-[13px]">
          {draft.nodes.map((node, index) => (
            <article className={editorItemClass} data-story-path={`nodes.${index}`} key={node.id}>
              <header className={editorItemHeaderClass}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{node.title || '未命名节点'}</strong>
                <button
                  className={cx(ui.iconButton, 'text-red')}
                  type="button"
                  onClick={() =>
                    onChange({ ...draft, nodes: draft.nodes.filter((_, itemIndex) => itemIndex !== index) })
                  }
                  title="删除节点"
                  aria-label="删除节点"
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className={editorFormGridClass}>
                <label data-story-path={`nodes.${index}.title`}>
                  <span>标题</span>
                  <input value={node.title} onChange={(event) => updateNode(index, { title: event.target.value })} />
                </label>
                <label className="!flex !flex-row !items-center !gap-2" data-story-path={`nodes.${index}.enabled`}>
                  <input
                    className="!min-h-[17px] !w-[17px] accent-green"
                    type="checkbox"
                    checked={node.enabled}
                    onChange={(event) => updateNode(index, { enabled: event.target.checked })}
                  />
                  <span>启用</span>
                </label>
                <label className="sm:col-span-2" data-story-path={`nodes.${index}.description`}>
                  <span>说明</span>
                  <textarea
                    rows={3}
                    value={node.description}
                    onChange={(event) => updateNode(index, { description: event.target.value })}
                  />
                </label>
                <JsonField
                  label="触发条件"
                  value={node.condition}
                  rows={4}
                  onValidChange={(condition) => updateNode(index, { condition })}
                />
                <label className="sm:col-span-2" data-story-path={`nodes.${index}.prompt`}>
                  <span>节点提示</span>
                  <textarea
                    rows={4}
                    value={node.prompt}
                    onChange={(event) => updateNode(index, { prompt: event.target.value })}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div data-story-path="declarativeMods">
        <EditorSectionHeader
          kicker="09 · 声明式 MOD"
          title="哪些轻量扩展随故事启用？"
          action={
            <button
              className={buttonClass('secondary')}
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  declarativeMods: [
                    ...draft.declarativeMods,
                    {
                      id: createUuid(),
                      name: '',
                      version: '1.0.0',
                      description: '',
                      prompt: '',
                      enabledByDefault: true,
                      configSchema: emptyObjectSchema,
                      defaultConfig: {},
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> 添加 MOD
            </button>
          }
        />
        {draft.declarativeMods.length === 0 && <div className={emptyStateClass(true)}>还没有声明式 MOD。</div>}
        <div className="grid gap-[13px]">
          {draft.declarativeMods.map((mod, index) => (
            <article className={editorItemClass} data-story-path={`declarativeMods.${index}`} key={mod.id}>
              <header className={editorItemHeaderClass}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{mod.name || '未命名 MOD'}</strong>
                <button
                  className={cx(ui.iconButton, 'text-red')}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...draft,
                      declarativeMods: draft.declarativeMods.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                  title="删除声明式 MOD"
                  aria-label="删除声明式 MOD"
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className={editorFormGridClass}>
                <label data-story-path={`declarativeMods.${index}.name`}>
                  <span>名称</span>
                  <input
                    value={mod.name}
                    onChange={(event) => updateDeclarativeMod(index, { name: event.target.value })}
                  />
                </label>
                <label data-story-path={`declarativeMods.${index}.version`}>
                  <span>版本</span>
                  <input
                    value={mod.version}
                    onChange={(event) => updateDeclarativeMod(index, { version: event.target.value })}
                  />
                </label>
                <label className="sm:col-span-2" data-story-path={`declarativeMods.${index}.description`}>
                  <span>说明</span>
                  <textarea
                    rows={3}
                    value={mod.description}
                    onChange={(event) => updateDeclarativeMod(index, { description: event.target.value })}
                  />
                </label>
                <label
                  className="!flex !flex-row !items-center !gap-2 sm:col-span-2"
                  data-story-path={`declarativeMods.${index}.enabledByDefault`}
                >
                  <input
                    className="!min-h-[17px] !w-[17px] accent-green"
                    type="checkbox"
                    checked={mod.enabledByDefault}
                    onChange={(event) => updateDeclarativeMod(index, { enabledByDefault: event.target.checked })}
                  />
                  <span>新建存档默认启用</span>
                </label>
                <JsonField
                  label="配置 Schema"
                  value={mod.configSchema}
                  rows={5}
                  onValidChange={(configSchema) => updateDeclarativeMod(index, { configSchema })}
                />
                <JsonField
                  label="默认配置"
                  value={mod.defaultConfig}
                  rows={4}
                  onValidChange={(defaultConfig) => updateDeclarativeMod(index, { defaultConfig })}
                />
                <label className="sm:col-span-2" data-story-path={`declarativeMods.${index}.prompt`}>
                  <span>提示词贡献</span>
                  <textarea
                    rows={4}
                    value={mod.prompt}
                    onChange={(event) => updateDeclarativeMod(index, { prompt: event.target.value })}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
