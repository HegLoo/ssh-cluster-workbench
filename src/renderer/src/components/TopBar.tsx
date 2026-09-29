import { FolderOpen, Plug, Power, Settings2, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@renderer/store/useAppStore'
import { PresetMenu } from './PresetMenu'

export function TopBar(): React.JSX.Element {
  const workspace = useAppStore((state) => state.workspace)
  const connection = useAppStore((state) => state.connection)
  const busy = useAppStore((state) => state.busy)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const connect = useAppStore((state) => state.connect)
  const disconnect = useAppStore((state) => state.disconnect)
  const openProfileEditor = useAppStore((state) => state.openProfileEditor)
  const selectedProfileId = workspace?.config.selectedProfileId ?? null
  const selectedProfile = workspace?.config.profiles.find(
    (profile) => profile.id === selectedProfileId
  )
  const connected = connection.state === 'connected'

  return (
    <header className="relative z-20 border-b border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex h-[50px] items-center gap-3 border-b border-slate-200 px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-sky-600 text-white">
          <ShieldCheck size={17} />
        </div>
        <div className="shrink-0 text-[13px] font-semibold text-slate-900">工作目录</div>
        <div
          className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[12px] text-slate-600"
          title={workspace?.directory ?? ''}
        >
          {workspace?.directory ?? '尚未选择'}
        </div>
        <button className="button-secondary" onClick={() => void chooseWorkspace()}>
          <FolderOpen size={15} />
          选择目录
        </button>
        <div
          className={`ml-1 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ${
            connection.state === 'connected'
              ? 'bg-emerald-50 text-emerald-700'
              : connection.state === 'connecting'
                ? 'bg-amber-50 text-amber-700'
                : connection.state === 'error'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              connection.state === 'connected'
                ? 'bg-emerald-500'
                : connection.state === 'connecting'
                  ? 'animate-pulse bg-amber-500'
                  : connection.state === 'error'
                    ? 'bg-red-500'
                    : 'bg-slate-400'
            }`}
          />
          {connection.state === 'connected'
            ? '已连接'
            : connection.state === 'connecting'
              ? '连接中'
              : connection.state === 'error'
                ? '连接失败'
                : '未连接'}
        </div>
      </div>

      <div className="flex h-[54px] items-center gap-3 px-4">
        <PresetMenu />
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(200px,1.25fr)_minmax(150px,0.8fr)_minmax(180px,1fr)] gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200">
          <div className="min-w-0 bg-white px-3 py-1.5">
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              主机
            </div>
            <div className="truncate text-[12px] text-slate-800">
              {selectedProfile
                ? `${selectedProfile.username}@${selectedProfile.host}:${selectedProfile.port}`
                : '尚未选择预设'}
            </div>
          </div>
          <div className="min-w-0 bg-white px-3 py-1.5">
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              认证
            </div>
            <div className="truncate text-[12px] text-slate-800">
              {selectedProfile ? (selectedProfile.authType === 'password' ? '密码' : '私钥') : '-'}
            </div>
          </div>
          <div className="min-w-0 bg-white px-3 py-1.5">
            <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              远端起始目录
            </div>
            <div className="truncate font-mono text-[12px] text-slate-800">
              {selectedProfile?.remoteStartDir ?? '-'}
            </div>
          </div>
        </div>
        <button
          className="icon-button"
          disabled={!selectedProfile}
          onClick={() => selectedProfileId && openProfileEditor(selectedProfileId)}
          title="编辑预设"
        >
          <Settings2 size={17} />
        </button>
        {connected ? (
          <button className="button-secondary min-w-[92px]" onClick={() => void disconnect()}>
            <Power size={15} />
            断开
          </button>
        ) : (
          <button
            className="button-primary min-w-[100px]"
            disabled={!selectedProfile || busy || connection.state === 'connecting'}
            onClick={() => void connect()}
          >
            <Plug size={15} />
            {connection.state === 'connecting' ? '连接中' : '连接'}
          </button>
        )}
      </div>
    </header>
  )
}
