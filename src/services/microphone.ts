/**
 * Microphone access for Live Speaking: asks for permission up front (so a
 * refusal can be explained properly) and, on desktop, measures the input
 * level for the audio visualisation. The audio never leaves the page here –
 * turning speech into text is the job of services/recognition.ts.
 */

export type MicrophoneProblem = 'denied' | 'no-microphone' | 'unsupported' | 'other';

export class MicrophoneError extends Error {
  problem: MicrophoneProblem;

  constructor(problem: MicrophoneProblem) {
    super(problem);
    this.name = 'MicrophoneError';
    this.problem = problem;
  }
}

export interface Microphone {
  /** current input level 0–1, or null when no meter is running */
  level: () => number | null;
  close: () => void;
}

/** Phones cannot reliably share the microphone between a level meter and speech recognition. */
export function isPhoneOrTablet(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** iPhone, iPad and iPod touch (every browser there is Safari underneath). */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export async function openMicrophone(withMeter: boolean): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicrophoneError('unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicrophoneError('denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicrophoneError('no-microphone');
    throw new MicrophoneError('other');
  }

  const release = () => stream.getTracks().forEach((track) => track.stop());

  if (!withMeter || typeof AudioContext === 'undefined') {
    release();
    return { level: () => null, close: () => undefined };
  }

  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    return {
      level: () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const v = (samples[i] - 128) / 128;
          sum += v * v;
        }
        return Math.min(1, Math.sqrt(sum / samples.length) * 4);
      },
      close: () => {
        release();
        void context.close().catch(() => undefined);
      },
    };
  } catch {
    release();
    return { level: () => null, close: () => undefined };
  }
}
