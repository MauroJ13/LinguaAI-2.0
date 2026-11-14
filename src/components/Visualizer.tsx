import { useEffect, useRef } from 'react';
import type { Microphone } from '../services/microphone';

export type VoicePhase = 'idle' | 'listening' | 'speaking' | 'thinking' | 'waiting';

const BARS = 28;

/** Shape of the resting curve: tallest in the middle, tapering to the sides. */
function envelope(i: number): number {
  const x = (i - (BARS - 1) / 2) / ((BARS - 1) / 2);
  return 0.25 + 0.75 * Math.cos((x * Math.PI) / 2) ** 1.5;
}

/**
 * Audio visualisation for Live Speaking.
 *   listening → follows the real microphone level when a meter is available
 *               (desktop); otherwise a calm "listening" motion
 *   speaking  → a speech-like motion while the browser voice talks (browsers
 *               expose no audio data for synthesised speech)
 *   thinking  → a slow travelling wave
 * It shows who has the floor; it is not a measurement of pronunciation.
 */
export function Visualizer({ phase, microphone }: { phase: VoicePhase; microphone: Microphone | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const micRef = useRef(microphone);
  micRef.current = microphone;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let smooth = 0;

    const draw = (time: number) => {
      const t = time / 1000;
      const current = phaseRef.current;
      const level = current === 'listening' ? (micRef.current?.level() ?? null) : null;
      if (level !== null) smooth += (level - smooth) * (level > smooth ? 0.5 : 0.12);

      for (let i = 0; i < BARS; i += 1) {
        const bar = bars.current[i];
        if (!bar) continue;
        let h = 0.08;
        if (reduced) {
          h = current === 'idle' || current === 'waiting' ? 0.1 : 0.2 + 0.4 * envelope(i);
        } else if (current === 'listening') {
          h =
            level !== null
              ? 0.08 + smooth * envelope(i) * (0.65 + 0.35 * Math.sin(t * 9 + i * 1.7))
              : 0.14 + 0.16 * envelope(i) * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.5));
        } else if (current === 'speaking') {
          const syllables = 0.5 + 0.5 * Math.sin(t * 5.2);
          const texture = 0.5 + 0.25 * Math.sin(t * 13 + i * 0.9) + 0.25 * Math.sin(t * 7.3 - i * 0.55);
          h = 0.1 + 0.8 * envelope(i) * texture * (0.35 + 0.65 * syllables);
        } else if (current === 'thinking') {
          h = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(t * 3.2 - i * 0.45));
        } else {
          h = 0.07 + 0.03 * envelope(i);
        }
        bar.style.transform = `scaleY(${Math.max(0.05, Math.min(1, h)).toFixed(3)})`;
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return (
    <div className={`viz viz--${phase}`} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
