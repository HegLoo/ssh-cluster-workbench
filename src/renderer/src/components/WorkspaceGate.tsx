import { Clock3, FolderOpen, HardDrive, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@renderer/store/useAppStore'

export function WorkspaceGate(): React.JSX.Element {
  const workspace = useAppStore((state) => state.workspace)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const openRecentWorkspace = useAppStore((state) => state.openRecentWorkspace)
  const recent = workspace?.recentDirectories ?? []

  return (
    <main className="flex h-full items-center justify-center bg-[#eef1f4] p-8">
      <div className="w-full max-w-2xl rounded-lg border border-slate-300 bg-white shadow-lg">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-sky-600 text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="m-0 text-[17px] font-semibold text-slate-950">
                SSH Cluster Workbench
              </h1>
              <p className="mt-0.5 text-[12px] text-slate-500">选择保存账号预设的工作目录</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <button
            className="flex w-full items-center gap-4 rounded-md border border-slate-300 bg-slate-50 px-4 py-4 text-left transition hover:border-sky-400 hover:bg-sky-50"
            onClick={() => void chooseWorkspace()}
          >
            <FolderOpen className="text-sky-600" size={22} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-900">选择工作目录</div>
              <div className="mt-0.5 text-[11px] text-slate-500">预设与主机指纹将保存在该目录</div>
            </div>
            <HardDrive className="text-slate-400" size={18} />
          </button>

          {recent.length > 0 ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <Clock3 size={13} />
                最近使用
              </div>
              <div className="space-y-1">
                {recent.map((directory) => (
                  <button
                    key={directory}
                    className="block w-full truncate rounded-md px-3 py-2 text-left font-mono text-[12px] text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => void openRecentWorkspace(directory)}
                    title={directory}
                  >
                    {directory}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
