import { apiPaths, type BackupItem } from '@storybound/shared'
import { Database, Download, RotateCcw, Save } from 'lucide-react'
import { downloadApi } from '../../app/apiClient'
import { buttonClass, ui } from '../../shared/ui'

interface BackupPanelProps {
  backups: BackupItem[]
  creating: boolean
  restoring: string | null
  onCreate: () => void
  onRestore: (backup: BackupItem) => void
  onError: (message: string) => void
}

export function BackupBlock({ backups, creating, restoring, onCreate, onRestore, onError }: BackupPanelProps) {
  return (
    <section className="mt-[34px]">
      <header className="grid min-h-[92px] grid-cols-[42px_minmax(0,1fr)] items-center gap-3.5 border-t border-line sm:grid-cols-[42px_minmax(0,1fr)_auto]">
        <span className="grid size-[38px] place-items-center rounded bg-green-soft text-green">
          <Database size={20} />
        </span>
        <div>
          <h2 className="m-0 text-[15px] font-bold">故事数据</h2>
          <p className="mt-1 mb-0 text-[11px] text-muted">SQLite 本地数据库。远程模型只接收生成所需的当前上下文。</p>
        </div>
        <button
          className={buttonClass('secondary', 'col-start-2 mb-4 w-fit sm:col-start-auto sm:mb-0')}
          type="button"
          onClick={onCreate}
          disabled={creating}
        >
          <Save size={15} /> {creating ? '备份中…' : '创建备份'}
        </button>
      </header>
      {backups.length > 0 && (
        <div className="border-t border-line">
          {backups.slice(0, 5).map((backup) => (
            <div
              className="flex min-h-[52px] items-center justify-between gap-3.5 border-b border-line pl-0 sm:pl-14"
              key={backup.name}
            >
              <span className="grid gap-[3px]">
                <strong className="text-[11px]">
                  {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
                    new Date(backup.createdAt),
                  )}
                </strong>
                <small className="text-[9px] text-muted">{(backup.size / 1024).toFixed(1)} KB</small>
              </span>
              <span className="flex items-center gap-0.5">
                <button
                  className={ui.iconButton}
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => onRestore(backup)}
                  title="恢复备份"
                  aria-label="恢复备份"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  className={ui.iconButton}
                  type="button"
                  onClick={() =>
                    void downloadApi(apiPaths.downloadBackup(backup.name), backup.name).catch((reason: Error) =>
                      onError(reason.message),
                    )
                  }
                  title="下载备份"
                  aria-label="下载备份"
                >
                  <Download size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
