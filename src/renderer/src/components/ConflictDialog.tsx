import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { TransferConflict } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { Modal } from './DialogPrimitives'

export function ConflictDialog(): React.JSX.Element | null {
  const conflict = useAppStore((state) => state.conflict)
  if (!conflict) return null
  return <ConflictContent key={conflict.id} conflict={conflict} />
}

function ConflictContent({ conflict }: { conflict: TransferConflict }): React.JSX.Element {
  const resolveConflict = useAppStore((state) => state.resolveConflict)
  const [applyToAll, setApplyToAll] = useState(false)

  const resolve = (action: 'overwrite' | 'skip' | 'rename'): void => {
    void resolveConflict({ conflictId: conflict.id, action, applyToAll })
  }

  return (
    <Modal open onOpenChange={() => undefined} title="目标位置已有同名项目" widthClass="max-w-lg">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} />
        <div className="min-w-0 text-[12px] leading-5 text-slate-600">
          <div className="mb-2">
            {conflict.direction === 'upload' ? '上传目标' : '下载目标'}已存在，需要选择处理方式。
          </div>
          <div className="rounded-md bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
            <div className="truncate" title={conflict.sourcePath}>
              源：{conflict.sourcePath}
            </div>
            <div className="mt-1 truncate" title={conflict.destinationPath}>
              目标：{conflict.destinationPath}
            </div>
          </div>
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[12px] text-slate-600">
        <input
          type="checkbox"
          className="accent-sky-600"
          checked={applyToAll}
          onChange={(event) => setApplyToAll(event.target.checked)}
        />
        对本次任务中的后续冲突应用相同操作
      </label>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <button className="button-secondary" onClick={() => resolve('skip')}>
          跳过
        </button>
        <button className="button-secondary" onClick={() => resolve('rename')}>
          自动重命名
        </button>
        <button className="button-primary" onClick={() => resolve('overwrite')}>
          覆盖
        </button>
      </div>
    </Modal>
  )
}
