const volumeKey = 'moru-interface-volume-v1'

let audio: AudioContext | null = null
let sample: AudioBuffer | null = null
let installed = false
let lastClick = -Infinity

function savedVolume(): number {
  try {
    const value = localStorage.getItem(volumeKey)

    return value === null
      ? 60
      : Math.max(0, Math.min(100, Number(value) || 0))
  } catch {
    return 60
  }
}

/**
 * 외부 파일 없이 짧은 클릭음을 직접 생성합니다.
 */
export async function playClickSound(
  volume = savedVolume()
): Promise<boolean> {
  const level = Math.max(
    0,
    Math.min(100, Number(volume) || 0)
  )

  if (level === 0) return true

  try {
    if (!audio || audio.state === 'closed') {
      audio = new AudioContext()
      sample = null
    }

    const context = audio

    if (context.state === 'suspended') {
      await context.resume()
    }

    if (context.state !== 'running') return false

    if (!sample) {
      sample = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.025),
        context.sampleRate
      )

      const values = sample.getChannelData(0)

      for (let i = 0; i < values.length; i++) {
        const envelope =
          Math.min(
            1,
            i / (context.sampleRate * 0.001)
          ) *
          Math.exp(
            -i / (context.sampleRate * 0.004)
          )

        values[i] =
          (Math.random() * 2 - 1) * envelope
      }
    }

    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    source.buffer = sample

    filter.type = 'lowpass'
    filter.frequency.value = 2600
    filter.Q.value = 0.5

    gain.gain.value = level / 100 * 0.32

    source.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)

    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      gain.disconnect()
    }

    source.start()

    return true
  } catch {
    // 소리가 재생되지 않아도 다른 기능은 계속 동작합니다.
    return false
  }
}

function soundControl(
  target: EventTarget | null
): HTMLElement | null {
  if (!(target instanceof Element)) return null

  if (
    target.closest(
      '[data-moru-sound="off"], [aria-disabled="true"], [inert]'
    )
  ) {
    return null
  }

  const element = target.closest<HTMLElement>(
    [
      'button',
      'a[href]',
      'summary',
      'select',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="reset"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      '[role="button"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      'label'
    ].join(', ')
  )

  if (!element || element.matches(':disabled')) {
    return null
  }

  if (element instanceof HTMLLabelElement) {
    const control = element.control

    if (!control || control.matches(':disabled')) {
      return null
    }

    if (control instanceof HTMLSelectElement) {
      return element
    }

    if (
      !(control instanceof HTMLInputElement) ||
      !['checkbox', 'radio'].includes(control.type)
    ) {
      return null
    }
  }

  return element
}

export function initializeClickSounds(): void {
  if (installed) return
  installed = true

  document.addEventListener(
    'click',
    event => {
      if (
        event.button !== 0 ||
        !soundControl(event.target)
      ) {
        return
      }

      const now = performance.now()

      // 라벨과 연결된 입력 요소에서 발생하는 중복 소리를 방지합니다.
      if (now - lastClick < 35) return

      lastClick = now
      void playClickSound()
    },
    true
  )
}