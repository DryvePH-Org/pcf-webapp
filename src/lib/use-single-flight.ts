"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

// One save at a time. The lock is a ref, so it closes the instant the first
// click runs; a state flag alone only disables the button after the next
// render, and a fast double-click gets through before that.
//
//   const { pending, run, hold } = useSingleFlight();
//   async function save() { await run(async () => { ...; if (ok) hold(); }); }
//
// `hold()` keeps the lock after a success that navigates away, so the button
// cannot be clicked again while the next page loads.
export function useSingleFlight() {
  const locked = useRef(false);
  const held = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    setPending(true);
    try {
      return await task();
    } finally {
      if (!held.current) {
        locked.current = false;
        if (mounted.current) setPending(false);
      }
    }
  }, []);

  const hold = useCallback(() => {
    held.current = true;
  }, []);

  return { pending, run, hold };
}

// A synchronous latch for buttons whose handler we do not control: the first
// click goes through, repeats are ignored until `release()` (or the timeout).
export function useClickLatch(timeoutMs = 1500) {
  const latched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    latched.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const once = useCallback(
    (fn: () => void) => {
      if (latched.current) return;
      latched.current = true;
      timer.current = setTimeout(release, timeoutMs);
      fn();
    },
    [release, timeoutMs],
  );

  useEffect(() => release, [release]);
  return { once, release };
}

// useTransition with the same instant lock: a second call while the first is
// still running is ignored. Drop-in for `const [pending, startTransition] = useTransition()`.
export function useGuardedTransition() {
  const [pending, startTransition] = useTransition();
  const locked = useRef(false);
  const start = useCallback((task: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    startTransition(async () => {
      try {
        await task();
      } finally {
        locked.current = false;
      }
    });
  }, []);
  return [pending, start] as const;
}

// For handlers that already follow `setPending(true) ... finally setPending(false)`.
// `isBusy()` reads a ref that `setPending` updates immediately, so a second
// click in the same instant can be turned away at the top of the handler:
//   if (isBusy()) return; setPending(true);
export function usePending(): [boolean, (value: boolean) => void, () => boolean] {
  const busy = useRef(false);
  const [pending, setState] = useState(false);
  const setPending = useCallback((value: boolean) => {
    busy.current = value;
    setState(value);
  }, []);
  const isBusy = useCallback(() => busy.current, []);
  return [pending, setPending, isBusy];
}
