import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDownAZ,
  ArrowDownUp,
  ArrowUpAZ,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderPlus,
  Home,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  Upload
} from 'lucide-react'
import type { RemoteEntry } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { ConfirmDialog, PromptDialog } from './DialogPrimitives'

type SortKey = 'name' | 'size' | 'modifiedAt'
type SortDirection = 'asc' | 'desc'

interface PromptState {
  kind: 'newFolder' | 'rename'
  entry?: RemoteEntry
}

export function FileManager(): React.JSX.Element {
  const directory = useAppStore((state) => state.directory)
  const connection = useAppStore((state) => state.connection)
  const busy = useAppStore((state) => state.busy)
  const navigate = useAppStore((state) => state.navigate)
  const goBack = useAppStore((state) => state.goBack)
  const goForward = useAppStore((state) => state.goForward)
  const goUp = useAppStore((state) => state.goUp)
  const refresh = useAppStore((state) => state.refresh)
  const createFolder = useAppStore((state) => state.createFolder)
  const rename = useAppStore((state) => state.rename)
  const removePaths = useAppStore((state) => state.removePaths)
  const upload = useAppStore((state) => state.upload)
  const download = useAppStore((state) => state.download)
  const showNotice = useAppStore((state) => state.showNotice)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [showHidden, setShowHidden] = useState(true)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [preparingDrag, setPreparingDrag] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const currentPath = directory?.path ?? '~'

  const entries = useMemo(() => {
    const source = (directory?.entries ?? []).filter(
      (entry) => showHidden || !entry.name.startsWith('.')
    )
    return [...source].sort((left, right) => {
      if (left.type === 'directory' && right.type !== 'directory') return -1
      if (left.type !== 'directory' && right.type === 'directory') return 1
      let comparison: number
      if (sortKey === 'name') {
        comparison = left.name.localeCompare(right.name, 'zh-CN', {
          numeric: true,
          sensitivity: 'base'
        })
      } else if (sortKey === 'size') comparison = left.size - right.size
      else comparison = (left.modifiedAt ?? 0) - (right.modifiedAt ?? 0)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [directory?.entries, showHidden, sortDirection, sortKey])

  // TanStack Virtual exposes imperative helpers by design; suppress React Compiler's conservative warning.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 18
  })
  const selectedEntries = entries.filter((entry) => selected.has(entry.path))

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) setSortDirection((value) => (value === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const selectEntry = (
    entry: RemoteEntry,
    index: number,
    additive: boolean,
    range: boolean
  ): void => {
    if (range && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      setSelected(new Set(entries.slice(start, end + 1).map((item) => item.path)))
      return
    }
    setLastSelectedIndex(index)
    if (additive) {
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(entry.path)) next.delete(entry.path)
        else next.add(entry.path)
        return next
      })
    } else {
      setSelected(new Set([entry.path]))
    }
  }

  const openEntry = (entry: RemoteEntry): void => {
    if (entry.type === 'directory') void navigate(entry.path)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
    if (!connectionBelongsToDirectory(connection.profileId, directory?.path)) return
    const paths = [...event.dataTransfer.files]
      .map((file) => window.desktop.files.pathFor(file))
      .filter(Boolean)
    if (paths.length > 0) void upload(paths)
  }

  const handleDragOut = async (
    event: DragEvent<HTMLDivElement>,
    entry: RemoteEntry
  ): Promise<void> => {
    event.preventDefault()
    if (preparingDrag) return
    setPreparingDrag(entry.path)
    try {
      const payload = await window.desktop.sftp.prepareDrag([entry.path])
      await window.desktop.sftp.startDrag(payload.localPaths)
    } catch (error) {
      showNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setPreparingDrag(null)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Delete' && selectedEntries.length > 0) setConfirmDelete(true)
    if (event.key === 'F5') void refresh()
  }

  const connected = connection.state === 'connected'

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 px-2">
        <button className="icon-button" onClick={goBack} disabled={!connected || busy} title="后退">
          <ChevronRight className="rotate-180" size={16} />
        </button>
        <button
          className="icon-button"
          onClick={goForward}
          disabled={!connected || busy}
          title="前进"
        >
          <ChevronRight size={16} />
        </button>
        <button
          className="icon-button"
          onClick={goUp}
          disabled={!connected || busy}
          title="上级目录"
        >
          <ArrowDownUp size={15} />
        </button>
        <button
          className="icon-button"
          onClick={() => void navigate(directory?.homePath ?? '~')}
          disabled={!connected || busy}
          title="家目录"
        >
          <Home size={15} />
        </button>
        <button
          className="icon-button"
          onClick={() => void refresh()}
          disabled={!connected || busy}
          title="刷新"
        >
          <RefreshCw className={busy ? 'animate-spin' : ''} size={15} />
        </button>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <Breadcrumbs
          path={currentPath}
          onNavigate={(path) => void navigate(path)}
          disabled={!connected}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            className="icon-button"
            onClick={() => setShowHidden((value) => !value)}
            title={showHidden ? '隐藏隐藏文件' : '显示隐藏文件'}
          >
            {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            className="icon-button"
            onClick={() => setPrompt({ kind: 'newFolder' })}
            disabled={!connected}
            title="新建文件夹"
          >
            <FolderPlus size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={!connected}
            title="上传"
          >
            <Upload size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => void download(selectedEntries.map((entry) => entry.path))}
            disabled={!connected || selectedEntries.length === 0}
            title="下载"
          >
            <Download size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              const entry = selectedEntries[0]
              if (selectedEntries.length === 1 && entry) setPrompt({ kind: 'rename', entry })
            }}
            disabled={selectedEntries.length !== 1}
            title="重命名"
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
            disabled={selectedEntries.length === 0}
            title="删除"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="grid h-9 shrink-0 grid-cols-[minmax(220px,1fr)_100px_155px_105px] border-b border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-500">
        <SortHeader
          label="名称"
          active={sortKey === 'name'}
          direction={sortDirection}
          onClick={() => handleSort('name')}
        />
        <SortHeader
          label="大小"
          active={sortKey === 'size'}
          direction={sortDirection}
          onClick={() => handleSort('size')}
        />
        <SortHeader
          label="修改时间"
          active={sortKey === 'modifiedAt'}
          direction={sortDirection}
          onClick={() => handleSort('modifiedAt')}
        />
        <div className="flex items-center">权限</div>
      </div>

      <div
        ref={scrollRef}
        className={`relative min-h-0 flex-1 overflow-auto outline-none ${dragActive ? 'bg-sky-50 ring-2 ring-sky-400 ring-inset' : ''}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragActive(false)
        }}
        onDrop={handleDrop}
      >
        {!connected ? (
          <EmptyState
            icon={<Folder size={28} />}
            title="尚未连接集群"
            description="选择预设并连接后显示远端目录"
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={busy ? <LoaderCircle className="animate-spin" size={26} /> : <Folder size={28} />}
            title={busy ? '正在读取目录' : '当前目录为空'}
            description={directory?.path ?? ''}
          />
        ) : (
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = entries[virtualItem.index]
              if (!entry) return null
              const isSelected = selected.has(entry.path)
              return (
                <ContextMenu.Root key={entry.path}>
                  <ContextMenu.Trigger asChild>
                    <div
                      className={`absolute top-0 left-0 grid h-9 w-full cursor-default grid-cols-[minmax(220px,1fr)_100px_155px_105px] items-center border-b border-slate-100 px-3 text-[12px] ${
                        isSelected ? 'bg-sky-50 text-sky-950' : 'hover:bg-slate-50'
                      }`}
                      style={{ transform: `translateY(${virtualItem.start}px)` }}
                      draggable
                      onDragStart={(event) => void handleDragOut(event, entry)}
                      onClick={(event) =>
                        selectEntry(
                          entry,
                          virtualItem.index,
                          event.ctrlKey || event.metaKey,
                          event.shiftKey
                        )
                      }
                      onDoubleClick={() => openEntry(entry)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {entry.type === 'directory' ? (
                          <Folder
                            className="shrink-0 text-amber-500"
                            size={16}
                            fill="currentColor"
                          />
                        ) : entry.type === 'symlink' ? (
                          <ChevronRight className="shrink-0 text-violet-500" size={15} />
                        ) : (
                          <File className="shrink-0 text-slate-400" size={15} />
                        )}
                        <span className="truncate" title={entry.name}>
                          {entry.name}
                        </span>
                        {preparingDrag === entry.path ? (
                          <LoaderCircle className="ml-auto animate-spin text-sky-600" size={13} />
                        ) : null}
                      </div>
                      <div className="text-slate-500">
                        {entry.type === 'directory' ? '—' : formatBytes(entry.size)}
                      </div>
                      <div className="text-slate-500">{formatDate(entry.modifiedAt)}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {entry.permissions}
                      </div>
                    </div>
                  </ContextMenu.Trigger>
                  <EntryContextMenu
                    entry={entry}
                    onOpen={() => openEntry(entry)}
                    onDownload={() => void download([entry.path])}
                    onRename={() => setPrompt({ kind: 'rename', entry })}
                    onDelete={() => {
                      setSelected(new Set([entry.path]))
                      setConfirmDelete(true)
                    }}
                  />
                </ContextMenu.Root>
              )
            })}
          </div>
        )}
      </div>

      <input
        ref={uploadInputRef}
        className="hidden"
        type="file"
        multiple
        onChange={(event) => {
          const paths = [...(event.target.files ?? [])]
            .map((file) => window.desktop.files.pathFor(file))
            .filter(Boolean)
          if (paths.length > 0) void upload(paths)
          event.target.value = ''
        }}
      />

      <PromptDialog
        open={Boolean(prompt)}
        onOpenChange={(open) => !open && setPrompt(null)}
        title={prompt?.kind === 'rename' ? '重命名' : '新建文件夹'}
        label={prompt?.kind === 'rename' ? '新名称' : '文件夹名称'}
        initialValue={prompt?.entry?.name ?? ''}
        onConfirm={(value) => {
          if (!prompt) return
          if (prompt.kind === 'newFolder') void createFolder(value)
          else if (prompt.entry) {
            const parent = prompt.entry.path.slice(0, prompt.entry.path.lastIndexOf('/')) || '/'
            void rename(prompt.entry.path, `${parent.replace(/\/$/, '')}/${value}`)
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="删除远端项目"
        message={
          selectedEntries.length === 1
            ? `确定删除“${selectedEntries[0]?.name ?? ''}”吗？目录会连同其中的内容一起删除。`
            : `确定删除选中的 ${selectedEntries.length} 个项目吗？目录会连同其中的内容一起删除。`
        }
        confirmLabel="删除"
        danger
        onConfirm={() => void removePaths(selectedEntries.map((entry) => entry.path))}
      />
    </section>
  )
}

function SortHeader({
  label,
  active,
  direction,
  onClick
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick(): void
}): React.JSX.Element {
  const Icon = active ? (direction === 'asc' ? ArrowDownAZ : ArrowUpAZ) : ArrowDownUp
  return (
    <button
      className={`flex items-center gap-1 text-left hover:text-slate-800 ${active ? 'text-slate-800' : ''}`}
      onClick={onClick}
    >
      {label}
      <Icon size={12} />
    </button>
  )
}

function Breadcrumbs({
  path,
  onNavigate,
  disabled
}: {
  path: string
  onNavigate(path: string): void
  disabled: boolean
}): React.JSX.Element {
  const parts = path.split('/').filter(Boolean)
  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
      <button
        className="shrink-0 rounded px-1.5 text-[12px] text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
        onClick={() => onNavigate('/')}
        disabled={disabled}
      >
        /
      </button>
      {parts.map((part, index) => {
        const target = `/${parts.slice(0, index + 1).join('/')}`
        return (
          <div key={target} className="flex min-w-0 items-center">
            <ChevronRight className="shrink-0 text-slate-400" size={12} />
            <button
              className="truncate rounded px-1.5 py-0.5 text-[12px] text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
              onClick={() => onNavigate(target)}
              disabled={disabled}
              title={part}
            >
              {part}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function EntryContextMenu({
  entry,
  onOpen,
  onDownload,
  onRename,
  onDelete
}: {
  entry: RemoteEntry
  onOpen(): void
  onDownload(): void
  onRename(): void
  onDelete(): void
}): React.JSX.Element {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 min-w-40 rounded-md border border-slate-300 bg-white p-1 shadow-xl">
        {entry.type === 'directory' ? (
          <ContextMenu.Item className={menuItemClass} onSelect={onOpen}>
            <Folder size={14} /> 打开
          </ContextMenu.Item>
        ) : null}
        <ContextMenu.Item className={menuItemClass} onSelect={onDownload}>
          <Download size={14} /> 下载
        </ContextMenu.Item>
        <ContextMenu.Item className={menuItemClass} onSelect={onRename}>
          <Pencil size={14} /> 重命名
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-slate-200" />
        <ContextMenu.Item
          className={`${menuItemClass} text-red-600 data-[highlighted]:bg-red-50`}
          onSelect={onDelete}
        >
          <Trash2 size={14} /> 删除
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}

const menuItemClass =
  'flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[12px] text-slate-700 outline-none data-[highlighted]:bg-slate-100'

function EmptyState({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center px-8 text-center text-slate-400">
      {icon}
      <div className="mt-3 text-[13px] font-medium text-slate-600">{title}</div>
      <div className="mt-1 max-w-md truncate text-[12px]">{description}</div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function formatDate(value: number | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function connectionBelongsToDirectory(profileId: string | null, path: string | undefined): boolean {
  return Boolean(profileId && path)
}
