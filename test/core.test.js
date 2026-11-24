'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../steplight-core.js');

test('parseDump splits lines, semicolons and "then", drops finished and duplicate items', () => {
  const tasks = core.parseDump('- Email Ms. Tan by fri\n[x] pay rent\n[ ] buy milk; buy milk\n1. write essay then send !!', 'a');
  assert.deepEqual(tasks.map(t => t.text), ['Email Ms. Tan by fri', 'buy milk', 'write essay', 'send !!']);
  assert.equal(tasks[0].due, 'fri');
  assert.equal(tasks[3].urgent, true);
  assert.equal(tasks[1].urgent, false);
});

test('bullets before checkboxes: "- [x]" is finished, "- [ ]" and "* [ ]" are open', () => {
  const finished = ['- [x] pay rent', '* [x] pay rent', '1. [x] pay rent', '- [X] pay rent', '  - [x] pay rent'];
  for (const line of finished) assert.deepEqual(core.parseDump(line), [], line);
  const open = ['- [ ] email Ms. Tan by fri', '* [ ] email Ms. Tan by fri', '1. [ ] email Ms. Tan by fri', '[ ] email Ms. Tan by fri'];
  for (const line of open) {
    const t = core.parseDump(line);
    assert.equal(t.length, 1, line);
    assert.equal(t[0].text, 'email Ms. Tan by fri', line);
  }
  assert.deepEqual(core.parseDump('- [ ]').map(t => t.text), []);
});

test('parseDump returns no tasks for empty input', () => {
  assert.deepEqual(core.parseDump(''), []);
  assert.deepEqual(core.parseDump(undefined), []);
});

test('suggestOrder puts urgent first, then dated, then the rest in original order', () => {
  const tasks = core.parseDump('clean desk\nemail prof by fri\nbuy tea !!\nread paper\nlaundry tomorrow');
  const names = core.suggestOrder(tasks).map(t => t.text);
  assert.deepEqual(names, ['buy tea !!', 'email prof by fri', 'laundry tomorrow', 'clean desk', 'read paper']);
});

test('starterStep uses the matching rule and falls back when nothing matches', () => {
  assert.equal(core.starterStep('reply to Ms. Tan'), 'Open the message and write only the first line.');
  assert.equal(core.starterStep('buy milk'), 'Write the three items you need on paper.');
  assert.equal(core.starterStep('zzz unknown'), 'Write down the first physical action for this task, then do only that.');
});

test('smallerSteps returns three steps, none equal to the first step', () => {
  const steps = core.smallerSteps('write the whole thesis');
  assert.equal(steps.length, 3);
  assert.ok(steps[0].includes('write the whole thesis'));
  assert.ok(!steps.includes(core.starterStep('write the whole thesis')));
});

test('smallerSteps first step differs from the starter step, and marks are removed', () => {
  for (const t of ['buy milk!!', 'email Ms. Tan by fri', 'urgent: file taxes tomorrow', 'reply to Ms. Tan']) {
    const steps = core.smallerSteps(t);
    assert.notEqual(steps[0], core.starterStep(t), t);
    for (const st of steps) {
      assert.ok(!/!/.test(st), 'bang left in: ' + st);
      assert.ok(!/\b(fri|tomorrow|urgent)\b/i.test(st), 'day/urgent word left in: ' + st);
    }
  }
  assert.ok(core.smallerSteps('buy milk!!')[0].includes('buy milk'));
  assert.ok(!core.smallerSteps('email Ms. Tan by fri')[0].endsWith(' by'));
});

test('plainTask strips urgency and day words, keeps the rest', () => {
  assert.equal(core.plainTask('email Ms. Tan by fri'), 'email Ms. Tan');
  assert.equal(core.plainTask('buy milk!!'), 'buy milk');
  assert.equal(core.plainTask('!!'), '!!');
});

test('cleanLine treats other bullet symbols the same way (+, en dash, em dash, minus, middle dot)', () => {
  const finished = ['+ [x] pay rent', '\u2013 [x] pay rent', '\u2014 [x] pay rent', '\u2212 [x] pay rent', '\u30fb [x] pay rent', '\u2022 [x] pay rent', '+ [X] pay rent'];
  for (const line of finished) assert.deepEqual(core.parseDump(line), [], line);
  const open = ['+ [ ] email Ms. Tan', '\u2013 [ ] email Ms. Tan', '\u2014 email Ms. Tan'];
  for (const line of open) assert.deepEqual(core.parseDump(line).map(t => t.text), ['email Ms. Tan'], line);
});

test('pairSteps lines the two paths up by step number, padding the shorter one', () => {
  const rows = core.pairSteps(['b1', 'b2', 'b3'], ['a1', 'a2']);
  assert.deepEqual(rows, [
    { n: 1, builtin: 'b1', ai: 'a1' },
    { n: 2, builtin: 'b2', ai: 'a2' },
    { n: 3, builtin: 'b3', ai: '' }
  ]);
  assert.deepEqual(core.pairSteps(['b1'], null), [{ n: 1, builtin: 'b1', ai: '' }]);
});

const ok3 = ['Open the file', 'Type the title', 'Save it'];

test('parseAISteps accepts exactly one JSON array of 3 to 5 short strings', () => {
  assert.deepEqual(core.parseAISteps(JSON.stringify(ok3)), { ok: true, steps: ok3 });
  assert.deepEqual(core.parseAISteps('```json\n' + JSON.stringify(ok3) + '\n```'), { ok: true, steps: ok3 });
  assert.deepEqual(core.parseAISteps(JSON.stringify(['a', 'b', 'c', 'd', 'e'])).ok, true);
  const twelve = Array(12).fill('word').join(' ');
  assert.equal(core.parseAISteps(JSON.stringify([twelve, 'b', 'c'])).ok, true);
});

test('parseAISteps rejects prose around the array and multiple arrays', () => {
  assert.equal(core.parseAISteps('Here: ' + JSON.stringify(ok3)).ok, false);
  assert.equal(core.parseAISteps(JSON.stringify(ok3) + ' and ' + JSON.stringify(ok3)).ok, false);
  assert.equal(core.parseAISteps('["a"] and ["b"]').ok, false);
});

test('parseAISteps rejects non-arrays, wrong counts, non-strings, empty and long steps', () => {
  assert.match(core.parseAISteps('{"steps": []}').reason, /not a JSON array/);
  assert.match(core.parseAISteps(JSON.stringify(['a', 'b'])).reason, /not 3 to 5/);
  assert.match(core.parseAISteps(JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f'])).reason, /not 3 to 5/);
  assert.match(core.parseAISteps(JSON.stringify(['a', 3, 'c'])).reason, /step 2 is not a string/);
  assert.match(core.parseAISteps(JSON.stringify(['a', '   ', 'c'])).reason, /step 2 is empty/);
  assert.match(core.parseAISteps(JSON.stringify(['a', Array(13).fill('w').join(' '), 'c'])).reason, /step 2 is longer than 12 words/);
  assert.match(core.parseAISteps(null).reason, /no text/);
  assert.equal(core.parseAISteps('').ok, false);
});

test('parseAISteps accepts an uppercase JSON code fence and rejects long steps by character count', () => {
  assert.equal(core.parseAISteps('```JSON\n' + JSON.stringify(ok3) + '\n```').ok, true);
  const long = 'x'.repeat(121);
  const r = core.parseAISteps(JSON.stringify(['a', long, 'c']));
  assert.equal(r.ok, false);
  assert.match(r.reason, /longer than 120 characters/);
  // 12 words of about 33 characters each, i.e. a ~400-character array item: rejected
  const fat = Array(12).fill('abcdefghijklmnopqrstuvwxyzabcde').join(' ');
  assert.equal(core.parseAISteps(JSON.stringify([fat, 'b', 'c'])).ok, false);
});

test('buildAIPrompt includes the task and the output rule', () => {
  const p = core.buildAIPrompt('file taxes');
  assert.ok(p.includes('file taxes'));
  assert.ok(p.includes('JSON array'));
  assert.ok(p.includes('12 words or fewer'));
});

test('starterStep treats "book an appointment" as booking, not reading', () => {
  assert.strictEqual(core.starterStep('book dentist appointment!!'), 'Open the booking page or find the phone number, and pick one free time.');
  assert.strictEqual(core.starterStep('read chapter 4'), 'Open it and read only the title and the first paragraph.');
});
