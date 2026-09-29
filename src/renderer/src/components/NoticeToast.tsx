import { useEffect } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useAppStore } from '@renderer/store/useAppStore'

export function NoticeToast(): React.JSX.Element | null {
  const notice = useAppStore((state) => state.notice)
  const clearNotice = useAppStore((state) => state.clearNotice)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(clearNotice, notice.type === 'error' ? 6500 : 3500)
    return () => window.clearTimeout(timer)
  }, [notice, clearNotice])

  if (!notice) return null
  const Icon = notice.type === 'success' ? CheckCircle2 : notice.type === 'info' ? Info : XCircle
  const color =
    notice.type === 'success'
      ? 'text-emerald-600'
      : notice.type === 'info'
        ? 'text-sky-600'
        : 'text-red-600'

  return (
    <div className="fixed top-5 right-5 z-[80] flex max-w-md items-start gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-xl">
      <Icon className={`mt-0.5 shrink-0 ${color}`} size={18} />
      <div className="min-w-0 flex-1 text-[13px] leading-5 whitespace-pre-wrap text-slate-700">
        {notice.message}
      </div>
      <button
        className="icon-button -mt-1 -mr-2 size-7"
        onClick={clearNotice}
        aria-label="关闭通知"
      >
        <X size={15} />
      </button>
    </div>
  )
}
