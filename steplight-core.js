// StepLight core logic (pure functions, no DOM). Used by app.js and by test/core.test.js.
(function (root) {
  'use strict';

  var DAY_WORD = /\b(today|tonight|tomorrow|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  var URGENT_WORD = /!!|\burgent\b|\basap\b/i;

  // Fixed starter steps for common task types. The AI layer (optional) can replace them.
  var STARTERS = [
    [/\b(appointment|appt|reservation|reserve|dentist|doctor|clinic|haircut)\b/i, 'Open the booking page or find the phone number, and pick one free time.'],
    [/\b(mail|email|reply|respond|message|inbox)\b/i, 'Open the message and write only the first line.'],
    [/\b(buy|shop|purchase|order|groceries)\b/i, 'Write the three items you need on paper.'],
    [/\b(clean|tidy|laundry|dishes|vacuum|room)\b/i, 'Pick up the first item that is out of place.'],
    [/\b(read|chapter|article|paper|book)\b/i, 'Open it and read only the title and the first paragraph.'],
    [/\b(write|essay|report|draft|assignment|slides|present)\b/i, 'Open the document and type its title.'],
    [/\b(call|phone|dial)\b/i, 'Dial the number and wait for the first ring.'],
    [/\b(pay|bill|invoice|tax|form|apply|register|submit)\b/i, 'Open the page or letter and find the deadline.'],
    [/\b(study|exam|test|quiz|review|learn)\b/i, 'Open the material and write the first question you cannot answer.']
  ];
  var FALLBACK_STARTER = 'Write down the first physical action for this task, then do only that.';

  function cleanLine(line) {
    var s = String(line).trim();
    s = s.replace(/^([-*+•\u2013\u2014\u2212\u30fb]|\d+[.)])\s+/, ''); // bullet or number first (also + – — − ・)
    s = s.trim();
    if (!s) return null;
    if (/^\[[xX]\]/.test(s)) return null;          // already finished
    s = s.replace(/^\[\s?\]\s*/, '');              // open checkbox
    s = s.trim();
    return s || null;
  }

  // Split a pasted dump into tasks. Lines, semicolons and " then " separate tasks.
  // Finished [x] items and duplicates are dropped.
  function parseDump(text, idPrefix) {
    var prefix = idPrefix || 't';
    var out = [];
    var seen = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line.split(/;|\s+then\s+/i).forEach(function (part) {
        var s = cleanLine(part);
        if (!s) return;
        var key = s.toLowerCase().replace(/\s+/g, ' ');
        if (seen[key]) return;
        seen[key] = true;
        var dayMatch = s.match(DAY_WORD);
        out.push({
          id: prefix + out.length,
          text: s,
          due: dayMatch ? dayMatch[0].toLowerCase() : null,
          urgent: URGENT_WORD.test(s),
          done: false
        });
      });
    });
    return out;
  }

  function rank(task) {
    if (task.urgent) return 0;
    if (task.due) return 1;
    return 2;
  }

  // Suggested order only. Nothing is hidden and nothing is decided for the user.
  function suggestOrder(tasks) {
    return tasks
      .map(function (t, i) { return { t: t, i: i }; })
      .sort(function (a, b) { return (rank(a.t) - rank(b.t)) || (a.i - b.i); })
      .map(function (x) { return x.t; });
  }

  function starterStep(task) {
    var text = typeof task === 'string' ? task : task.text;
    for (var i = 0; i < STARTERS.length; i++) {
      if (STARTERS[i][0].test(text)) return STARTERS[i][1];
    }
    return FALLBACK_STARTER;
  }

  // The task wording without urgency marks and day words, for use inside steps.
  function plainTask(text) {
    return String(text)
      .replace(/!+/g, ' ')
      .replace(/\b(urgent|asap)\b/gi, ' ')
      .replace(/\b(today|tonight|tomorrow|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+(by|on|before|for)$/i, '')
      .replace(/^[\s:;,\-\u2013\u2014]+|[\s:;,]+$/g, '')
      .trim() || String(text).trim();
  }

  // "Too big" button: a shorter path through the same task. Distinct from the first step.
  function smallerSteps(task) {
    var text = typeof task === 'string' ? task : task.text;
    var plain = plainTask(text);
    return [
      'Set a 2-minute timer and do only the first part of: ' + plain,
      'When the timer ends, write one line about where you stopped.',
      'Pick the next smallest piece of "' + plain + '" and do that piece only.'
    ];
  }

  // Pair the built-in path with the AI path, step by step, for side-by-side viewing.
  function pairSteps(builtin, ai) {
    var n = Math.max(builtin.length, ai ? ai.length : 0);
    var rows = [];
    for (var i = 0; i < n; i++) {
      rows.push({ n: i + 1, builtin: builtin[i] || '', ai: (ai && ai[i]) || '' });
    }
    return rows;
  }

  // Check the model's reply strictly. The whole reply must be one JSON array
  // (an optional code fence is allowed), with 3 to 5 strings of at most 12 words each.
  // Anything else is rejected with a reason, and the app falls back to the built-in step.
  var MAX_STEP_WORDS = 12;
  var MAX_STEP_CHARS = 120;
  var MIN_STEPS = 3;
  var MAX_STEPS = 5;

  function parseAISteps(raw) {
    if (typeof raw !== 'string') return { ok: false, reason: 'no text in the reply' };
    var body = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim();
    var arr;
    try { arr = JSON.parse(body); } catch (e) { return { ok: false, reason: 'the reply is not valid JSON' }; }
    if (!Array.isArray(arr)) return { ok: false, reason: 'the reply is not a JSON array' };
    if (arr.length < MIN_STEPS || arr.length > MAX_STEPS) {
      return { ok: false, reason: 'the reply has ' + arr.length + ' steps, not 3 to 5' };
    }
    var steps = [];
    for (var i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'string') return { ok: false, reason: 'step ' + (i + 1) + ' is not a string' };
      var s = arr[i].trim();
      if (!s) return { ok: false, reason: 'step ' + (i + 1) + ' is empty' };
      if (s.length > MAX_STEP_CHARS) {
        return { ok: false, reason: 'step ' + (i + 1) + ' is longer than ' + MAX_STEP_CHARS + ' characters' };
      }
      if (s.split(/\s+/).length > MAX_STEP_WORDS) {
        return { ok: false, reason: 'step ' + (i + 1) + ' is longer than ' + MAX_STEP_WORDS + ' words' };
      }
      steps.push(s);
    }
    return { ok: true, steps: steps };
  }

  function buildAIPrompt(taskText) {
    return 'A student has this task and cannot start it: "' + taskText + '"\n' +
      'Give 3 to 5 concrete first physical actions, each 12 words or fewer, in the order to do them. ' +
      'Reply only with a JSON array of strings and nothing else.';
  }

  var api = {
    parseDump: parseDump,
    suggestOrder: suggestOrder,
    starterStep: starterStep,
    smallerSteps: smallerSteps,
    plainTask: plainTask,
    pairSteps: pairSteps,
    parseAISteps: parseAISteps,
    buildAIPrompt: buildAIPrompt
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StepLightCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
