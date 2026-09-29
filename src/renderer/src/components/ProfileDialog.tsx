import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { FileKey2, ShieldCheck } from 'lucide-react'
import type {
  AdvancedSshOptions,
  ConnectionProfileDraft,
  ProfileSaveRequest,
  SecretKey,
  SecretPayload
} from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { Modal } from './DialogPrimitives'

const EXTRA_PARAMETER_KEYS = new Set([
  'readyTimeout',
  'keepaliveInterval',
  'keepaliveCountMax',
  'forceIPv4',
  'forceIPv6'
])

export function ProfileDialog(): React.JSX.Element {
  const profileDialog = useAppStore((state) => state.profileDialog)
  if (!profileDialog.open) return <></>
  return (
    <ProfileDialogContent key={profileDialog.draft.id ?? 'new'} profileDialog={profileDialog} />
  )
}

interface ProfileDialogContentProps {
  profileDialog: {
    draft: ConnectionProfileDraft
    hasPassword: boolean
    hasPassphrase: boolean
    hasJumpPassword: boolean
    hasJumpPassphrase: boolean
  }
}

function ProfileDialogContent({ profileDialog }: ProfileDialogContentProps): React.JSX.Element {
  const closeProfileDialog = useAppStore((state) => state.closeProfileDialog)
  const saveProfile = useAppStore((state) => state.saveProfile)
  const [form, setForm] = useState<ConnectionProfileDraft>(() =>
    structuredClone(profileDialog.draft)
  )
  const [secrets, setSecrets] = useState<SecretPayload>({})
  const [removeSecrets, setRemoveSecrets] = useState<SecretKey[]>([])
  const [extraText, setExtraText] = useState(() =>
    Object.entries(profileDialog.draft.advanced.extra)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
  )

  const title = profileDialog.draft.id ? '设置账号预设' : '新建账号预设'
  const canSave = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.host.trim().length > 0 &&
      form.username.trim().length > 0 &&
      (form.authType === 'password' || form.privateKeyPath.trim().length > 0),
    [form]
  )

  const updateAdvanced = <K extends keyof AdvancedSshOptions>(
    key: K,
    value: AdvancedSshOptions[K]
  ): void => {
    setForm((current) => ({
      ...current,
      advanced: { ...current.advanced, [key]: value }
    }))
  }

  const updateSecret = (key: SecretKey, value: string): void => {
    setSecrets((current) => ({ ...current, [key]: value }))
    if (value) setRemoveSecrets((current) => current.filter((item) => item !== key))
  }

  const toggleRemoveSecret = (key: SecretKey, checked: boolean): void => {
    setRemoveSecrets((current) =>
      checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)
    )
    if (checked) setSecrets((current) => ({ ...current, [key]: '' }))
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (!canSave) return
    const extra = parseExtraParameters(extraText)
    const request: ProfileSaveRequest = {
      profile: {
        ...form,
        name: form.name.trim(),
        host: form.host.trim(),
        username: form.username.trim(),
        privateKeyPath: form.privateKeyPath.trim(),
        remoteStartDir: form.remoteStartDir.trim() || '~',
        advanced: { ...form.advanced, extra }
      },
      secrets,
      removeSecrets
    }
    void saveProfile(request)
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && closeProfileDialog()}
      title={title}
      description="保存连接地址、认证方式和高级 SSH 参数"
      widthClass="max-w-4xl"
      footer={
        <>
          <button className="button-secondary" type="button" onClick={closeProfileDialog}>
            取消
          </button>
          <button className="button-primary" type="submit" form="profile-form" disabled={!canSave}>
            保存
          </button>
        </>
      }
    >
      <form id="profile-form" onSubmit={handleSubmit}>
        <Tabs.Root defaultValue="common">
          <Tabs.List className="mb-4 inline-flex rounded-md bg-slate-100 p-1">
            <Tabs.Trigger
              value="common"
              className="rounded px-4 py-1.5 text-[12px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
            >
              常用
            </Tabs.Trigger>
            <Tabs.Trigger
              value="advanced"
              className="rounded px-4 py-1.5 text-[12px] font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
            >
              高级
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="common" className="outline-none">
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
              <Field label="预设名称">
                <input
                  className="text-field"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  autoFocus
                />
              </Field>
              <Field label="端口">
                <input
                  className="text-field"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
                />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
              <Field label="主机">
                <input
                  className="text-field"
                  value={form.host}
                  onChange={(event) => setForm({ ...form, host: event.target.value })}
                  placeholder="cluster.example.edu"
                />
              </Field>
              <Field label="用户名">
                <input
                  className="text-field"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4">
              <span className="field-label">认证方式</span>
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-1">
                <AuthButton
                  active={form.authType === 'password'}
                  icon={<ShieldCheck size={14} />}
                  label="密码"
                  onClick={() => setForm({ ...form, authType: 'password' })}
                />
                <AuthButton
                  active={form.authType === 'privateKey'}
                  icon={<FileKey2 size={14} />}
                  label="私钥"
                  onClick={() => setForm({ ...form, authType: 'privateKey' })}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {form.authType === 'password' ? (
                <SecretField
                  label="密码"
                  hasSaved={profileDialog.hasPassword}
                  value={secrets.password ?? ''}
                  remove={removeSecrets.includes('password')}
                  onChange={(value) => updateSecret('password', value)}
                  onRemove={(checked) => toggleRemoveSecret('password', checked)}
                />
              ) : (
                <>
                  <Field label="私钥文件">
                    <div className="flex gap-2">
                      <input
                        className="text-field min-w-0"
                        value={form.privateKeyPath}
                        onChange={(event) =>
                          setForm({ ...form, privateKeyPath: event.target.value })
                        }
                      />
                      <button
                        className="button-secondary shrink-0"
                        type="button"
                        onClick={() =>
                          void choosePrivateKey((value) =>
                            setForm({ ...form, privateKeyPath: value })
                          )
                        }
                      >
                        选择
                      </button>
                    </div>
                  </Field>
                  <SecretField
                    label="私钥口令"
                    hasSaved={profileDialog.hasPassphrase}
                    value={secrets.passphrase ?? ''}
                    remove={removeSecrets.includes('passphrase')}
                    onChange={(value) => updateSecret('passphrase', value)}
                    onRemove={(checked) => toggleRemoveSecret('passphrase', checked)}
                  />
                </>
              )}
            </div>
            <div className="mt-3">
              <Field label="远端起始目录">
                <input
                  className="text-field font-mono"
                  value={form.remoteStartDir}
                  onChange={(event) => setForm({ ...form, remoteStartDir: event.target.value })}
                  placeholder="~"
                />
              </Field>
            </div>
          </Tabs.Content>

          <Tabs.Content value="advanced" className="outline-none">
            <section className="rounded-md border border-slate-200 p-4">
              <div className="mb-3 text-[13px] font-semibold text-slate-800">跳板机</div>
              <div className="grid grid-cols-[minmax(0,1.5fr)_100px_minmax(0,1fr)] gap-3">
                <Field label="主机">
                  <input
                    className="text-field"
                    value={form.advanced.jumpHost}
                    onChange={(event) => updateAdvanced('jumpHost', event.target.value)}
                  />
                </Field>
                <Field label="端口">
                  <input
                    className="text-field"
                    type="number"
                    value={form.advanced.jumpPort}
                    onChange={(event) => updateAdvanced('jumpPort', Number(event.target.value))}
                  />
                </Field>
                <Field label="用户名">
                  <input
                    className="text-field"
                    value={form.advanced.jumpUsername}
                    onChange={(event) => updateAdvanced('jumpUsername', event.target.value)}
                  />
                </Field>
              </div>
              {form.advanced.jumpHost ? (
                <>
                  <div className="mt-3 inline-flex rounded-md border border-slate-300 bg-slate-50 p-1">
                    <AuthButton
                      active={form.advanced.jumpAuthType === 'password'}
                      icon={<ShieldCheck size={14} />}
                      label="密码"
                      onClick={() => updateAdvanced('jumpAuthType', 'password')}
                    />
                    <AuthButton
                      active={form.advanced.jumpAuthType === 'privateKey'}
                      icon={<FileKey2 size={14} />}
                      label="私钥"
                      onClick={() => updateAdvanced('jumpAuthType', 'privateKey')}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {form.advanced.jumpAuthType === 'password' ? (
                      <SecretField
                        label="跳板机密码"
                        hasSaved={profileDialog.hasJumpPassword}
                        value={secrets.jumpPassword ?? ''}
                        remove={removeSecrets.includes('jumpPassword')}
                        onChange={(value) => updateSecret('jumpPassword', value)}
                        onRemove={(checked) => toggleRemoveSecret('jumpPassword', checked)}
                      />
                    ) : (
                      <>
                        <Field label="跳板机私钥">
                          <div className="flex gap-2">
                            <input
                              className="text-field min-w-0"
                              value={form.advanced.jumpPrivateKeyPath}
                              onChange={(event) =>
                                updateAdvanced('jumpPrivateKeyPath', event.target.value)
                              }
                            />
                            <button
                              className="button-secondary shrink-0"
                              type="button"
                              onClick={() =>
                                void choosePrivateKey((value) =>
                                  updateAdvanced('jumpPrivateKeyPath', value)
                                )
                              }
                            >
                              选择
                            </button>
                          </div>
                        </Field>
                        <SecretField
                          label="跳板机私钥口令"
                          hasSaved={profileDialog.hasJumpPassphrase}
                          value={secrets.jumpPassphrase ?? ''}
                          remove={removeSecrets.includes('jumpPassphrase')}
                          onChange={(value) => updateSecret('jumpPassphrase', value)}
                          onRemove={(checked) => toggleRemoveSecret('jumpPassphrase', checked)}
                        />
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </section>

            <section className="mt-3 grid grid-cols-3 gap-3 rounded-md border border-slate-200 p-4">
              <Field label="连接超时（毫秒）">
                <input
                  className="text-field"
                  type="number"
                  value={form.advanced.connectTimeoutMs}
                  onChange={(event) =>
                    updateAdvanced('connectTimeoutMs', Number(event.target.value))
                  }
                />
              </Field>
              <Field label="KeepAlive 间隔（毫秒）">
                <input
                  className="text-field"
                  type="number"
                  value={form.advanced.keepaliveIntervalMs}
                  onChange={(event) =>
                    updateAdvanced('keepaliveIntervalMs', Number(event.target.value))
                  }
                />
              </Field>
              <Field label="KeepAlive 次数">
                <input
                  className="text-field"
                  type="number"
                  value={form.advanced.keepaliveCountMax}
                  onChange={(event) =>
                    updateAdvanced('keepaliveCountMax', Number(event.target.value))
                  }
                />
              </Field>
            </section>

            <section className="mt-3 rounded-md border border-slate-200 p-4">
              <div className="grid grid-cols-2 gap-3">
                <SwitchField
                  label="压缩传输"
                  checked={form.advanced.compress}
                  onChange={(checked) => updateAdvanced('compress', checked)}
                />
                <SwitchField
                  label="严格校验主机指纹"
                  checked={form.advanced.strictHostKey}
                  onChange={(checked) => updateAdvanced('strictHostKey', checked)}
                />
                <SwitchField
                  label="仅使用 IPv4"
                  checked={form.advanced.forceIPv4}
                  onChange={(checked) => updateAdvanced('forceIPv4', checked)}
                />
                <SwitchField
                  label="仅使用 IPv6"
                  checked={form.advanced.forceIPv6}
                  onChange={(checked) => updateAdvanced('forceIPv6', checked)}
                />
              </div>
            </section>

            <section className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-slate-200 p-4">
              <AlgorithmField
                label="KEX"
                values={form.advanced.algorithms.kex}
                onChange={(values) =>
                  updateAdvanced('algorithms', { ...form.advanced.algorithms, kex: values })
                }
              />
              <AlgorithmField
                label="Cipher"
                values={form.advanced.algorithms.cipher}
                onChange={(values) =>
                  updateAdvanced('algorithms', { ...form.advanced.algorithms, cipher: values })
                }
              />
              <AlgorithmField
                label="Host Key"
                values={form.advanced.algorithms.serverHostKey}
                onChange={(values) =>
                  updateAdvanced('algorithms', {
                    ...form.advanced.algorithms,
                    serverHostKey: values
                  })
                }
              />
              <AlgorithmField
                label="HMAC"
                values={form.advanced.algorithms.hmac}
                onChange={(values) =>
                  updateAdvanced('algorithms', { ...form.advanced.algorithms, hmac: values })
                }
              />
            </section>

            <section className="mt-3 rounded-md border border-slate-200 p-4">
              <Field label="附加参数（每行 key=value）">
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={extraText}
                  onChange={(event) => setExtraText(event.target.value)}
                  placeholder={'readyTimeout=20000\nkeepaliveInterval=30000'}
                />
              </Field>
            </section>
          </Tabs.Content>
        </Tabs.Root>
      </form>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function AuthButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick(): void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-[12px] font-medium ${
        active ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function SecretField({
  label,
  hasSaved,
  value,
  remove,
  onChange,
  onRemove
}: {
  label: string
  hasSaved: boolean
  value: string
  remove: boolean
  onChange(value: string): void
  onRemove(checked: boolean): void
}): React.JSX.Element {
  return (
    <div>
      <Field label={label}>
        <div className="relative">
          <input
            className="text-field pr-20"
            type="password"
            value={value}
            disabled={remove}
            onChange={(event) => onChange(event.target.value)}
            placeholder={hasSaved ? '已安全保存' : ''}
          />
          {hasSaved ? (
            <span className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              已保存
            </span>
          ) : null}
        </div>
      </Field>
      {hasSaved ? (
        <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
          <input
            type="checkbox"
            className="accent-red-600"
            checked={remove}
            onChange={(event) => onRemove(event.target.checked)}
          />
          清除已保存的{label}
        </label>
      ) : null}
    </div>
  )
}

function SwitchField({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}): React.JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
      <span>{label}</span>
      <input
        type="checkbox"
        className="size-4 accent-sky-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

function AlgorithmField({
  label,
  values,
  onChange
}: {
  label: string
  values: string[]
  onChange(values: string[]): void
}): React.JSX.Element {
  return (
    <Field label={`${label}（逗号分隔）`}>
      <input
        className="text-field font-mono text-[12px]"
        value={values.join(', ')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          )
        }
      />
    </Field>
  )
}

function parseExtraParameters(value: string): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    if (!EXTRA_PARAMETER_KEYS.has(key)) continue
    const raw = trimmed.slice(separator + 1).trim()
    if (raw === 'true' || raw === 'false') result[key] = raw === 'true'
    else if (raw !== '' && Number.isFinite(Number(raw))) result[key] = Number(raw)
    else result[key] = raw
  }
  return result
}

async function choosePrivateKey(onSelected: (value: string) => void): Promise<void> {
  const path = await window.desktop.dialog.choosePrivateKey()
  if (path) onSelected(path)
}
