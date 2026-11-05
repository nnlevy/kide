// Money path: the shared platform gate must actually run before a ship.
// The rejected substitute printed ok:true with tool:"missing":
// {"ok":true,"tool":"missing","note":"tools/platform-gate is not in this repo. Checked GATE_PATHS locally. No deploy.","domain":"kide.us","module":"p3-referrals","paths":["/r/:code","/parent/earnings","/parent/earnings/","/api/parent/earnings"],"checks":[{"path":"/parent/earnings","ok":true},{"path":"/r/:code","ok":true},{"path":"/api/parent/earnings","ok":true}]}
// That JSON is not a pass. Missing canonical gate fails closed.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const real = "tools/platform-gate/preflight.mjs";
if (!existsSync(real)) {
  console.error("canonical gate missing: tools/platform-gate/preflight.mjs");
  console.error("refused the tool:missing ok:true substitute");
  process.exit(2);
}
const child = spawnSync(process.execPath, [real], { stdio: "inherit", env: process.env });
process.exit(child.status === 0 ? 0 : (child.status == null ? 1 : child.status));
