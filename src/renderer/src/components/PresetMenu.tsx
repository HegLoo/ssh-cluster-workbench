import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Plus, Settings2, Trash2 } from 'lucide-react'
import { useAppStore } from '@renderer/store/useAppStore'
import { ConfirmDialog } from './DialogPrimitives'

export function PresetMenu(): React.JSX.Element {
  const workspace = useAppStore((state) => state.workspace)
  const selectProfile = useAppStore((state) => state.selectProfile)
  const openNewProfile = useAppStore((state) => state.openNewProfile)
  const openProfileEditor = useAppStore((state) => state.openProfileEditor)
  const removeProfile = useAppStore((state) => state.removeProfile)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const profiles = workspace?.config.profiles ?? []
  const selectedId = workspace?.config.selectedProfileId ?? null
  const selected = profiles.find((profile) => profile.id === selectedId)
  const deleteTarget = profiles.find((profile) => profile.id === deleteId)

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex h-10 max-w-[250px] min-w-[180px] items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-left transition hover:border-slate-400 focus:ring-2 focus:ring-sky-100 focus:outline-none">
            <div className="min-w-0">
              <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
                账号预设
              </div>
              <div className="truncate text-[13px] font-medium text-slate-900">
                {selected?.name ?? '选择预设'}
              </div>
            </div>
            <ChevronDown className="shrink-0 text-slate-500" size={15} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[330px] overflow-hidden rounded-lg border border-slate-300 bg-white p-1.5 shadow-xl"
          >
            <div className="max-h-[360px] overflow-y-auto">
              {profiles.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-slate-500">暂无账号预设</div>
              ) : (
                profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`group flex items-center gap-1 rounded-md px-1.5 py-1 ${
                      profile.id === selectedId ? 'bg-sky-50' : 'hover:bg-slate-100'
                    }`}
                  >
                    <button
                      className="min-w-0 flex-1 rounded px-2 py-1.5 text-left"
                      onClick={() => void selectProfile(profile.id)}
                    >
                      <div className="truncate text-[13px] font-medium text-slate-900">
                        {profile.name}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {profile.username}@{profile.host}:{profile.port}
                      </div>
                    </button>
                    <button
                      className="icon-button size-7 opacity-60 group-hover:opacity-100"
                      onClick={() => openProfileEditor(profile.id)}
                      title="设置"
                    >
                      <Settings2 size={14} />
                    </button>
                    <button
                      className="icon-button size-7 text-red-600 opacity-60 group-hover:opacity-100 hover:bg-red-50"
                      onClick={() => setDeleteId(profile.id)}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
            <DropdownMenu.Item
              className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-[13px] font-medium text-sky-700 outline-none data-[highlighted]:bg-sky-50"
              onSelect={openNewProfile}
            >
              <Plus size={15} />
              新建预设
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="删除账号预设"
        message={`确定删除“${deleteTarget?.name ?? ''}”吗？已保存的密码和私钥口令也会一并删除。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (deleteId) void removeProfile(deleteId)
        }}
      />
    </>
  )
}
