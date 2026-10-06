import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True when this module was invoked directly (`node scripts/commands/x.js`),
 * false when it was only imported (e.g. by a test, or by another script).
 * There is no CLI router anymore — each command script decides for itself
 * whether to run, which is what makes `node scripts/commands/lint.js` work
 * standalone in a target repo's CI with nothing else on disk.
 *
 * realpathSync, not just path.resolve: Node's ESM loader reports
 * import.meta.url through symlinks resolved (e.g. macOS's /tmp ->
 * /private/tmp), but process.argv[1] keeps whatever literal path the caller
 * typed — a plain resolve() only makes it absolute, so the two can disagree
 * on a symlinked path and isMain silently returns false.
 */
export function isMain(moduleUrl: string): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

/**
 * Runs `fn` when this module is the entry point, printing a plain error
 * message (no stack trace — these are user-facing config/git problems, not
 * bugs) and exiting non-zero on failure. Handles both sync and async `run`.
 */
export function runCli(moduleUrl: string, fn: () => void | Promise<void>): void {
  if (!isMain(moduleUrl)) return;
  Promise.resolve()
    .then(fn)
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    });
}
