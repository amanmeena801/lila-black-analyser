/**
 * Bottom time-slider strip. Two operating modes:
 *
 *   1. Match-mode (a specific matchId is selected) — slider walks from 0 to
 *      that match's duration_ms. Lets designers scrub through a single
 *      match's events up to an exact moment.
 *   2. Aggregate-mode (no match selected) — slider is a normalised 0..1
 *      fraction. The query layer applies it per-match (rel_ts <= duration *
 *      progress) so matches of wildly different lengths stay comparable.
 *
 * Playback state (``isPlaying``, ``relTsMax``, ``normalizedProgress``) lives
 * in the zustand store. ``useEvents`` watches the spec; re-querying happens
 * automatically when the handle moves. Only the timer loop lives here.
 *
 * Keyboard:
 *   Space       — play / pause
 *   ← / →       — nudge backwards / forwards by one tick
 *   Shift + ←→  — nudge 5× faster (coarse scrubbing)
 *   Home / End  — jump to 0 / full
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import { useSelectedMatch } from '@/hooks/useSelectedMatch';
import { useFilterStore } from '@/state/filterStore';

const BASE_TICK_MS = 100;
const BASE_TICK_FRACTION = 0.02;
const SPEEDS = [0.5, 1, 2, 4] as const;

type Speed = (typeof SPEEDS)[number];
type Mode = 'match' | 'aggregate';

export function TimeSlider() {
  const matchId = useFilterStore((s) => s.matchId);
  const relTsMax = useFilterStore((s) => s.relTsMax);
  const normalizedProgress = useFilterStore((s) => s.normalizedProgress);
  const isPlaying = useFilterStore((s) => s.isPlaying);
  const setRelTsMax = useFilterStore((s) => s.setRelTsMax);
  const setNormalizedProgress = useFilterStore((s) => s.setNormalizedProgress);
  const setIsPlaying = useFilterStore((s) => s.setIsPlaying);

  const { match } = useSelectedMatch();
  const mode: Mode = matchId && match ? 'match' : 'aggregate';

  const speedRef = useRef<Speed>(1);

  // ---- Derived readouts ------------------------------------------------- //
  const duration = match?.duration_ms ?? 0;
  const progress =
    mode === 'match'
      ? duration === 0
        ? 1
        : (relTsMax ?? duration) / duration
      : (normalizedProgress ?? 1);

  // ---- Playback loop ---------------------------------------------------- //
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    const interval = BASE_TICK_MS;
    tickRef.current = window.setInterval(() => {
      const s = useFilterStore.getState();
      const speed = speedRef.current;
      if (s.matchId && match) {
        const step = match.duration_ms * BASE_TICK_FRACTION * speed;
        const next = (s.relTsMax ?? 0) + step;
        if (next >= match.duration_ms) {
          s.setRelTsMax(match.duration_ms);
          s.setIsPlaying(false);
        } else {
          s.setRelTsMax(next);
        }
      } else {
        const step = BASE_TICK_FRACTION * speed;
        const next = (s.normalizedProgress ?? 0) + step;
        if (next >= 1) {
          s.setNormalizedProgress(1);
          s.setIsPlaying(false);
        } else {
          s.setNormalizedProgress(next);
        }
      }
    }, interval);

    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isPlaying, match]);

  // ---- Stable handlers -------------------------------------------------- //
  const onScrub = useCallback(
    (value: number) => {
      const s = useFilterStore.getState();
      if (mode === 'match') {
        s.setRelTsMax(value);
      } else {
        s.setNormalizedProgress(value);
      }
      if (s.isPlaying) s.setIsPlaying(false);
    },
    [mode],
  );

  const togglePlay = useCallback(() => {
    const s = useFilterStore.getState();
    // When starting from the very end, rewind to 0 first so playback is useful.
    if (!s.isPlaying) {
      if (mode === 'match' && match && (s.relTsMax ?? match.duration_ms) >= match.duration_ms) {
        s.setRelTsMax(0);
      } else if (mode === 'aggregate' && (s.normalizedProgress ?? 1) >= 1) {
        s.setNormalizedProgress(0);
      }
    }
    s.setIsPlaying(!s.isPlaying);
  }, [mode, match]);

  const onReset = useCallback(() => {
    if (mode === 'match') setRelTsMax(undefined);
    else setNormalizedProgress(undefined);
    setIsPlaying(false);
  }, [mode, setRelTsMax, setNormalizedProgress, setIsPlaying]);

  // ---- Keyboard navigation ---------------------------------------------- //
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in an input / select.
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      const state = useFilterStore.getState();
      const stepMultiplier = e.shiftKey ? 5 : 1;

      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const sign = e.key === 'ArrowLeft' ? -1 : 1;
        if (mode === 'match' && match) {
          const step = match.duration_ms * BASE_TICK_FRACTION * stepMultiplier * sign;
          const next = clamp(
            (state.relTsMax ?? match.duration_ms) + step,
            0,
            match.duration_ms,
          );
          state.setRelTsMax(next);
        } else {
          const step = BASE_TICK_FRACTION * stepMultiplier * sign;
          const next = clamp((state.normalizedProgress ?? 1) + step, 0, 1);
          state.setNormalizedProgress(next);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (mode === 'match') state.setRelTsMax(0);
        else state.setNormalizedProgress(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (mode === 'match' && match) state.setRelTsMax(match.duration_ms);
        else state.setNormalizedProgress(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, match, togglePlay]);

  // ---- Render ----------------------------------------------------------- //
  const sliderMax = mode === 'match' ? duration || 1 : 1;
  const sliderStep = mode === 'match' ? Math.max(1, Math.round(duration / 200)) : 0.005;
  const sliderValue = mode === 'match' ? relTsMax ?? duration : normalizedProgress ?? 1;
  const disabled = mode === 'match' && !match;

  return (
    <div className="flex h-14 items-center gap-3 border-t border-surface-700 bg-surface-800 px-4">
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        className="inline-flex h-8 w-8 items-center justify-center rounded bg-surface-700 text-zinc-200 hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause (space)' : 'Play (space)'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <button
        type="button"
        onClick={onReset}
        className="rounded border border-surface-600 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
        title="Reset to full range"
      >
        Reset
      </button>

      <SpeedControl speedRef={speedRef} />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="shrink-0 rounded bg-surface-900 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500"
          title={
            mode === 'match'
              ? 'Scrubbing a single match by ms'
              : 'Scrubbing every match by normalised progress'
          }
        >
          {mode === 'match' ? 'match' : 'aggregate'}
        </span>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={sliderStep}
          value={sliderValue}
          onChange={(e) => onScrub(Number(e.target.value))}
          disabled={disabled}
          className="h-1 flex-1 accent-accent-500 disabled:opacity-40"
          aria-label={mode === 'match' ? 'Match time in ms' : 'Normalised match progress'}
        />
        <span className="w-40 shrink-0 text-right font-mono text-xs text-zinc-400">
          {mode === 'match'
            ? `${Math.round(sliderValue)} / ${duration} ms (${Math.round(progress * 100)}%)`
            : `${Math.round(progress * 100)}% of each match`}
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// SpeedControl — stored in a ref so changing speed doesn't restart the timer   //
// loop. That keeps playback smooth; the loop just reads the current speed     //
// when it fires its next tick.                                                //
// --------------------------------------------------------------------------- //

interface SpeedProps {
  speedRef: MutableRefObject<Speed>;
}

function SpeedControl({ speedRef }: SpeedProps) {
  // Purely presentational — mirror the ref in local state so the label updates.
  const [, force] = useState(0);
  return (
    <div className="flex shrink-0 items-center gap-1 rounded border border-surface-600 bg-surface-900 p-0.5">
      {SPEEDS.map((s) => {
        const active = speedRef.current === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => {
              speedRef.current = s;
              force((n) => n + 1);
            }}
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
              active ? 'bg-accent-500 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title={`Playback speed ${s}×`}
          >
            {s}×
          </button>
        );
      })}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
