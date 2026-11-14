import { useEffect, useRef, useState } from 'react'

type Info = {
  version: string
  packaged: boolean
  dataPath: string
  installPath: string
  managedJavaPath: string
  java: Array<{ major: number; path: string }>
  canUninstall: boolean
}

type Release = {
  version: string
  name: string
  body: string
  newer: boolean | null
}

type Result = {
  ok: boolean
  code?: string
}

const invoke = <T,>(
  channel: string,
  ...args: unknown[]
): Promise<T> =>
  window.electron.ipcRenderer.invoke(
    channel,
    ...args
  ) as Promise<T>

export default function ClientSettings({
  ko
}: {
  ko: boolean
}) {
  const [info, setInfo] = useState<Info | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [release, setRelease] =
    useState<Release | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [confirmDelete, setConfirmDelete] =
    useState(false)
  const [confirmation, setConfirmation] = useState('')
  const working = useRef(false)

  useEffect(() => {
    let alive = true

    void invoke<Info>('client:info')
      .then(value => {
        if (alive) setInfo(value)
      })
      .catch(() => {
        if (alive) {
          setFailed(true)
          setMessage(
            ko
              ? '클라이언트 정보를 읽지 못했습니다. MORU를 완전히 종료한 뒤 다시 실행해 주세요.'
              : 'Could not read client information. Restart MORU.'
          )
        }
      })

    return () => {
      alive = false
    }
  }, [ko])

  const say = (text: string, error = false) => {
    setMessage(text)
    setFailed(error)
  }

  async function action(task: () => Promise<void>) {
    if (working.current) return

    working.current = true
    setBusy(true)
    setMessage('')

    try {
      await task()
    } catch {
      say(
        ko
          ? '작업을 완료하지 못했습니다. 네트워크 상태를 확인하거나 다시 시도해 주세요.'
          : 'Could not complete the action. Check your connection or try again.',
        true
      )
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  async function checkUpdate(log: boolean) {
    await action(async () => {
      const value = await invoke<Release | null>(
        'client:check-update'
      )

      setRelease(value)
      setShowLog(log)

      if (!value) {
        say(
          ko
            ? '공개된 정식 릴리스가 없습니다. 비공개 저장소에는 접근할 수 없습니다.'
            : 'No public stable release is available. Private repositories cannot be accessed.'
        )
        return
      }

      say(
        ko
          ? value.newer === true
            ? `새 버전 ${value.version}이 있습니다.`
            : value.newer === false
              ? `새로운 업데이트가 없습니다. 최신 공개 버전: ${value.version}`
              : `공개 버전: ${value.version}. 버전 형식이 달라 자동 비교할 수 없습니다.`
          : value.newer === true
            ? `Version ${value.version} is available.`
            : value.newer === false
              ? `No newer update. Latest public release: ${value.version}`
              : `Public version: ${value.version}. Cannot compare version formats.`
      )
    })
  }

  async function idle(): Promise<boolean> {
    const state = await window.api.game.getState()

    if (
      state.status !== 'idle' &&
      state.status !== 'error'
    ) {
      say(
        ko
          ? '게임 실행이나 설치가 끝난 뒤 이용해 주세요.'
          : 'Finish the game or installation first.',
        true
      )
      return false
    }

    return true
  }

  async function remove() {
    await action(async () => {
      if (
        confirmation !== '삭제' ||
        !(await idle())
      ) {
        return
      }

      const result = await invoke<Result>(
        'client:uninstall',
        confirmation
      )

      if (result.ok) {
        say(
          ko
            ? '제거 프로그램을 시작했습니다. 제거를 완료하면 MORU 데이터도 삭제됩니다.'
            : 'Uninstaller started. Completing removal also deletes MORU data.'
        )
      } else if (result.code !== 'CANCELLED') {
        say(
          ko
            ? result.code === 'GAME_BUSY'
              ? '실행 중인 Minecraft를 먼저 종료해 주세요.'
              : result.code === 'NOT_INSTALLED'
                ? '설치된 Windows EXE에서만 삭제할 수 있습니다.'
                : '제거 프로그램을 실행하지 못했습니다.'
            : 'Could not start removal. Close Minecraft and use an installed Windows build.',
          true
        )
      }
    })
  }

  return (
    <section className="moru-client-settings">
      <style>{`
        .moru-client-settings {
          display: grid;
          gap: 16px;
          line-height: 1.7;
        }

        .moru-client-settings .client-card {
          padding: 18px;
          border: 1px solid #2c4135;
          border-radius: 14px;
          background: #101b15;
          min-width: 0;
        }

        .moru-client-settings h4 {
          margin: 0 0 10px;
          color: #edf5f1;
        }

        .moru-client-settings p {
          margin: 8px 0;
        }

        .moru-client-settings .client-path {
          overflow-wrap: anywhere;
          color: #a4bfae;
          font-size: 12px;
          white-space: pre-wrap;
        }

        .moru-client-settings .client-log {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font: inherit;
          font-size: 13px;
          max-height: 280px;
          overflow: auto;
        }

        .moru-client-settings .client-danger {
          border-color: #874344;
          background: #29191a;
        }

        .moru-client-settings .client-warning {
          color: #ff9a9f;
        }

        .moru-client-settings .client-danger-button {
          padding: 10px 16px;
          border: 1px solid #d96970;
          border-radius: 10px;
          background: #87383e;
          color: #fff;
          font: inherit;
          cursor: pointer;
        }

        .moru-client-settings button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .moru-client-settings .client-confirm {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }

        .moru-client-settings .client-confirm label {
          display: grid;
          gap: 8px;
          color: #ffc1c4;
        }

        .moru-client-settings .client-confirm input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ae6267;
          border-radius: 10px;
          background: #1a1112;
          color: #fff;
          font: inherit;
        }

        .moru-client-settings .button-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
      `}</style>

      <div className="client-card">
        <h4>
          {ko ? '클라이언트 버전' : 'Client version'}
        </h4>

        <strong>
          {info
            ? `MORU ${info.version}`
            : ko ? '불러오는 중…' : 'Loading…'}
        </strong>

        {info && (
          <p className="muted">
            {info.packaged
              ? ko ? '설치 버전' : 'Packaged build'
              : ko
                ? '개발 버전 · 버전은 package.json 기준입니다.'
                : 'Development build · Version comes from package.json.'}
          </p>
        )}
      </div>

      <div className="client-card">
        <h4>
          {ko
            ? '클라이언트 업데이트 로그'
            : 'Client update log'}
        </h4>

        <p className="muted">
          {ko
            ? 'GitHub의 최신 정식 릴리스에 작성된 변경 내용을 표시합니다.'
            : 'Shows notes from the latest stable GitHub release.'}
        </p>

        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              void checkUpdate(true)
            }}
          >
            {ko
              ? '최신 업데이트 로그 보기'
              : 'Load latest release notes'}
          </button>

          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              void action(async () => {
                await invoke('client:releases')
              })
            }}
          >
            {ko ? '전체 로그 열기 ↗' : 'All releases ↗'}
          </button>
        </div>

        {showLog && release && (
          <>
            <h4>{release.name}</h4>
            <pre className="client-log">
              {release.body ||
                (ko
                  ? '등록된 변경 내용이 없습니다.'
                  : 'No release notes provided.')}
            </pre>
          </>
        )}
      </div>

      <div className="client-card">
        <h4>
          {ko ? '클라이언트 폴더' : 'Client folder'}
        </h4>

        <p className="muted">
          {ko
            ? '프로필·게임 파일·설정이 저장되는 MORU 데이터 폴더입니다.'
            : 'MORU data folder containing profiles, game files and settings.'}
        </p>

        <p className="client-path">{info?.dataPath}</p>

        <button
          type="button"
          className="secondary-button"
          disabled={busy || !info}
          onClick={() => {
            void action(async () => {
              const result = await invoke<Result>(
                'client:folder'
              )

              if (!result.ok) {
                say(
                  ko
                    ? '폴더를 열지 못했습니다.'
                    : 'Could not open folder.',
                  true
                )
              }
            })
          }}
        >
          {ko ? '폴더 열기' : 'Open folder'}
        </button>
      </div>

      <div className="client-card">
        <h4>{ko ? '자바 위치' : 'Java location'}</h4>

        <p className="muted">
          {ko
            ? '기본적으로 필요한 Java를 자동으로 찾거나 설치합니다. 직접 선택하면 해당 Java 버전에 저장됩니다.'
            : 'Java is detected or installed automatically. A manual selection is saved for its Java major version.'}
        </p>

        <p className="client-path">
          {info?.managedJavaPath}
        </p>

        {info?.java.map(value => (
          <p key={value.major} className="client-path">
            Java {value.major} · {value.path}
          </p>
        ))}

        <button
          type="button"
          className="secondary-button"
          disabled={busy || !info}
          onClick={() => {
            void action(async () => {
              const result = await invoke<
                Result & { major?: number }
              >('client:java')

              if (result.ok) {
                setInfo(
                  await invoke<Info>('client:info')
                )

                say(
                  ko
                    ? `Java ${result.major} 위치를 저장했습니다.`
                    : `Java ${result.major} location saved.`
                )
              } else if (
                result.code !== 'CANCELLED'
              ) {
                say(
                  ko
                    ? '유효한 java.exe 또는 java 실행 파일을 선택해 주세요.'
                    : 'Choose a valid java.exe or java executable.',
                  true
                )
              }
            })
          }}
        >
          {ko
            ? 'Java 실행 파일 선택'
            : 'Choose Java executable'}
        </button>
      </div>

      <div className="client-card">
        <h4>
          {ko ? '업데이트 확인' : 'Check for updates'}
        </h4>

        <p className="muted">
          {ko
            ? '현재는 새 버전을 확인한 뒤 릴리스 페이지에서 직접 다운로드합니다. 자동 설치는 아직 지원하지 않습니다.'
            : 'Check for a new version and download it from Releases. Automatic installation is not connected yet.'}
        </p>

        <div className="button-row">
          <button
            type="button"
            className="action-button"
            disabled={busy || !info}
            onClick={() => {
              void checkUpdate(false)
            }}
          >
            {ko ? '업데이트 확인' : 'Check for updates'}
          </button>

          {release && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                void action(async () => {
                  await invoke('client:releases')
                })
              }}
            >
              {ko
                ? '다운로드 페이지 ↗'
                : 'Download page ↗'}
            </button>
          )}
        </div>
      </div>

      <div className="client-card">
        <h4>
          {ko
            ? '클라이언트 재시작'
            : 'Restart client'}
        </h4>

        <button
          type="button"
          className="secondary-button"
          disabled={busy || !info?.packaged}
          onClick={() => {
            void action(async () => {
              if (!(await idle())) return

              const result = await invoke<Result>(
                'client:restart'
              )

              if (
                !result.ok &&
                result.code !== 'CANCELLED'
              ) {
                say(
                  ko
                    ? '설치된 EXE에서 이용해 주세요.'
                    : 'Use an installed build.',
                  true
                )
              }
            })
          }}
        >
          {ko ? 'MORU 재시작' : 'Restart MORU'}
        </button>

        {!info?.packaged && (
          <p className="muted">
            {ko
              ? '개발 중에는 터미널에서 종료한 뒤 npm run dev로 다시 실행해 주세요.'
              : 'During development, stop the server and run npm run dev again.'}
          </p>
        )}
      </div>

      <div className="client-card client-danger">
        <h4>
          {ko ? '클라이언트 삭제' : 'Remove client'}
        </h4>

        <p className="client-warning">
          {ko
            ? 'MORU 프로그램과 MORU가 관리하는 플레이 데이터를 모두 삭제합니다.'
            : 'Removes MORU and all play data managed by MORU.'}
        </p>

        <button
          type="button"
          className="client-danger-button"
          disabled={busy || !info?.canUninstall}
          onClick={() => {
            setConfirmation('')
            setConfirmDelete(true)
          }}
        >
          {ko ? '클라이언트 삭제' : 'Remove client'}
        </button>

        {!info?.canUninstall && (
          <p className="muted">
            {ko
              ? '전체 삭제 기능은 이 설정을 포함해 새로 빌드하고 설치한 Windows EXE에서 사용할 수 있습니다. 개발 소스 폴더는 삭제하지 않습니다.'
              : 'Requires a Windows installer built with these removal settings. Development sources are never deleted.'}
          </p>
        )}

        {confirmDelete && (
          <div className="client-confirm">
            <div
              role="alert"
              className="client-warning"
            >
              <strong>
                {ko
                  ? '모든 플레이 데이터가 삭제됩니다.'
                  : 'All play data will be deleted.'}
              </strong>

              <p>
                {ko
                  ? 'MORU에 저장된 프로필, 모드, 리소스팩, 쉐이더, 모드팩, 월드, 계정 연결 및 설정이 모두 삭제됩니다. 삭제 후에는 복구할 수 없습니다. 필요한 데이터는 먼저 백업해 주세요.'
                  : 'Profiles, mods, resource packs, shaders, modpacks, worlds, account connections and settings stored in MORU will be deleted. This cannot be undone. Back up important data first.'}
              </p>

              <p>
                {ko
                  ? '외부 Java, 다른 런처의 데이터와 브라우저의 Microsoft 로그인은 삭제하지 않습니다.'
                  : 'External Java installations, other launchers and browser Microsoft sessions are preserved.'}
              </p>
            </div>

            <label>
              {ko
                ? '계속하려면 아래에 삭제를 입력해 주세요.'
                : 'Type 삭제 to continue.'}

              <input
                value={confirmation}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={event =>
                  setConfirmation(event.target.value)
                }
              />
            </label>

            <div className="button-row">
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => {
                  setConfirmDelete(false)
                  setConfirmation('')
                }}
              >
                {ko ? '취소' : 'Cancel'}
              </button>

              <button
                type="button"
                className="client-danger-button"
                disabled={
                  busy ||
                  confirmation !== '삭제' ||
                  !info?.canUninstall
                }
                onClick={() => {
                  void remove()
                }}
              >
                {ko ? '전체 삭제' : 'Delete everything'}
              </button>
            </div>
          </div>
        )}
      </div>

      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={failed ? 'error' : 'notice'}
        >
          {message}
        </p>
      )}
    </section>
  )
}