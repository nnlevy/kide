// Hook for parent accounts.
//
// Play does not require an account. The weekly board can keep an anonymous
// nickname. When a parent is signed in, the id attached to timing and to a
// score is currentParent(request, env).parentId. A different id never
// replaces one already stored.
//
// Money path: free Pip practice → https://kide.us/pricing → /clinician/ ($39 licence).

import { currentParent } from "../account/session.js";
import { isParentId } from "../account/parent-id.js";

export { validAccountId } from "./score.js";
export { linkAccount } from "./board.js";

export async function parentIdFrom(request, env) {
  try {
    const session = await currentParent(request, env || {});
    return session && isParentId(session.parentId) ? session.parentId : "";
  } catch {
    return "";
  }
}
