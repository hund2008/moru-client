import { useEffect, useRef, useState } from 'react'
import type {
  ProfileSettingsInfo,
  ProfileSettingsResult
} from '../../../shared/profile-settings'

type Profile = {
  id: string
  name: string
}

type Props = {
  open: boolean
  profile: Profile
  ko: boolean
  locked: boolean
  onClose: () => void
  onDelete: (
    confirmation: string
  ) => Promise<string | null>
}

const invoke = <T,>(
  channel: string,
  ...args: unknown[]
): Promise<T> =>
  window.electron.ipcRenderer.invoke(
    channel,
    ...args
  ) as Promise<T>

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`

  const units = ['KB', 'MB', 'GB', 'TB']

  let size = value / 1024
  let index = 0

  while (
    size >= 1024 &&
    index < units.length - 1
  ) {
    size /= 1024
    index++
  }

  return `${size.toFixed(2)} ${units[index]}`
}

export default function ProfileSettingsDialog({
  open,
  profile,
  ko,
  locked,
  onClose,
  onDelete
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [info, setInfo] =
    useState<ProfileSettingsInfo | null>(null)
  const [memory, setMemory] = useState('')
  const [jvmArgs, setJvmArgs] = useState('')
  const [description, setDescription] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const working = useRef(false)

  const protectedProfile =
    profile.id === 'moru-default'

  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal()
    }

    if (!open) dialog.current?.close()
  }, [open])

  useEffect(() => {
    if (!open) return

    let alive = true

    setInfo(null)
    setLoading(true)
    setMessage('')
    setFailed(false)
    setConfirmation('')

    void invoke<ProfileSettingsInfo>(
      'profile-settings:info',
      profile.id
    )
      .then(value => {
        if (!alive) return

        setInfo(value)
        setMemory(String(value.settings.memoryMb))
        setJvmArgs(value.settings.jvmArgs)
        setDescription(value.settings.description)
      })
      .catch(() => {
        if (alive) {
          setFailed(true)
          setMessage(
            ko
              ? '프로필 정보를 읽지 못했습니다. 다시 시도해 주세요.'
              : 'Could not read profile settings. Try again.'
          )
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [open, profile.id, ko, retry])

  const errorMessage = (code: string) =>
    ko
      ? code === 'BUSY'
        ? '게임 실행과 다운로드가 끝난 뒤 이용해 주세요.'
        : code === 'JVM_ARGS'
          ? 'JVM 인수를 확인해 주세요. 메모리 인수는 위의 메모리 설정을 사용하고, 값이 필요한 옵션은 =로 연결해 주세요.'
          : '작업을 완료하지 못했습니다. 입력 값과 파일 상태를 확인해 주세요.'
      : code === 'BUSY'
        ? 'Finish the game and downloads first.'
        : code === 'JVM_ARGS'
          ? 'Check JVM arguments. Use the memory setting above and join option values with =.'
          : 'Could not complete the action. Check settings and files.'

  async function save() {
    if (working.current || locked || !info) return

    const value = Number(memory)

    if (
      !/^\d+$/.test(memory) ||
      !Number.isInteger(value) ||
      value < info.minMemoryMb ||
      value > info.maxMemoryMb
    ) {
      setFailed(true)
      setMessage(
        ko
          ? '표시된 범위 안에서 메모리를 입력해 주세요.'
          : 'Enter memory within the displayed range.'
      )
      return
    }

    working.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)

    try {
      const result =
        await invoke<ProfileSettingsResult>(
          'profile-settings:save',
          profile.id,
          {
            memoryMb: value,
            jvmArgs,
            description
          }
        )

      if (!result.ok) {
        setFailed(true)
        setMessage(errorMessage(result.code))
        return
      }

      setMessage(
        ko
          ? '저장했습니다. 다음 프로필 실행부터 적용됩니다.'
          : 'Saved. Applies the next time this profile starts.'
      )
    } catch {
      setFailed(true)
      setMessage(errorMessage('FAILED'))
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function remove() {
    if (
      working.current ||
      locked ||
      protectedProfile ||
      confirmation !== profile.name
    ) {
      return
    }

    working.current = true
    setBusy(true)
    setMessage('')
    setFailed(false)

    try {
      const error = await onDelete(confirmation)

      if (error) {
        setFailed(true)
        setMessage(error)
      } else {
        onClose()
      }
    } catch {
      setFailed(true)
      setMessage(errorMessage('FAILED'))
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="settings-dialog moru-profile-settings"
      aria-labelledby="profile-settings-title"
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <style>{`
        .moru-profile-settings {
          width: min(760px, 94vw) !important;
          height: min(780px, 88vh) !important;
          max-width: none;
          padding: 0;
          border: 1px solid var(--moru-border, #41614f);
          border-radius: 20px;
          background: var(--moru-panel, #17271f);
          color: var(--moru-text, #edf5f1);
          overflow: visible;
          font: inherit;
        }

        .moru-profile-settings[open] {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
        }

        .moru-profile-settings .profile-settings-body {
          overflow: auto;
          padding: 22px;
          display: grid;
          gap: 16px;
          min-height: 0;
        }

        .moru-profile-settings .profile-settings-card {
          min-width: 0;
          padding: 18px;
          border: 1px solid var(--moru-border, #355141);
          border-radius: 14px;
          background: var(--moru-input, #101b15);
          line-height: 1.7;
        }

        .moru-profile-settings h4 {
          margin: 0 0 12px;
        }

        .moru-profile-settings p {
          margin: 8px 0;
        }

        .moru-profile-settings .profile-settings-field {
          display: grid;
          gap: 8px;
          margin: 12px 0;
          color: var(--moru-muted, #b5cbbf);
          font-size: 13px;
        }

        .moru-profile-settings input:not([type=range]),
        .moru-profile-settings textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--moru-border, #41614f);
          border-radius: 10px;
          background: var(--moru-bg, #0d1512);
          color: var(--moru-text, #edf5f1);
          font: inherit;
          box-sizing: border-box;
        }

        .moru-profile-settings textarea {
          resize: vertical;
          min-height: 90px;
        }

        .moru-profile-settings input[type=range] {
          width: 100%;
          accent-color: var(--moru-accent, #49d9a0);
        }

        .moru-profile-settings .profile-settings-path {
          overflow-wrap: anywhere;
          font-size: 12px;
        }

        .moru-profile-settings .profile-settings-danger {
          border-color: #874344;
          background: #29191a;
        }

        .moru-profile-settings .profile-settings-warning {
          color: #ff9a9f;
        }

        .moru-profile-settings .profile-delete-button {
          padding: 10px 16px;
          border: 1px solid #d96970;
          border-radius: 10px;
          background: #87383e;
          color: #fff;
          font: inherit;
          cursor: pointer;
        }

        .moru-profile-settings button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }
      `}</style>

      <header className="settings-heading">
        <div>
          <small>MORU PROFILE</small>
          <h2 id="profile-settings-title">
            {ko ? '프로필 설정' : 'Profile settings'}
          </h2>
          <p className="muted">{profile.name}</p>
        </div>

        <button
          type="button"
          className="ghost"
          disabled={busy}
          aria-label={
            ko
              ? '프로필 설정 닫기'
              : 'Close profile settings'
          }
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="profile-settings-body">
        {loading && (
          <p role="status">
            {ko
              ? '프로필 정보를 불러오는 중…'
              : 'Loading profile information…'}
          </p>
        )}

        {!loading && !info && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setRetry(value => value + 1)
            }
          >
            {ko ? '다시 시도' : 'Retry'}
          </button>
        )}

        {info && (
          <>
            <section className="profile-settings-card">
              <h4>
                {ko ? '메모리 할당량' : 'Memory allocation'}
              </h4>

              <label className="profile-settings-field">
                {ko
                  ? '최대 메모리 (MB)'
                  : 'Maximum memory (MB)'}

                <input
                  type="number"
                  step={1}
                  min={info.minMemoryMb}
                  max={info.maxMemoryMb}
                  value={memory}
                  disabled={busy || locked}
                  onChange={event =>
                    setMemory(event.target.value)
                  }
                />
              </label>

              <input
                type="range"
                aria-label={
                  ko
                    ? '메모리 할당량 조절'
                    : 'Adjust memory allocation'
                }
                min={info.minMemoryMb}
                max={info.maxMemoryMb}
                step={128}
                value={Math.max(
                  info.minMemoryMb,
                  Math.min(
                    info.maxMemoryMb,
                    Number(memory) || info.minMemoryMb
                  )
                )}
                disabled={busy || locked}
                onChange={event =>
                  setMemory(event.target.value)
                }
              />

              <p className="muted">
                {ko
                  ? `입력 범위 ${info.minMemoryMb}~${info.maxMemoryMb} MB · PC 메모리 ${(info.totalMemoryMb / 1024).toFixed(1)} GB`
                  : `Range ${info.minMemoryMb}–${info.maxMemoryMb} MB · System RAM ${(info.totalMemoryMb / 1024).toFixed(1)} GB`}
              </p>

              <p className="inline-note">
                {ko
                  ? '이 프로필에만 적용됩니다. 다른 프로그램을 위해 여유 메모리를 남겨 주세요.'
                  : 'Applies only to this profile. Leave memory available for other applications.'}
              </p>
            </section>

            <section className="profile-settings-card">
              <h4>{ko ? '고급' : 'Advanced'}</h4>

              <label className="profile-settings-field">
                {ko ? 'JVM 인수' : 'JVM arguments'}

                <textarea
                  rows={3}
                  maxLength={8192}
                  value={jvmArgs}
                  disabled={busy || locked}
                  spellCheck={false}
                  placeholder="-XX:+UseG1GC"
                  onChange={event =>
                    setJvmArgs(event.target.value)
                  }
                />
              </label>

              <p className="inline-note">
                {ko
                  ? '선택 사항입니다. 인수는 한 줄에 공백으로 구분하고, 값이 필요한 옵션은 =로 연결하세요. 공백이 있는 값은 따옴표로 감싸 주세요. -Xmx·-Xms는 위 메모리 설정에서 관리합니다.'
                  : 'Optional. Separate arguments with spaces on one line. Join option values with = and quote values containing spaces. Memory flags are managed above.'}
              </p>

              <label className="profile-settings-field">
                {ko
                  ? '프로필 설명 (선택)'
                  : 'Profile description (optional)'}

                <textarea
                  rows={3}
                  maxLength={2000}
                  value={description}
                  disabled={busy || locked}
                  placeholder={
                    ko
                      ? '이 프로필에 대한 메모를 남겨 보세요.'
                      : 'Add a note about this profile.'
                  }
                  onChange={event =>
                    setDescription(event.target.value)
                  }
                />
              </label>
            </section>

            <section className="profile-settings-card">
              <h4>{ko ? '정보' : 'Information'}</h4>

              <p>
                <strong>
                  {ko ? '프로필 용량' : 'Profile size'}
                </strong>
                {' · '}
                {info.sizeComplete
                  ? ''
                  : ko ? '최소 ' : 'At least '}
                {formatBytes(info.bytes)}
              </p>

              <p className="inline-note">
                {ko
                  ? '현재 프로필 폴더의 파일 용량입니다. 다른 프로필과 공유하는 게임 라이브러리·에셋은 제외됩니다.'
                  : 'Files in this profile folder. Shared libraries and assets are excluded.'}
              </p>

              <p>
                <strong>
                  {ko ? '사용 중인 Java' : 'Java runtime'}
                </strong>
              </p>

              <p className="profile-settings-path">
                {info.java?.path ??
                  (ko
                    ? '아직 실행 기록이 없습니다. 실행 시 필요한 Java를 자동으로 선택합니다.'
                    : 'No runtime selected yet. A compatible Java is selected when launching.')}
              </p>

              {info.java && (
                <p className="inline-note">
                  {ko
                    ? '최근 실행 준비에서 선택한 Java 경로입니다. Java 위치 변경은 클라이언트 설정에서 할 수 있습니다.'
                    : 'Java selected during the most recent launch preparation. Change Java locations in Client settings.'}
                </p>
              )}
            </section>

            <section className="profile-settings-card profile-settings-danger">
              <h4>
                {ko
                  ? '주의 · 프로필 삭제'
                  : 'Caution · Delete profile'}
              </h4>

              {protectedProfile ? (
                <p className="profile-settings-warning">
                  {ko
                    ? '기본 MORU 프로필은 삭제할 수 없습니다.'
                    : 'The default MORU profile cannot be deleted.'}
                </p>
              ) : (
                <>
                  <p className="profile-settings-warning">
                    {ko
                      ? '이 프로필의 모드·설정·월드 등 프로필 폴더가 함께 제거됩니다. 필요한 파일은 먼저 백업해 주세요.'
                      : 'The profile folder, including mods, settings and worlds, will be removed. Back up important files first.'}
                  </p>

                  <p className="inline-note">
                    {ko
                      ? '폴더는 휴지통으로 이동합니다. 공용 게임 파일과 다른 프로필은 유지됩니다.'
                      : 'The folder is moved to the recycle bin. Shared game files and other profiles are preserved.'}
                  </p>

                  <label className="profile-settings-field">
                    {ko
                      ? `삭제하려면 프로필 이름 “${profile.name}”을 정확히 입력해 주세요.`
                      : `Type the exact profile name “${profile.name}” to delete.`}

                    <input
                      value={confirmation}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy || locked}
                      onChange={event =>
                        setConfirmation(event.target.value)
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="profile-delete-button"
                    disabled={
                      busy ||
                      locked ||
                      confirmation !== profile.name
                    }
                    onClick={() => {
                      void remove()
                    }}
                  >
                    {ko ? '프로필 삭제' : 'Delete profile'}
                  </button>
                </>
              )}
            </section>
          </>
        )}

        {locked && (
          <p className="inline-note">
            {ko
              ? '게임 실행 또는 다운로드 중에는 설정 변경과 삭제를 할 수 없습니다.'
              : 'Settings cannot be changed or deleted during gameplay or downloads.'}
          </p>
        )}

        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={failed ? 'error' : 'notice'}
          >
            {message}
          </p>
        )}
      </div>

      <footer className="settings-footer">
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={onClose}
        >
          {ko ? '닫기' : 'Close'}
        </button>

        <button
          type="button"
          className="action-button"
          disabled={busy || locked || !info}
          onClick={() => {
            void save()
          }}
        >
          {ko
            ? busy ? '처리 중…' : '설정 저장'
            : busy ? 'Working…' : 'Save settings'}
        </button>
      </footer>
    </dialog>
  )
}