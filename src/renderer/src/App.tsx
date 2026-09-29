import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useAppStore } from '@renderer/store/useAppStore'
import { ConflictDialog } from './components/ConflictDialog'
import { FileManager } from './components/FileManager'
import { NoticeToast } from './components/NoticeToast'
import { ProfileDialog } from './components/ProfileDialog'
import { TopBar } from './components/TopBar'
import { TransferPanel } from './components/TransferPanel'
import { WorkspaceGate } from './components/WorkspaceGate'

export function App(): React.JSX.Element {
  const initialized = useAppStore((state) => state.initialized)
  const workspace = useAppStore((state) => state.workspace)
  const initialize = useAppStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center bg-[#eef1f4] text-slate-500">
        <LoaderCircle className="animate-spin" size={22} />
      </div>
    )
  }

  if (!workspace?.directory) {
    return (
      <>
        <WorkspaceGate />
        <ProfileDialog />
        <NoticeToast />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#eef1f4]">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col">
        <FileManager />
        <TransferPanel />
      </div>
      <ProfileDialog />
      <ConflictDialog />
      <NoticeToast />
    </div>
  )
}
