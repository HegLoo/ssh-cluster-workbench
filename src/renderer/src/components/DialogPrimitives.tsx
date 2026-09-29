import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  widthClass?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  widthClass = 'max-w-2xl'
}: ModalProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px]" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 z-50 max-h-[88vh] w-[calc(100vw-48px)] ${widthClass} -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl outline-none`}
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-slate-950">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[12px] text-slate-500">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button -mt-1 -mr-1" aria-label="关闭">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>
          <div className="max-h-[calc(88vh-132px)] overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm(): void
  onOpenChange(open: boolean): void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onOpenChange
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      widthClass="max-w-md"
      footer={
        <>
          <button className="button-secondary" onClick={() => onOpenChange(false)}>
            取消
          </button>
          <button
            className={`inline-flex h-9 items-center justify-center rounded-md px-3.5 text-[13px] font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'}`}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3 text-[13px] leading-6 text-slate-700">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={19} />
        <p className="m-0">{message}</p>
      </div>
    </Modal>
  )
}

interface PromptDialogProps {
  open: boolean
  title: string
  label: string
  initialValue?: string
  confirmLabel?: string
  onConfirm(value: string): void
  onOpenChange(open: boolean): void
}

export function PromptDialog({
  open,
  title,
  label,
  initialValue = '',
  confirmLabel = '确定',
  onConfirm,
  onOpenChange
}: PromptDialogProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      widthClass="max-w-md"
      footer={
        <>
          <button className="button-secondary" onClick={() => onOpenChange(false)}>
            取消
          </button>
          <button className="button-primary" type="submit" form="prompt-form">
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        id="prompt-form"
        onSubmit={(event) => {
          event.preventDefault()
          const value = String(new FormData(event.currentTarget).get('value') ?? '').trim()
          if (!value) return
          onConfirm(value)
          onOpenChange(false)
        }}
      >
        <label className="field-label" htmlFor="prompt-value">
          {label}
        </label>
        <input
          id="prompt-value"
          name="value"
          className="text-field"
          defaultValue={initialValue}
          autoFocus
        />
      </form>
    </Modal>
  )
}
