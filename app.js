(function () {
  'use strict';
  var core = window.StepLightCore;
  var KEY = 'steplight.v2';
  var state = { tasks: [], currentId: null, notes: {}, batch: 0 };
  var $ = function (id) { return document.getElementById(id); };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.tasks)) state = Object.assign(state, s);
      }
    } catch (e) { /* storage blocked: the app still works for this visit */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not persisted */ }
  }
  function announce(msg) { $('live').textContent = msg; }

  function openTasks() { return state.tasks.filter(function (t) { return !t.done; }); }
  function taskById(id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
    return null;
  }

  function show(view) {
    ['dump', 'list', 'focus'].forEach(function (v) {
      $('view-' + v).hidden = v !== view;
      $('nav-' + v).setAttribute('aria-pressed', String(v === view));
    });
  }

  function renderList() {
    var ol = $('task-list');
    ol.textContent = '';
    var ordered = core.suggestOrder(openTasks());
    $('empty-note').hidden = ordered.length > 0;
    $('list-status').textContent = ordered.length + ' open, ' + (state.tasks.length - ordered.length) + ' done. Saved only in this browser.';
    ordered.forEach(function (t, n) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = t.text;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = (t.urgent ? 'urgent' : '') + (t.urgent && t.due ? ', ' : '') + (t.due || '');
      span.appendChild(document.createElement('br'));
      span.appendChild(meta);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Start';
      btn.setAttribute('aria-label', 'Start ' + (n + 1) + ' of ' + ordered.length + ': ' + t.text);
      btn.addEventListener('click', function () { startFocus(t.id); });
      li.appendChild(span);
      li.appendChild(btn);
      ol.appendChild(li);
    });
  }

  function resetFocusPanels() {
    clearPathLists();
    $('chosen-note').textContent = '';
    $('ai-note').hidden = true;
    $('pause-box').hidden = true;
    $('resume-note').hidden = true;
  }

  function startFocus(id) {
    var t = taskById(id);
    if (!t || t.done) return;
    state.currentId = id;
    save();
    show('focus');
    resetFocusPanels();
    var ordered = core.suggestOrder(openTasks());
    var pos = ordered.findIndex(function (x) { return x.id === id; });
    var next = ordered[pos + 1];
    $('focus-task').textContent = t.text;
    $('focus-pos').textContent = 'Task ' + (pos + 1) + ' of ' + ordered.length + ' open (suggested order)' +
      (next ? '. Next after this: ' + next.text : '. This is the last open task.');
    $('focus-step').textContent = core.starterStep(t.text);
    var note = state.notes[id];
    if (note) {
      $('resume-note').textContent = 'Welcome back. Last time you stopped at: ' + note;
      $('resume-note').hidden = false;
    }
    $('focus-step').focus();
  }

  function nextTask() {
    var ordered = core.suggestOrder(openTasks());
    return ordered.length ? ordered[0] : null;
  }

  function done() {
    var t = taskById(state.currentId);
    if (t) { t.done = true; delete state.notes[t.id]; }
    save();
    var nx = nextTask();
    if (nx) { announce('Done. Next step ready.'); startFocus(nx.id); }
    else { state.currentId = null; save(); announce('All open tasks are done.'); show('list'); renderList(); }
  }

  function tooBig() {
    var t = taskById(state.currentId);
    if (!t) return;
    clearPathLists();
    var ol = $('smaller');
    ol.textContent = '';
    core.smallerSteps(t.text).forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      ol.appendChild(li);
    });
    ol.hidden = false;
    announce('Shown a smaller path.');
  }

  function pause() {
    $('pause-box').hidden = false;
    $('pause-note').value = state.notes[state.currentId] || '';
    $('pause-note').focus();
  }

  function savePause() {
    var t = taskById(state.currentId);
    if (t) state.notes[t.id] = $('pause-note').value.trim() || 'no note';
    save();
    state.currentId = null;
    save();
    announce('Paused. Your note is saved.');
    show('list');
    renderList();
  }

  var aiSteps = null;      // last accepted AI steps for the current task
  var pathChoice = 'fixed'; // 'fixed' or 'ai': which path the list shows

  function clearPathLists() {
    var ol = $('smaller');
    ol.textContent = '';
    ol.hidden = true;
    $('compare').hidden = true;
    $('compare-choice').hidden = true;
    $('compare-body').textContent = '';
    aiSteps = null;
    pathChoice = 'fixed';
  }

  function showPath(which) {
    var t = taskById(state.currentId);
    if (!t) return;
    pathChoice = which;
    var steps = which === 'ai' && aiSteps ? aiSteps : [core.starterStep(t.text)];
    var ol = $('smaller');
    ol.textContent = '';
    steps.forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
    ol.hidden = false;
    $('chosen-note').textContent = which === 'ai' && aiSteps
      ? 'Showing the on-device AI steps.'
      : 'Showing the fixed step from the built-in table.';
    $('btn-use-fixed').setAttribute('aria-pressed', String(which !== 'ai' || !aiSteps));
    $('btn-use-ai').setAttribute('aria-pressed', String(which === 'ai' && !!aiSteps));
  }

  function renderCompare(taskText) {
    var rows = core.pairSteps([core.starterStep(taskText)], aiSteps);
    var body = $('compare-body');
    body.textContent = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      [String(r.n), r.builtin || '-', r.ai || '-'].forEach(function (text) {
        var td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('compare').hidden = false;
    $('compare-choice').hidden = false;
  }

  // Optional: built-in browser AI (Chrome Prompt API). No key, no network call to a server.
  // Falls back to the fixed starter step when the API is missing, unusable, or the reply is rejected.
  function askAI() {
    var t = taskById(state.currentId);
    if (!t) return;
    clearPathLists();
    var note = $('ai-note');
    note.hidden = false;
    if (!('LanguageModel' in window)) {
      note.textContent = 'This browser has no on-device AI, so the fixed step above is used. The app works the same without it.';
      return;
    }
    note.textContent = 'Asking on-device AI...';
    var session = null;
    var opts = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
    window.LanguageModel.availability(opts)
      .then(function (status) {
        if (status !== 'available') throw new Error('on-device AI status is "' + status + '"');
        return window.LanguageModel.create(opts);
      })
      .then(function (s) { session = s; return s.prompt(core.buildAIPrompt(t.text)); })
      .then(function (raw) {
        var r = core.parseAISteps(raw);
        if (!r.ok) throw new Error('the AI reply was rejected: ' + r.reason);
        aiSteps = r.steps;
        renderCompare(t.text);
        showPath('ai');
        note.textContent = 'These steps come from on-device AI and passed the checks (3 to 5 steps, 12 words or fewer each, 120 characters or fewer each). Compare them with the fixed step below and check them against the task before you start.';
      })
      .catch(function (err) {
        clearPathLists();
        note.textContent = 'Could not use on-device AI: ' + (err && err.message ? err.message : 'unknown error') + '. The fixed step above is shown instead.';
      })
      .then(function () { if (session && session.destroy) session.destroy(); });
  }

  function bind() {
    $('nav-dump').addEventListener('click', function () { show('dump'); });
    $('nav-list').addEventListener('click', function () { show('list'); renderList(); });
    $('nav-focus').addEventListener('click', function () {
      var t = taskById(state.currentId);
      if (t && !t.done) startFocus(t.id); else { announce('Pick a task first.'); show('list'); renderList(); }
    });
    $('make-list').addEventListener('click', function () {
      state.batch += 1;
      var fresh = core.parseDump($('dump').value, 'b' + state.batch + 'x');
      var doneTasks = state.tasks.filter(function (t) { return t.done; });
      var open = openTasks();
      fresh.forEach(function (f) {
        var dup = open.some(function (k) { return k.text.toLowerCase() === f.text.toLowerCase(); });
        if (!dup) open.push(f);
      });
      state.tasks = doneTasks.concat(open);
      save();
      $('dump').value = '';
      show('list');
      renderList();
      announce(openTasks().length + ' open tasks.');
    });
    $('btn-done').addEventListener('click', done);
    $('btn-small').addEventListener('click', tooBig);
    $('btn-pause').addEventListener('click', pause);
    $('btn-save-pause').addEventListener('click', savePause);
    $('btn-ai').addEventListener('click', askAI);
    $('btn-use-fixed').addEventListener('click', function () { showPath('fixed'); });
    $('btn-use-ai').addEventListener('click', function () { if (aiSteps) showPath('ai'); });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === '1') show('dump');
      else if (e.key === '2') { show('list'); renderList(); }
      else if (e.key === '3') { $('nav-focus').click(); }
      else if (!$('view-focus').hidden) {
        var k = e.key.toLowerCase();
        if (k === 'd') done();
        else if (k === 's') tooBig();
        else if (k === 'p') pause();
      }
    });
  }

  load();
  bind();
  if (openTasks().length) { renderList(); show('list'); } else { show('dump'); }
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache not available */ }); } catch (e) { /* ignore */ }
  }
})();
