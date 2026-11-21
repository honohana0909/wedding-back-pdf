(() => {
  'use strict';
  const E = window.PassageEngine;
  const rows = window.PassageChecklist;
  const key = 'passage-todo-v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  let state = E.initialState(), storageBlocked = false, storageMessage = '';
  try {
    const stored = localStorage.getItem(key);
    if (stored) state = E.normalizeState(JSON.parse(stored));
  } catch (_) {
    storageBlocked = true;
    storageMessage = '保存データを読み込めません。現在の入力は保存されません。「新しい婚礼を作る」で保存を再開できます。';
  }
  let filter = 'all', editingId = null, editingEventId = null;
  const dialog = $('#edit-dialog');

  function save() {
    if (storageBlocked) { $('#save-status').textContent = '保存できません'; return; }
    try {
      localStorage.setItem(key, JSON.stringify(state));
      storageMessage = '';
      $('#save-status').textContent = 'このブラウザーに保存済み';
    } catch (_) {
      storageMessage = 'ブラウザーに保存できません。ページを閉じる前に印刷・PDF保存してください。';
      $('#save-status').textContent = '保存できません';
    }
  }
  function fillSetup() {
    document.querySelectorAll('[data-state]').forEach(el => { el.value = state[el.dataset.state]; });
    document.querySelectorAll('[name=course]').forEach(el => { el.checked = el.value === state.course; });
    renderOptions();
    renderTimes();
  }
  function renderOptions() {
    $('#option-fields').innerHTML = E.activeOptions(state).map(([id, label]) => `<label><input type="checkbox" data-option="${id}" ${state.options[id] ? 'checked' : ''}>${esc(label)}</label>`).join('');
  }
  function renderTimes() {
    $('#time-fields').innerHTML = E.chronologicalEvents(state).map(event => `<div class="time-entry ${E.isFoodEvent(event.id,state) ? 'is-food' : ''}"><label class="time-field">${esc(event.label)}<input type="time" data-time="${event.id}" value="${esc(state.times[event.id] || '')}" aria-label="${esc(event.label)}の時刻"></label>${event.custom ? `<button type="button" class="event-edit text-button" data-edit-event="${event.id}" aria-label="${esc(event.label)}を編集">編集</button>` : ''}</div>`).join('');
  }
  function foodNote(food, print = false) {
    return food ? `<small class="${print ? 'p-food-note' : 'food-note'}">${esc(E.foodNote)}</small>` : '';
  }
  function openEventEditor(id = null) {
    editingEventId = id;
    const event = state.customEvents.find(e => e.id === id);
    $('#event-dialog-title').textContent = event ? '進行イベントを編集' : '進行イベントを追加';
    $('#event-name').value = event?.label || '';
    $('#event-time').value = state.times[id] || '';
    $('#event-kind').value = event?.kind || 'progress';
    $('#event-error').textContent = '';
    $('#delete-event').hidden = !event;
    updateEventColor();
    $('#event-dialog').showModal();
    $('#event-name').focus();
  }
  function updateEventColor() {
    $('#event-clock-label').classList.toggle('is-food', $('#event-kind').value === 'food');
  }
  function groupLabel(id) {
    return E.eventLabel(id, state) || ({ongoing:'披露宴中・各料理の前後',unassigned:'進行未指定'}[id]) || '進行未指定';
  }
  function timeBlock(row, which, print = false) {
    const start = which === 'start';
    const time = start ? row.startTime : row.dueTime;
    const manual = start ? row.startManual : row.dueManual;
    const anchor = start ? row.startId : row.dueId;
    const original = start ? row.start : row.deadline;
    const label = start ? '開始' : '期限';
    const missing = anchor ? '時刻未入力' : '時刻未指定';
    const description = manual ? '手動指定' : anchor ? `${E.eventLabel(anchor, state) || original || '進行'}の基準` : '開始・期限の条件を参照';
    if (print) return `<span class="p-time"><strong>${label}：${esc(time || missing)}</strong><small>${esc(time ? description : '')}${original ? `<br>${esc(original)}` : row.custom ? '' : '<br>未入力'}</small></span>`;
    return `<div><span class="time-caption">${label}</span><span class="clock-value ${time ? '' : 'empty'}">${esc(time || missing)}</span><span class="time-relation">${esc(time ? description : '')}</span><span class="original-timing">${esc(original || (row.custom ? '独自ToDo' : '未入力'))}</span></div>`;
  }
  function printTiming(row) {
    const start = row.startTime || row.start || '';
    const due = row.dueTime || row.deadline || '';
    const main = start && due ? start === due ? start : `${start} → ${due}` : due ? `〜 ${due}` : start ? `${start}〜` : '随時';
    // Clock anchors alone do not describe "before/after" or task dependencies.
    const original = [row.start, row.deadline].filter(Boolean);
    const relation = [...new Set(original)].join(' → ');
    return `<span class="p-timing">${esc(main)}</span>${(row.startTime || row.dueTime) && relation && relation !== main ? `<small class="p-relation">${esc(relation)}</small>` : ''}`;
  }
  function printSupplement(row) {
    return row.caution ? `<small class="p-supplement"><span>注意</span> ${esc(row.caution)}</small>` : '';
  }
  function detailPairs(row) {
    return [['場所', row.place], ['必要物', row.equipment], ['連携先', row.contact], ['注意点', row.caution], ['修正内容', row.revision]].filter(([,value]) => value);
  }
  function card(row) {
    return `<article class="todo-card ${row.done ? 'is-done' : ''}" data-id="${esc(row.id)}">
      <div class="todo-top"><label class="done-label"><input type="checkbox" data-done="${esc(row.id)}" ${row.done ? 'checked' : ''} aria-label="${esc(row.title)}を完了"></label><h3 class="todo-title">${esc(row.title)}</h3><button class="edit-button" data-edit="${esc(row.id)}" aria-label="${esc(row.title)}を編集">編集</button></div>
      <div class="task-timing"><span><b>開始</b>${esc(row.startManual || row.start || row.startTime || '未指定')}</span><span><b>期限</b>${esc(row.dueManual || row.deadline || row.dueTime || '未指定')}</span></div>
      <details class="todo-details"><summary>詳細・メモ${row.issues.length ? '<span class="tag warn">要確認</span>' : row.caution ? '<span class="tag warn">注意あり</span>' : ''}</summary>
      <div class="tags"><span class="tag">${esc(row.category)}</span>${row.startManual || row.dueManual ? '<span class="tag gray">時刻を手動指定</span>' : ''}</div>
      <div class="timing-grid">${timeBlock(row, 'start')}${timeBlock(row, 'due')}</div>
      ${row.note ? `<p class="item-note">${esc(row.note)}</p>` : ''}
      ${row.issues.length ? `<div class="item-issues">${row.issues.map(esc).join('<br>')}</div>` : ''}
      <dl class="details-grid">${detailPairs(row).map(([name,value]) => `<dt>${name}</dt><dd>${esc(value)}</dd>`).join('')}</dl></details>
    </article>`;
  }
  function render() {
    const items = E.generate(rows, state);
    const done = items.filter(r => r.done).length;
    const review = items.filter(r => r.issues.length).length;
    $('#total-count').textContent = items.length;
    $('#done-count').textContent = done;
    $('#review-count').textContent = review;
    $('#progress-bar').style.width = `${items.length ? done / items.length * 100 : 0}%`;
    $('#review-notice').textContent = [storageMessage, review ? `${review}件に確認事項があります。開始・期限の空欄や前後関係を確認してください。「確認事項あり」で絞り込めます。` : ''].filter(Boolean).join(' ');
    document.querySelectorAll('[data-order]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.order === state.order)));
    $('#sort-hint').textContent = state.order === 'progress'
      ? '開始の進行を優先し、開始が作業条件の場合は期限を目安に表示。同じ進行では「前 → 時点 → 後」。'
      : '開始の基準時刻（手動指定を優先）→ 期限の基準時刻で整列。時刻がない項目は最後に表示。';
    const visible = items.filter(row => filter === 'all' || (filter === 'unfinished' && !row.done) || (filter === 'review' && row.issues.length) || (filter === 'custom' && row.custom));
    const groups = E.timelineGroups(items, state);
    const currentIndex = groups.findIndex(group => group.rows.some(row => !row.done));
    const visibleIds = new Set(visible.map(row => row.id));
    $('#todo-list').innerHTML = (visible.length || filter === 'all') ? groups.map((group, index) => {
      if (group.event) {
        const time = state.times[group.event.id];
        return `<section class="timeline-stage stage-milestone ${E.isFoodEvent(group.event.id,state) ? 'is-food' : ''}" aria-labelledby="stage-${index}"><header class="stage-heading">
          <div class="stage-time">${time ? `<time>${esc(time)}</time>` : '<span class="unset-time">時刻未入力</span>'}<small>進行の基準</small></div>
          <div class="stage-event">${index === currentIndex + 1 && currentIndex !== -1 ? '<span class="stage-status">次の工程</span>' : ''}<div class="stage-title"><h3 id="stage-${index}">${esc(E.eventLabel(group.event.id, state))}</h3>${foodNote(E.isFoodEvent(group.event.id,state))}</div></div>
        </header></section>`;
      }
      const groupRows = group.rows.filter(row => visibleIds.has(row.id));
      if (!groupRows.length) return '';
      const first = group.rows[0];
      const labels = [...new Set(group.rows.map(row => groupLabel(row.group)))];
      const label = state.order === 'progress' ? groupLabel(first.group) : labels.join(' ／ ');
      const time = state.order === 'progress' ? state.times[first.group] : first.startTime || first.dueTime;
      const missing = state.order === 'progress' && E.eventLabel(first.group,state) ? '時刻未入力' : '時刻未指定';
      const isCurrent = index === currentIndex;
      const isFood = group.rows.every(row => E.isFoodEvent(row.group,state));
      const isDone = group.rows.every(row => row.done);
      return `<section class="timeline-stage ${isFood ? 'is-food' : ''} ${isCurrent ? 'is-current' : ''} ${isDone ? 'stage-done' : ''}" aria-labelledby="stage-${index}">
        <header class="stage-heading">
          <div class="stage-time">${time ? `<time>${esc(time)}</time>` : `<span class="unset-time">${missing}</span>`}<small>${state.order === 'progress' ? '進行の基準' : '作業の基準'}</small></div>
          <div class="stage-event">${isCurrent ? '<span class="stage-status">ここから <small>未完了の先頭</small></span>' : index === currentIndex + 1 && currentIndex !== -1 ? '<span class="stage-status">次の工程</span>' : isDone ? '<span class="stage-status">完了</span>' : ''}<div class="stage-title"><h3 id="stage-${index}">${esc(label)}</h3>${foodNote(group.rows.some(row => E.isFoodEvent(row.group,state)))}</div></div>
        </header>
        <div class="stage-tasks">${groupRows.map(card).join('')}</div>
      </section>`;
    }).join('') : '<div class="empty-state">この条件に該当するToDoはありません。</div>';
    const printed = E.printable(items, state);
    $('#print-count').textContent = `印刷対象 ${printed.length}件（当日のToDoすべて）。A4縦・件数により複数ページ。`;
    buildPrint(items);
  }
  function buildPrint(items = E.generate(rows, state)) {
    const included = E.printable(items, state);
    const conditions = E.activeOptions(state).filter(([id]) => state.options[id]).map(([,label]) => label);
    const flow = E.activeEvents(state);
    if (state.order === 'time') flow.sort((a,b) => (E.minutes(state.times[a.id]) ?? Infinity) - (E.minutes(state.times[b.id]) ?? Infinity) || a.rank-b.rank);
    const labelFor = row => groupLabel(row.group);
    const groups = E.timelineGroups(included, state);
    const course = state.course === 'western' ? '洋コース' : '和洋会席';
    $('#print-document').innerHTML = `<header class="print-header">
        <div class="print-heading"><div><p class="print-brand">当日の作業メモ</p><h1>${esc(state.name || '婚礼の進行チェックリスト')}</h1></div><div class="print-total"><strong>${included.length}</strong><span>項目</span></div></div>
        <p class="print-meta"><span><b>日付</b> ${esc(state.date || '未入力')}</span><span><b>会場</b> ${esc(state.venue || '未入力')}</span><span><b>担当</b> ${esc(state.staff || '未入力')}</span></p>
        <p class="print-info">${esc(course)}${conditions.length ? ` ／ ${esc(conditions.join('・'))}` : ''}<span>${state.order === 'time' ? '時刻順' : '進行順'}</span></p>
      </header>
      ${flow.length ? `<div class="print-flow">${flow.map(e => `<span><b>${esc(state.times[e.id] || '—')}</b> ${esc(e.label)}</span>`).join('')}</div>` : ''}
      <table class="print-table"><colgroup><col class="p-check-col"><col class="p-time-col"><col></colgroup>
        <thead><tr><th scope="col">済</th><th scope="col">タイミング</th><th scope="col">やること・注意点</th></tr></thead>
        ${groups.map(group => {
          if (group.event) return `<tbody><tr class="p-stage p-milestone ${E.isFoodEvent(group.event.id,state) ? 'p-stage-food' : ''}"><th colspan="3" scope="rowgroup">${state.times[group.event.id] ? `<time>${esc(state.times[group.event.id])}</time>` : ''}${esc(group.event.label)}${foodNote(E.isFoodEvent(group.event.id,state),true)}</th></tr></tbody>`;
          const first = group.rows[0];
          const time = state.order === 'progress' ? state.times[first.group] : first.startTime || first.dueTime;
          const label = [...new Set(group.rows.map(labelFor))].join(' ／ ');
          return `<tbody><tr class="p-stage ${group.rows.every(row => E.isFoodEvent(row.group,state)) ? 'p-stage-food' : ''}"><th colspan="3" scope="rowgroup">${time ? `<time>${esc(time)}</time>` : ''}${esc(label)}${foodNote(group.rows.some(row => E.isFoodEvent(row.group,state)),true)}</th></tr>
            ${group.rows.map(row => `<tr class="p-task ${row.done ? 'p-done' : ''} ${row.title.length + (row.caution || '').length > 700 ? 'long-row' : ''}"><td><span class="p-check">${row.done ? '✓' : ''}</span></td><td>${printTiming(row)}</td><td><strong class="p-task-title">${esc(row.title)}</strong>${printSupplement(row)}</td></tr>`).join('')}</tbody>`;
        }).join('')}
      </table>`;
  }
  function openEditor(id = null) {
    editingId = id;
    const row = id ? E.generate(rows,state).find(r => r.id === id) : null;
    const edit = id ? state.edits[id] || {} : {};
    $('#dialog-title').textContent = id ? 'ToDoを編集' : '独自ToDoを追加';
    $('#edit-source').textContent = row && !row.custom ? `開始：${row.start || '未記入'} ／ 期限：${row.deadline || '未記入'}` : '当日だけ必要な作業を追加できます。';
    $('#edit-title').value = row?.title || '';
    $('#edit-start').value = edit.startTime || '';
    $('#edit-due').value = edit.dueTime || '';
    $('#edit-note').value = edit.note || '';
    for (const field of ['equipment', 'place', 'contact', 'caution']) $(`#edit-${field}`).value = row?.[field] || '';
    const editEvents = E.activeEvents(state);
    if (row?.stage && !editEvents.some(e => e.id === row.stage) && E.eventMap[row.stage]) editEvents.push(E.eventMap[row.stage]);
    $('#edit-stage').innerHTML = '<option value="">未指定</option>' + editEvents.map(e => `<option value="${e.id}">${esc(E.eventLabel(e.id, state))}</option>`).join('');
    $('#edit-stage').value = row?.stage || '';
    $('#stage-label').hidden = !!row && !row.custom;
    $('#delete-custom').hidden = !row?.custom;
    $('#edit-error').textContent = '';
    dialog.showModal();
    $('#edit-title').focus();
  }
  document.addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.state) state[target.dataset.state] = target.value;
    else if (target.name === 'course') { state.course = target.value; renderOptions(); renderTimes(); }
    else if (target.dataset.option) { state.options[target.dataset.option] = target.checked; renderTimes(); }
    else if (target.dataset.time) state.times[target.dataset.time] = target.value;
    else if (target.dataset.done) {
      const id = target.dataset.done;
      state.edits[id] = {...state.edits[id], done:target.checked};
    } else if (target.id === 'filter') { filter = target.value; render(); return; }
    else return;
    save(); render();
    if (target.dataset.done) document.querySelector(`[data-done="${target.dataset.done}"]`)?.focus({preventScroll:true});
  });
  // Text inputs save while typing; the input nodes themselves are never replaced.
  document.querySelectorAll('[data-state]').forEach(input => input.addEventListener('input', () => {
    state[input.dataset.state] = input.value; save(); buildPrint();
  }));
  document.addEventListener('click', event => {
    const eventEdit = event.target.closest('[data-edit-event]');
    if (eventEdit) openEventEditor(eventEdit.dataset.editEvent);
    const edit = event.target.closest('[data-edit]');
    if (edit) openEditor(edit.dataset.edit);
    const order = event.target.closest('[data-order]');
    if (order) { state.order = order.dataset.order; save(); render(); }
  });
  // Reorder after leaving the clock section, so entering hours/minutes or tabbing does not move the focused field.
  $('#time-fields').addEventListener('focusout', event => {
    if (!$('#time-fields').contains(event.relatedTarget)) renderTimes();
  });
  $('#add-event').addEventListener('click', () => openEventEditor());
  $('#event-kind').addEventListener('change', updateEventColor);
  for (const id of ['close-event','cancel-event']) $(`#${id}`).addEventListener('click', () => $('#event-dialog').close());
  $('#event-form').addEventListener('submit', event => {
    event.preventDefault();
    const label = $('#event-name').value.trim();
    const time = $('#event-time').value;
    const kind = $('#event-kind').value;
    if (!label || label.length > 120 || !['progress','food'].includes(kind) || (time && !E.validTime(time))) {
      $('#event-error').textContent = 'イベント名・区分・時刻を確認してください。'; return;
    }
    const id = editingEventId || `event-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const existing = state.customEvents.find(e => e.id === id);
    if (existing) Object.assign(existing, {label, kind});
    else state.customEvents.push({id, label, kind});
    state.times[id] = time;
    save(); renderTimes(); render(); $('#event-dialog').close();
  });
  $('#delete-event').addEventListener('click', () => {
    if (!editingEventId) return;
    const linked = state.custom.some(row => row.stage === editingEventId);
    if (!confirm(linked ? 'このイベントを削除しますか？関連する独自ToDoは残し、進行を未指定に戻します。' : 'このイベントを削除しますか？')) return;
    E.removeCustomEvent(state, editingEventId);
    save(); renderTimes(); render(); $('#event-dialog').close();
  });
  $('#add-todo').addEventListener('click', () => openEditor());
  for (const id of ['close-dialog','cancel-edit']) $(`#${id}`).addEventListener('click', () => dialog.close());
  $('#edit-form').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('#edit-title').value.trim();
    const startTime = $('#edit-start').value, dueTime = $('#edit-due').value;
    if (!title) { $('#edit-error').textContent = 'ToDoを入力してください。'; return; }
    if (startTime && dueTime && E.minutes(startTime) > E.minutes(dueTime)) {
      $('#edit-error').textContent = '期限が開始より前になっています。同日内の時刻で入力してください。'; return;
    }
    const id = editingId || `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    if (!editingId) state.custom.push({id, custom:true, category:'独自ToDo', title, stage:$('#edit-stage').value, start:'', deadline:'', status:'独自', pdf:'○'});
    else if (id.startsWith('custom-')) state.custom.find(row => row.id === id).stage = $('#edit-stage').value;
    state.edits[id] = {...state.edits[id], title, startTime, dueTime, note:$('#edit-note').value, ...Object.fromEntries(['equipment', 'place', 'contact', 'caution'].map(field => [field, $(`#edit-${field}`).value]))};
    save(); render(); dialog.close();
  });
  $('#delete-custom').addEventListener('click', () => {
    if (!editingId || !confirm('この独自ToDoを削除しますか？')) return;
    state.custom = state.custom.filter(row => row.id !== editingId);
    delete state.edits[editingId];
    save(); render(); dialog.close();
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('このブラウザーに保存した婚礼名・時刻・メモ・必要物などの編集・チェック・独自ToDo・追加した進行イベントを消去します。新しい婚礼を作りますか？')) return;
    state = E.initialState(); storageBlocked = false; storageMessage = ''; filter = 'all';
    $('#filter').value = filter; save(); fillSetup(); render();
  });
  for (const id of ['print-top','print-bottom']) $(`#${id}`).addEventListener('click', () => { buildPrint(); window.print(); });
  window.addEventListener('beforeprint', () => buildPrint());
  $('#setup-disclosure').open = !window.matchMedia('(max-width: 760px)').matches;
  fillSetup(); render();
  if (storageBlocked) $('#save-status').textContent = '保存データの読み込みに失敗';
})();
