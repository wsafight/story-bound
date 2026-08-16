import {
  apiContracts,
  type BackupItem,
  createModelProviderSchema,
  getSchemaErrorMessage,
  type ModelHealth,
  type ModelProvider,
  type PromptAudit,
  type RuntimeMod,
  updateModelProviderSchema,
} from '@storybound/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { api, post } from '../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../app/apiQueries'
import { PageHeadingBlock } from '../blocks/PageHeadingBlock'
import { buttonClass, cx, noticeClass, ui } from '../shared/ui'
import { BackupBlock } from './settings/BackupBlock'
import { ModManagementBlock } from './settings/ModManagementBlock'
import { ProviderBlock } from './settings/ProviderBlock'
import { RuntimeBlock } from './settings/RuntimeBlock'
import type { ProviderDraft } from './settings/types'

const emptyDraft: ProviderDraft = {
  name: '本地模型',
  kind: 'local',
  baseUrl: 'http://127.0.0.1:8000/v1',
  apiKey: '',
  defaultModel: '',
  contextWindow: 32_768,
  maxOutputTokens: 1_600,
  thinkingMode: 'auto',
  thinkingEffort: null,
}

function toDraft(provider: ModelProvider): ProviderDraft {
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: '',
    defaultModel: provider.defaultModel,
    contextWindow: provider.contextWindow,
    maxOutputTokens: provider.maxOutputTokens,
    thinkingMode: provider.thinkingMode,
    thinkingEffort: provider.thinkingEffort,
  }
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const initializedProviderRef = useRef(false)
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft)
  const [health, setHealth] = useState<ModelHealth | null>(null)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updatingMod, setUpdatingMod] = useState<string | null>(null)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const providersContract = apiContracts.providers()
  const runtimeContract = apiContracts.runtime()
  const promptAuditContract = apiContracts.promptAudit()
  const modsContract = apiContracts.runtimeMods()
  const backupsContract = apiContracts.backups()
  const providersQuery = useQuery(apiQueryOptions(providersContract))
  const runtimeQuery = useQuery(apiQueryOptions(runtimeContract, 15_000))
  const promptAuditQuery = useQuery(apiQueryOptions(promptAuditContract, 60_000))
  const modsQuery = useQuery(apiQueryOptions(modsContract))
  const backupsQuery = useQuery(apiQueryOptions(backupsContract))
  const providers = providersQuery.data?.providers || []
  const runtime = runtimeQuery.data?.runtime || null
  const promptAudit: PromptAudit | null = promptAuditQuery.data?.audit || null
  const mods = modsQuery.data?.mods || []
  const backups = backupsQuery.data?.backups || []
  const queryError = providersQuery.error || modsQuery.error || backupsQuery.error || promptAuditQuery.error
  const error = actionError || (queryError instanceof Error ? queryError.message : '')

  async function loadProviders(preferredId?: string) {
    const result = await queryClient.fetchQuery(apiQueryOptions(providersContract, 0))
    const selected =
      result.providers.find((provider) => provider.id === preferredId) ||
      result.providers.find((provider) => provider.id === draft.id) ||
      result.providers[0]
    setDraft(selected ? toDraft(selected) : { ...emptyDraft })
  }

  useEffect(() => {
    if (!providersQuery.data || initializedProviderRef.current) return
    initializedProviderRef.current = true
    const selected = providersQuery.data.providers[0]
    if (selected) setDraft(toDraft(selected))
  }, [providersQuery.data])

  async function createDataBackup() {
    setCreatingBackup(true)
    setActionError('')
    setMessage('')
    try {
      const result = await post(apiContracts.createBackup())
      queryClient.setQueryData<{ backups: BackupItem[] }>(apiQueryKey(backupsContract), (current) => ({
        backups: [result.backup, ...(current?.backups || [])],
      }))
      setMessage('本地一致性备份已创建。')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '创建备份失败')
    } finally {
      setCreatingBackup(false)
    }
  }

  async function restoreDataBackup(backup: BackupItem) {
    if (!window.confirm('恢复这个备份？当前数据库会先自动创建安全备份。')) return
    setRestoringBackup(backup.name)
    setActionError('')
    setMessage('')
    try {
      await post(apiContracts.restoreBackup(backup.name))
      setMessage('备份已恢复，页面正在刷新。')
      window.setTimeout(() => window.location.reload(), 600)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '恢复备份失败')
    } finally {
      setRestoringBackup(null)
    }
  }

  async function updateMod(mod: RuntimeMod, body: { enabled?: boolean; defaultConfig?: Record<string, unknown> }) {
    setUpdatingMod(mod.id)
    setActionError('')
    setMessage('')
    try {
      const result = await api(apiContracts.updateRuntimeMod(mod.id), {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      queryClient.setQueryData<{ mods: RuntimeMod[] }>(apiQueryKey(modsContract), (current) => ({
        mods: (current?.mods || []).map((item) => (item.id === result.mod.id ? result.mod : item)),
      }))
      await queryClient.fetchQuery(apiQueryOptions(runtimeContract, 0))
      setMessage(`${mod.name}已更新。`)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'MOD 更新失败')
    } finally {
      setUpdatingMod(null)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setActionError('')
    setMessage('')
    const { id, apiKey, ...values } = draft
    const body = { ...values, ...(!id || apiKey ? { apiKey } : {}) }
    try {
      const payload = id ? updateModelProviderSchema.parse(body) : createModelProviderSchema.parse(body)
      const result = id
        ? await api(apiContracts.updateProvider(id), {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await post(apiContracts.createProvider(), payload)
      await queryClient.invalidateQueries({
        queryKey: apiQueryKey(providersContract),
        exact: true,
        refetchType: 'none',
      })
      await loadProviders(result.provider.id)
      setMessage(id ? 'Provider 配置已更新。' : 'Provider 已添加。')
    } catch (reason) {
      setActionError(getSchemaErrorMessage(reason, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function checkConnection() {
    if (!draft.id) {
      setActionError('请先保存 Provider，再测试连接。')
      return
    }
    setChecking(true)
    setActionError('')
    try {
      const result = await post(apiContracts.checkProvider(draft.id))
      setHealth(result.health)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '连接检查失败')
    } finally {
      setChecking(false)
    }
  }

  async function makeDefault() {
    if (!draft.id) return
    setActionError('')
    try {
      await post(apiContracts.defaultProvider(draft.id))
      await queryClient.invalidateQueries({
        queryKey: apiQueryKey(providersContract),
        exact: true,
        refetchType: 'none',
      })
      await loadProviders(draft.id)
      setMessage('后续新建的故事存档将使用这个 Provider。')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '默认 Provider 更新失败')
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm('删除这个 Provider 配置？仍被故事存档引用时，系统会保留配置并阻止删除。')) return
    setActionError('')
    try {
      await api(apiContracts.deleteProvider(draft.id), { method: 'DELETE' })
      setHealth(null)
      await queryClient.invalidateQueries({
        queryKey: apiQueryKey(providersContract),
        exact: true,
        refetchType: 'none',
      })
      await loadProviders()
      setMessage('Provider 已删除。')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '删除失败')
    }
  }

  function selectProvider(provider: ModelProvider) {
    setDraft(toDraft(provider))
    setHealth(null)
    setActionError('')
    setMessage('')
  }

  return (
    <div className={cx(ui.page, ui.narrowPage, 'pt-[58px]')}>
      <PageHeadingBlock
        eyebrow="Storybound · 入戏"
        title="模型与扩展"
        description="管理生成模型、运行时扩展和本地故事数据。"
        actions={
          <button
            className={buttonClass('secondary')}
            type="button"
            onClick={() => {
              setDraft({ ...emptyDraft })
              setHealth(null)
              setMessage('')
              setActionError('')
            }}
          >
            <Plus size={16} /> 添加 Provider
          </button>
        }
      />

      {error && <div className={noticeClass(true, 'mb-4')}>{error}</div>}
      {message && <div className={noticeClass(false, 'mb-4')}>{message}</div>}

      <ProviderBlock
        providers={providers}
        draft={draft}
        health={health}
        loading={providersQuery.isPending}
        saving={saving}
        checking={checking}
        onDraftChange={setDraft}
        onSelect={selectProvider}
        onSubmit={save}
        onCheck={() => void checkConnection()}
        onMakeDefault={() => void makeDefault()}
        onRemove={() => void remove()}
      />
      <ModManagementBlock mods={mods} updatingMod={updatingMod} onUpdate={(mod, body) => void updateMod(mod, body)} />
      <RuntimeBlock runtime={runtime} promptAudit={promptAudit} />
      <BackupBlock
        backups={backups}
        creating={creatingBackup}
        restoring={restoringBackup}
        onCreate={() => void createDataBackup()}
        onRestore={(backup) => void restoreDataBackup(backup)}
        onError={setActionError}
      />
    </div>
  )
}
