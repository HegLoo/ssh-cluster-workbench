import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleX,
  LoaderCircle,
  RotateCcw,
  X,
  XCircle
} from 'lucide-react'
import type { TransferTask } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'

export function TransferPanel(): React.JSX.Element {
  const tasks = useAppStore((state) => state.tasks)
  const cancelTransfer = useAppStore((state) => state.cancelTransfer)
  const retryTransfer = useAppStore((state) => state.retryTransfer)
  const connection = useAppStore((state) => state.connection)
  const [open, setOpen] = useState(false)
  const activeCount = tasks.filter((task) =>
    ['queued', 'running', 'waiting'].includes(task.state)
  ).length

  if (tasks.length === 0) {
    return (
      <div className="flex h-7 shrink-0 items-center border-t border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-500">
        <span>
          {connection.message ?? (connection.state === 'connected' ? '文件会话已就绪' : '等待连接')}
        </span>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50">
      <button
        className="flex h-8 w-full items-center gap-2 px-3 text-left text-[11px] text-slate-600 hover:bg-slate-100"
        onClick={() => setOpen((value) => !value)}
      >
        {activeCount > 0 ? (
          <LoaderCircle className="animate-spin text-sky-600" size={13} />
        ) : (
          <CheckCircle2 className="text-emerald-600" size={13} />
        )}
        <span className="font-medium">
          {activeCount > 0 ? `${activeCount} 个传输进行中` : `${tasks.length} 个传输任务`}
        </span>
        <span className="ml-auto" />
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>

      {open ? (
        <div className="max-h-52 overflow-y-auto border-t border-slate-200 bg-white">
          {tasks.map((task) => (
            <TransferRow
              key={task.id}
              task={task}
              onCancel={() => void cancelTransfer(task.id)}
              onRetry={() => void retryTransfer(task.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TransferRow({
  task,
  onCancel,
  onRetry
}: {
  task: TransferTask
  onCancel(): void
  onRetry(): void
}): React.JSX.Element {
  const percent =
    task.totalBytes > 0 ? Math.min(100, (task.bytesTransferred / task.totalBytes) * 100) : 0
  const active = ['queued', 'running', 'waiting'].includes(task.state)
  return (
    <div className="border-b border-slate-100 px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold text-slate-700">
          {task.direction === 'upload' ? '上传' : '下载'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">
          {task.sourceLabel} → {task.destinationLabel}
        </span>
        {task.state === 'failed' ? <XCircle className="text-red-500" size={14} /> : null}
        {task.state === 'cancelled' ? <CircleX className="text-slate-400" size={14} /> : null}
        {active ? (
          <button className="icon-button size-6" onClick={onCancel} title="取消">
            <X size={13} />
          </button>
        ) : task.state === 'failed' || task.state === 'cancelled' ? (
          <button className="icon-button size-6" onClick={onRetry} title="重试">
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width] ${
            task.state === 'failed'
              ? 'bg-red-500'
              : task.state === 'completed'
                ? 'bg-emerald-500'
                : 'bg-sky-500'
          }`}
          style={{ width: `${task.state === 'completed' ? 100 : percent}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          {task.filesTransferred}/{task.totalFiles} 个文件 · {formatBytes(task.bytesTransferred)} /{' '}
          {formatBytes(task.totalBytes)}
        </span>
        <span>
          {task.error ??
            (task.state === 'completed'
              ? '已完成'
              : task.speedBytesPerSecond > 0
                ? `${formatBytes(task.speedBytesPerSecond)}/s`
                : stateLabel(task.state))}
        </span>
      </div>
    </div>
  )
}

function stateLabel(state: TransferTask['state']): string {
  return {
    queued: '排队中',
    waiting: '等待处理',
    running: '传输中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }[state]
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}
