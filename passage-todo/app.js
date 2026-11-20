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
  let filter = 'all', editingId = null;
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
    $('#time-fields').innerHTML = E.activeEvents(state).map(event => `<label class="time-field">${esc(event.label)}<input type="time" data-time="${event.id}" value="${esc(state.times[event.id] || '')}" aria-label="${esc(event.label)}の時刻"></label>`).join('');
  }
  function groupLabel(id) {
    return E.eventMap[id]?.label || ({ongoing:'披露宴中・各料理の前後',unassigned:'進行未指定'}[id]) || '進行未指定';
  }
  function timeBlock(row, which, print = false) {
    const start = which === 'start';
    const time = start ? row.startTime : row.dueTime;
    const manual = start ? row.startManual : row.dueManual;
    const anchor = start ? row.startId : row.dueId;
    const original = start ? row.start : row.deadline;
    const label = start ? '開始' : '期限';
    const missing = anchor ? '時刻未入力' : '時刻未指定';
    const description = manual ? '手動指定' : anchor ? `${E.eventMap[anchor]?.label || original || '進行'}の基準` : '開始・期限の条件を参照';
    if (print) return `<span class="p-time"><strong>${label}：${esc(time || missing)}</strong><small>${esc(time ? description : '')}${original ? `<br>${esc(original)}` : row.custom ? '' : '<br>未入力'}</small></span>`;
    return `<div><span class="time-caption">${label}</span><span class="clock-value ${time ? '' : 'empty'}">${esc(time || missing)}</span><span class="time-relation">${esc(time ? description : '')}</span><span class="original-timing">${esc(original || (row.custom ? '独自ToDo' : '未入力'))}</span></div>`;
  }
  function printTiming(row) {
  const start = row.startTime || row.start || '';
  const due = row.dueTime || row.deadline || '';

  if (start && due) {
    if (start === due) {
      return `<span class="p-timing">${esc(start)}</span>`;
    }

    return `<span class="p-timing">${esc(start)} → ${esc(due)}</span>`;
  }

  if (due) {
    return `<span class="p-timing">〜 ${esc(due)}</span>`;
  }

  if (start) {
    return `<span class="p-timing">${esc(start)}〜</span>`;
  }

  return '';
}
function printSupplement(row) {
  const parts = [];

  if (row.caution) {
    parts.push(`※ ${row.caution}`);
  }

  if (!parts.length) {
    return '';
  }

  return `<small class="p-supplement">${parts.map(esc).join(' ／ ')}</small>`;
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
    // Presentation only: preserve the engine's order, grouping and generated tasks.
    const groupKey = row => state.order === 'progress' ? row.group : row.sortTime === null ? 'no-time' : String(row.sortTime);
    const groups = [];
    for (const row of items) {
      const id = groupKey(row);
      if (groups.at(-1)?.id !== id) groups.push({id, rows: []});
      groups.at(-1).rows.push(row);
    }
    const currentIndex = groups.findIndex(group => group.rows.some(row => !row.done));
    const visibleIds = new Set(visible.map(row => row.id));
    const foodEvents = new Set(['preplate', 'preplateEnd', 'obire', 'hov', 'hovEnd', 'sashimi', 'soup', 'soupEnd', 'fish', 'fishEnd', 'meat', 'beef', 'tempura', 'dessert']);
    $('#todo-list').innerHTML = visible.length ? groups.map((group, index) => {
      const groupRows = group.rows.filter(row => visibleIds.has(row.id));
      if (!groupRows.length) return '';
      const first = group.rows[0];
      const labels = [...new Set(group.rows.map(row => groupLabel(row.group)))];
      const label = state.order === 'progress' ? groupLabel(first.group) : labels.join(' ／ ');
      const time = state.order === 'progress' ? state.times[first.group] : first.startTime || first.dueTime;
      const missing = state.order === 'progress' && E.eventMap[first.group] ? '時刻未入力' : '時刻未指定';
      const isCurrent = index === currentIndex;
      const isFood = group.rows.every(row => foodEvents.has(row.group));
      const isDone = group.rows.every(row => row.done);
      return `<section class="timeline-stage ${isFood ? 'is-food' : ''} ${isCurrent ? 'is-current' : ''} ${isDone ? 'stage-done' : ''}" aria-labelledby="stage-${index}">
        <header class="stage-heading">
          <div class="stage-time">${time ? `<time>${esc(time)}</time>` : `<span class="unset-time">${missing}</span>`}<small>${state.order === 'progress' ? '進行の基準' : '作業の基準'}</small></div>
          <div class="stage-event">${isCurrent ? '<span class="stage-status">ここから <small>未完了の先頭</small></span>' : index === currentIndex + 1 && currentIndex !== -1 ? '<span class="stage-status">次の工程</span>' : isDone ? '<span class="stage-status">完了</span>' : ''}<h3 id="stage-${index}">${esc(label)}</h3></div>
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
    const flow = E.activeEvents(state).slice().sort((a,b) => (E.minutes(state.times[a.id]) ?? Infinity) - (E.minutes(state.times[b.id]) ?? Infinity) || a.rank-b.rank);
    $('#print-document').innerHTML = `<div class="print-header"><div class="print-brand">当日の作業メモ</div><h1>${esc(state.name || '当日のバック業務ToDo')}</h1><p>${esc([state.date || '日付未入力',state.venue && `会場：${state.venue}`,state.staff && `担当：${state.staff}`].filter(Boolean).join('　'))}</p><p class="print-info">${state.course === 'western' ? '洋コース' : '和洋会席'} ｜ ${esc(conditions.join('・') || '追加条件なし')} ｜ ${state.order === 'time' ? '時刻順' : '進行順'}</p></div>
      <div class="print-flow">${flow.map(e => `<span>${esc(state.times[e.id] || '未入力')} ${esc(e.label)}</span>`).join('')}</div>
      <table class="print-table">
  <thead>
    <tr>
      <th>済</th><th>タイミング</th><th>ToDo</th></tr></thead><tbody>
      ${included.map(row => `
        <tr>
          <td>
            <span class="p-check">${row.done ? '✓' : ''}</span>
          </td>

          <td>
            ${printTiming(row)}
          </td>

          <td>
            <strong>${esc(row.title)}</strong>
            ${printSupplement(row)}
          </td>
        </tr>
      `).join('')}
      </tbody></table>`;
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
    $('#edit-stage').innerHTML = '<option value="">未指定</option>' + E.events.map(e => `<option value="${e.id}">${esc(e.label)}</option>`).join('');
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
    const edit = event.target.closest('[data-edit]');
    if (edit) openEditor(edit.dataset.edit);
    const order = event.target.closest('[data-order]');
    if (order) { state.order = order.dataset.order; save(); render(); }
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
    if (!confirm('このブラウザーに保存した婚礼名・時刻・メモ・必要物などの編集・チェック・独自ToDoを消去します。新しい婚礼を作りますか？')) return;
    state = E.initialState(); storageBlocked = false; storageMessage = ''; filter = 'all';
    $('#filter').value = filter; save(); fillSetup(); render();
  });
  for (const id of ['print-top','print-bottom']) $(`#${id}`).addEventListener('click', () => { buildPrint(); window.print(); });
  window.addEventListener('beforeprint', () => buildPrint());
  $('#setup-disclosure').open = !window.matchMedia('(max-width: 760px)').matches;
  fillSetup(); render();
  if (storageBlocked) $('#save-status').textContent = '保存データの読み込みに失敗';
})();
