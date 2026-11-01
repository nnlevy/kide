// Day count for unpaid play. The client cannot set the total: each tick adds
// the wall-clock gap since the last tick, capped so a hidden tab does not
// consume the whole day in one request.

export function dayStamp(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function playKey(day, subject) {
  return `kide:play-minutes:v1:${day}:${subject}`;
}

export function advance(record, nowMs, maxStep) {
  if (!record || typeof record !== "object") {
    return { seconds: 0, lastTickMs: nowMs };
  }
  const prev = Number(record.seconds);
  const last = Number(record.lastTickMs);
  const safePrev = Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0;
  const wall = Number.isFinite(last) ? Math.max(0, Math.floor((nowMs - last) / 1000)) : 0;
  const add = Math.min(maxStep, wall);
  return { seconds: safePrev + add, lastTickMs: nowMs };
}

export function overLimit(seconds, freePlayMinutes) {
  return seconds >= freePlayMinutes * 60;
}

/** Device and account share the higher total so signing in cannot reset the day. */
export function mergePeak(deviceNext, accountNext) {
  const peak = Math.max(
    deviceNext.seconds,
    accountNext ? accountNext.seconds : 0,
  );
  const at = deviceNext.lastTickMs;
  return {
    device: { seconds: peak, lastTickMs: at },
    account: accountNext ? { seconds: peak, lastTickMs: at } : null,
  };
}

export function capSeconds(seconds, freePlayMinutes) {
  const limit = freePlayMinutes * 60;
  if (seconds > limit) return limit;
  return seconds;
}
