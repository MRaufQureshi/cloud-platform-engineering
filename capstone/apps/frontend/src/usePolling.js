// usePolling.js - run a function now and then every `ms` milliseconds (no websockets:
// polling every 5 s is simple and plenty at this scale). Returns a "refresh now" function.
import { useCallback, useEffect, useRef } from "react";

export function usePolling(fn, ms, deps) {
  const latest = useRef(fn);
  latest.current = fn;

  const run = useCallback(() => latest.current(), []);

  useEffect(() => {
    run();
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, run, ...deps]);

  return run;
}
