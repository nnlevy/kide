// Challenge mode: pace detection, server-side points, and the weekly board.
//
// The browser is not trusted with a point total. These tests drive the same
// functions the worker calls, including a too-quick reply, a reused question,
// a number smuggled in the request, and a board that stays empty until a
// grown-up opts in with a nickname.

import { readFileSync } from 'node:fs';
import {
  FAST_MIN_ANSWERS, FAST_AVG_MS, SPEED_WINDOW, MIN_HUMAN_MS, WINDOW_MAX,
  noteCorrectTime, speedRead, tierForStreak, pointsFor, judge, makeQuestion,
  cleanHandle, weekKey, validPlayerId, freezePlayer,
  memoryKv, issueQuestion, answerQuestion, setHandle, getBoard, dispatchChallenge,
} from './public/engine/challenge.js';

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? ' -- ' + detail : ''}`); }
};
const eq = (name, actual, expected) => {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PID = 'abcdef0123456789';
const NOW = Date.UTC(2026, 9, 31, 15, 0, 0);

console.log('\n--- pace ---');

{
  const nine = Array.from({ length: FAST_MIN_ANSWERS - 1 }, () => 800);
  const early = speedRead(nine);
  eq('nine quick answers are not enough', early.fast, false);
  eq('nine are counted', early.n, 9);

  const ten = speedRead(noteCorrectTime(nine, 800));
  eq('ten under the line is quick', ten.fast, true);
  ok('the mean is the mean', Math.abs(ten.avg - 800) < 0.001, String(ten.avg));

  const slow = Array.from({ length: 10 }, () => FAST_AVG_MS + 1);
  eq('ten just over the line is not quick', speedRead(slow).fast, false);
  eq('exactly on the line is quick', speedRead(Array.from({ length: 10 }, () => FAST_AVG_MS)).fast, true);
}

{
  let times = [];
  times = noteCorrectTime(times, 50);
  times = noteCorrectTime(times, 200000);
  eq('a tap quicker than noticing, or a tab left open, is not stored', times.length, 0);
  for (let i = 0; i < SPEED_WINDOW + 5; i++) times = noteCorrectTime(times, 1000 + i);
  eq('the window stays capped', times.length, SPEED_WINDOW);
  eq('the oldest samples fall off', times[0], 1000 + 5);
}

console.log('--- questions get trickier ---');

{
  eq('a new run starts at the hard garden tier', tierForStreak(0), 3);
  eq('two in a row stays there', tierForStreak(2), 3);
  eq('three in a row steps up', tierForStreak(3), 4);
  eq('six in a row is the top', tierForStreak(6), 5);
  eq('the top has a ceiling', tierForStreak(40), 5);
}

{
  const rng = mulberry32(3);
  const easy = makeQuestion(3, rng, NOW, 'qqqqqqqqqqqqqqqqqq', 'counting');
  const hard = makeQuestion(5, mulberry32(4), NOW, 'rrrrrrrrrrrrrrrrrr', 'counting');
  ok('tier 5 counts further than tier 3', hard.pub.count >= 6 && hard.pub.count <= 12, String(hard.pub.count));
  ok('tier 3 counting stays small', easy.pub.count >= 2 && easy.pub.count <= 5, String(easy.pub.count));
  eq('the reply the player sees has no answer', easy.pub.answer, undefined);
  ok('the answer is not a field on the public question', !Object.prototype.hasOwnProperty.call(easy.pub, 'answer'));
  eq('the hidden answer is one of the choices', easy.pub.options.some((o) => o.id === easy.secret.answer), true);
  const shape = makeQuestion(4, mulberry32(8), NOW, 'ssssssssssssssssss', 'shapes');
  ok('from tier 4 a shape is a riddle, not its name', shape.pub.prompt.startsWith('Which'), shape.pub.prompt);
  const letters = makeQuestion(5, mulberry32(9), NOW, 'tttttttttttttttttt', 'letters');
  const labels = letters.pub.options.map((o) => o.label);
  const pairs = [['E', 'F'], ['M', 'W'], ['O', 'Q'], ['P', 'R'], ['C', 'G'], ['V', 'W'], ['B', 'D']];
  ok('tier 5 letters include a lookalike', pairs.some((p) => p.every((l) => labels.includes(l))), labels.join(','));
}

console.log('--- points are computed here ---');

{
  const slow = pointsFor(3, 8000, 9000, 1);
  const fast = pointsFor(3, 500, 9000, 1);
  const higher = pointsFor(5, 500, 6000, 1);
  const run = pointsFor(3, 500, 9000, 4);
  ok('a faster correct answer is worth more', fast > slow, `${fast} vs ${slow}`);
  ok('a harder tier is worth more', higher > fast, `${higher} vs ${fast}`);
  ok('a longer run is worth more', run > fast, `${run} vs ${fast}`);
  eq('the run bonus stops climbing', pointsFor(3, 500, 9000, 7), pointsFor(3, 500, 9000, 30));
  eq('a correct answer is never zero', pointsFor(3, 8900, 9000, 1) >= 1, true);
}

{
  const issuedAt = NOW;
  const limitMs = 9000;
  const good = judge({
    issuedAt, now: issuedAt + 1000, limitMs, used: false,
    choice: 'a', answer: 'a', tier: 3, streak: 2,
  });
  eq('a real correct tap scores', good.correct, true);
  eq('the run grows by one', good.streak, 3);
  ok('points match the formula and nothing else', good.points === pointsFor(3, 1000, limitMs, 3));

  const tooQuick = judge({
    issuedAt, now: issuedAt + (MIN_HUMAN_MS - 1), limitMs, used: false,
    choice: 'a', answer: 'a', tier: 5, streak: 9,
  });
  eq('a reply quicker than a person can move scores nothing', tooQuick.points, 0);
  eq('that reply is not accepted', tooQuick.accepted, false);
  eq('and the run does not survive it', tooQuick.streak, 0);
  eq('the question is spent', tooQuick.consume, true);

  const wrong = judge({
    issuedAt, now: issuedAt + 1200, limitMs, used: false,
    choice: 'b', answer: 'a', tier: 3, streak: 4,
  });
  eq('a miss ends the run', wrong.streak, 0);
  eq('a miss is not worth points', wrong.points, 0);

  const late = judge({
    issuedAt, now: issuedAt + limitMs + 801, limitMs, used: false,
    choice: 'a', answer: 'a', tier: 3, streak: 1,
  });
  eq('after the bar, a correct tap is a miss', late.correct, false);

  const reused = judge({
    issuedAt, now: issuedAt + 1000, limitMs, used: true,
    choice: 'a', answer: 'a', tier: 3, streak: 4,
  });
  eq('a question cannot be scored twice', reused.accepted, false);
  eq('a replay does not consume again', reused.consume, false);
}

console.log('--- the board is opt-in and anonymous ---');

{
  eq('a blank nickname is refused', cleanHandle('  ').ok, false);
  eq('an email is refused', cleanHandle('pip@kide.us').ok, false);
  eq('a link is refused', cleanHandle('kide.us/play').ok, false);
  eq('a phone number is refused', cleanHandle('5551234567').ok, false);
  eq('digits alone are refused', cleanHandle('42').ok, false);
  eq('a short nickname is kept', cleanHandle('  Sunny Oak  ').handle, 'Sunny Oak');
  eq('player tokens are the anonymous shape', validPlayerId(PID), true);
  eq('an email is not a player token', validPlayerId('parent@kide.us'), false);
}

{
  const a = new Date(Date.UTC(2026, 9, 26));
  const b = new Date(Date.UTC(2026, 9, 31));
  const c = new Date(Date.UTC(2026, 10, 2));
  eq('a Monday and the Saturday of that week share a board', weekKey(a), weekKey(b));
  ok('the next week is a different board', weekKey(b) !== weekKey(c), weekKey(b) + ' vs ' + weekKey(c));
}

{
  const kv = memoryKv();
  const rng = mulberry32(11);
  const first = await issueQuestion(kv, PID, NOW, rng);
  eq('a question is issued', first.status, 200);
  ok('the issued question does not carry the answer', first.body.question.answer === undefined);
  const secret = kv.raw('chal:q:' + first.body.question.id);

  const sneaky = await dispatchChallenge(new Request('http://kide.test/api/challenge/answer', {
    method: 'POST',
    body: JSON.stringify({
      playerId: PID,
      questionId: first.body.question.id,
      choice: secret.answer,
      points: 999999,
      email: 'child@example.com',
      childName: 'Sam',
    }),
  }), kv, NOW + 1000, rng);
  const scored = await sneaky.json();
  eq('the smuggled total is ignored', scored.points === 999999, false);
  eq('the score is the one computed here', scored.points, pointsFor(secret.tier, 1000, secret.limitMs, 1));
  eq('it was correct', scored.correct, true);
  const stored = kv.raw('chal:p:' + PID);
  ok('no email was stored', stored.email === undefined && !JSON.stringify(stored).includes('example.com'));
  ok('no child name was stored', stored.childName === undefined && !JSON.stringify(stored).includes('Sam'));

  const hidden = await getBoard(kv, NOW + 1000);
  eq('the board stays empty until a grown-up opts in', hidden.body.entries.length, 0);

  const named = await setHandle(kv, PID, 'Sunny Oak', true, NOW + 1000);
  eq('the nickname is accepted', named.body.handle, 'Sunny Oak');
  const shown = await getBoard(kv, NOW + 1000);
  eq('the board shows the nickname', shown.body.entries[0].handle, 'Sunny Oak');
  eq('and the points earned, not a client total', shown.body.entries[0].points, scored.weekPoints);
  eq('the board row has no player token', shown.body.entries[0].id, undefined);

  const off = await setHandle(kv, PID, 'Sunny Oak', false, NOW + 1000);
  eq('turning it off is allowed', off.body.show, false);
  const gone = await getBoard(kv, NOW + 1000);
  eq('the nickname leaves the board', gone.body.entries.length, 0);

  const refused = await setHandle(kv, PID, 'pip@kide.us', true, NOW + 1000);
  eq('an email cannot be shown', refused.status, 400);
}

{
  const kv = memoryKv();
  const rng = mulberry32(21);
  const issued = await issueQuestion(kv, PID, NOW, rng);
  const id = issued.body.question.id;
  const secret = kv.raw('chal:q:' + id);
  const quick = await answerQuestion(kv, PID, id, secret.answer, NOW + 20);
  eq('a too-quick correct tap earns nothing', quick.body.points, 0);
  eq('and does not start a run', quick.body.streak, 0);
  const again = await answerQuestion(kv, PID, id, secret.answer, NOW + 2000);
  eq('that question cannot be retried more slowly', again.body.points, 0);

  const second = await issueQuestion(kv, PID, NOW + 3000, rng);
  const secret2 = kv.raw('chal:q:' + second.body.question.id);
  const good = await answerQuestion(kv, PID, second.body.question.id, secret2.answer, NOW + 4500);
  eq('a later, human-paced tap still scores', good.body.correct, true);
  eq('the run is 1', good.body.streak, 1);

  await issueQuestion(kv, PID, NOW + 6000, rng);
  const abandoned = await issueQuestion(kv, PID, NOW + 7000, rng);
  eq('an open question can be replaced', abandoned.status, 200);
  const afterAbandon = kv.raw('chal:p:' + PID);
  eq('leaving a question open ends the run', afterAbandon.streak, 0);
}

{
  const kv = memoryKv();
  const rng = mulberry32(30);
  let t = NOW;
  for (let i = 0; i < WINDOW_MAX; i++) {
    const issued = await issueQuestion(kv, PID, t, rng);
    eq(`question ${i + 1} is allowed`, issued.status, 200);
    t += 1000;
  }
  const capped = await issueQuestion(kv, PID, t, rng);
  eq('past the cap, Pip asks for a rest', capped.body.error, 'rest');
  eq('the cap is a 429', capped.status, 429);
}

{
  const kv = memoryKv();
  const rng = mulberry32(40);
  const issued = await issueQuestion(kv, PID, NOW, rng);
  const secret = kv.raw('chal:q:' + issued.body.question.id);
  await answerQuestion(kv, PID, issued.body.question.id, secret.answer, NOW + 1000);
  await setHandle(kv, PID, 'Oak', true, NOW + 1000);
  const nextWeek = Date.UTC(2026, 10, 4, 12, 0, 0);
  const fresh = await issueQuestion(kv, PID, nextWeek, rng);
  const secret2 = kv.raw('chal:q:' + fresh.body.question.id);
  const scored = await answerQuestion(kv, PID, fresh.body.question.id, secret2.answer, nextWeek + 1000);
  ok('a new week does not keep last week’s points', scored.body.weekPoints === scored.body.points, String(scored.body.weekPoints));
  const board = await getBoard(kv, nextWeek + 1000);
  eq('this week’s board is that new total', board.body.entries[0].points, scored.body.weekPoints);
  const old = await getBoard(kv, NOW + 1000);
  eq('last week’s board was not deleted', old.body.entries.length, 1);
  eq('the player record rolled to the new week', kv.raw('chal:p:' + PID).week, weekKey(new Date(nextWeek)));
}

{
  const frozen = freezePlayer({
    handle: 'Oak', show: true, week: '2026-W44', weekPoints: 12, streak: 2,
    email: 'a@b.c', childName: 'Sam', audio: [1, 2, 3], dob: '2020-01-01',
  }, NOW);
  ok('unexpected fields are dropped', frozen.email === undefined && frozen.childName === undefined && frozen.audio === undefined && frozen.dob === undefined);
  eq('the nickname remains', frozen.handle, 'Oak');
}

console.log('--- the pages a visitor actually sees ---');

{
  const play = readFileSync('./public/play/index.html', 'utf8');
  const worker = readFileSync('./src/worker/index.ts', 'utf8');
  ok('Pip says the pace line', play.includes('Either a kid is playing at a grown-up level'));
  ok('the timer uses the motion bar', play.includes('class="motion-bar"'));
  ok('reduced motion snaps the bar', /prefers-reduced-motion:\s*reduce[\s\S]*\.motion-bar i\{transition:none/.test(play));
  ok('the grown-up nickname warning is on the page', /not your child/i.test(play));
  ok('the no-accounts sentence is untouched', play.includes('No accounts. No ads shown to your child.'));
  ok('visitor copy does not name the machinery', !/anti-cheat|anti cheat|phase P|P1 accounts|wrangler|KIDE_LEADS/i.test(play));
  const served = readFileSync('./public/engine/challenge.js', 'utf8');
  ok('the script a browser can open does not name the machinery', !/anti-cheat|anti cheat|phase P|P1 accounts|wrangler|KIDE_LEADS/i.test(served));
  ok('billing routes are still the clinician routes', worker.includes('if (url.pathname.startsWith("/api/clinician/"))'));
  ok('the no-accounts note in the worker is untouched', worker.includes('no accounts, that is the'));
  ok('challenge is dispatched beside the other routes', worker.includes('dispatchChallenge'));
  const routineStart = play.indexOf('function routineTap()');
  const routineEnd = play.indexOf('function startRoutine(');
  const routineBody = play.slice(routineStart, routineEnd);
  ok('Pip\'s Turn still does not record a pace', !routineBody.includes('noteSpeed'));
  const chalStart = play.indexOf('function submitChallenge(');
  const chalEnd = play.indexOf('function screenBoard(');
  const chalBody = play.slice(chalStart, chalEnd);
  ok('challenge taps are not written into the practice record', !chalBody.includes('recordPractice'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  failures.forEach((f) => console.log('  FAIL ' + f));
  process.exit(1);
}
