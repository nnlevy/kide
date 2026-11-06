// True when this module is the script node was started with. Compares realpaths: on macOS /tmp is
// /private/tmp, so a plain fileURLToPath(import.meta.url) === argv[1] is false and the CLI silently does nothing.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
export function isMain(metaUrl, argv1 = process.argv[1]) { return !!argv1 && real(fileURLToPath(metaUrl)) === real(argv1); }
