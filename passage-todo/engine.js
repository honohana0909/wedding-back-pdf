(function (root) {
  'use strict';
  const options = [
    ['obire', '尾鰭椀'], ['dessert', 'デザートビュッフェ'], ['beef', 'ローストビーフ'],
    ['tempura', '天ぷら'], ['lunch', '子ランチ'], ['hamburg', '子バーグ'],
    ['childCourse', '子コース'], ['event', 'イベント・余興'], ['bread', 'パンを追加']
  ];
  // Order is an editable day's reference sequence, never an invented clock time.
  const events = [
    ['arrival', '出勤', 'common'], 
    ['meeting', 'MTG', 'common'],
    ['preplate', 'バター先付け', 'common'], 
    ['preplateEnd', '前菜・ちらし寿司先付け完了', 'mixed'],
    ['sashimiPreplate', '刺身先付け', 'mixed'],
    ['setup', 'セットアップ', 'common'],
    ['open', '開場', 'common'], 
    ['obire', '尾鰭椀', 'obire'],
    ['entrance', '新郎新婦入場／披露宴開始', 'common'],
    ['toast', '乾杯', 'common'],
    ['hov', 'HOV', 'western'],
    ['hovEnd', 'HOV提供完了', 'western'], 
    ['sashimi', '刺身提供', 'mixed'], 
    ['soup', 'スープ', 'western'],
    ['soupEnd', 'スープ提供完了', 'western'],
    ['fish', 'ポアソン', 'common'],
    ['fishEnd', 'ポアソン提供完了', 'common'],
    ['meat', 'ビアンド', 'common'],
    ['beef', 'ローストビーフ提供', 'beef'], 
    ['tempura', '天ぷら提供', 'tempura'],
    ['dessert', 'デザートビュッフェ開始', 'dessert'], 
    ['event', 'イベント開始', 'event'],
    ['eventEnd', 'イベント終了', 'event'], 
    ['close', 'お開き', 'common']
  ].map(([id, label, condition], index) => ({ id, label, condition, rank: index }));
  const eventMap = Object.fromEntries(events.map(e => [e.id, e]));
  // [start anchor, relation, deadline anchor, relation, optional display group]
  // A null start anchor means a task dependency or non-specific start: preserve its wording.
  const timing = {
    2: ['meeting', 1, 'preplate', -1], 
    3: ['arrival', 1, 'open', -1],
    4: ['meeting', 1, 'open', -1], 
    5: ['arrival', 1, 'open', -1],
    6: ['arrival', 1, 'open', -1], 
    7: ['arrival', 1, 'open', -1],
    8: ['arrival', 1, 'preplate', -1], 
    9: ['meeting', 1, 'open', -1],
    10: ['open', 1, 'open', 1], 
    11: ['open', 1, 'open', 1],
    12: ['toast', 1, null, 0], 
    13: [null, 0, null, 0, 'ongoing'],
    14: ['toast', 1, 'fish', -1], 
    15: ['fishEnd', 1, 'meat', 0],
    16: ['preplate', 0, 'preplate', 0], 
    17: ['preplate', 0, 'preplate', 0],
    18: ['arrival', 1, 'open', -1], 
    19: ['arrival', 1, 'open', -1],
    20: ['open', 1, 'toast', -1], 
    21: ['hovEnd', 1, 'soup', -1],
    22: ['soupEnd', 1, 'soupEnd', 1], 
    23: ['fishEnd', 1, 'fishEnd', 1],
    24: ['preplate', 0, 'preplate', 0], 
    25: [null, 0, 'preplate', 0],
    26: [null, 0, 'preplate', 0], 
    27: [null, 0, 'preplateEnd', 0, 'preplate'],
    28: ['preplateEnd', 1, 'sashimiPreplate', -1, 'sashimiPreplate'], 
    29: [null, 0, 'sashimiPreplate', 0],
    30: ['arrival', 1, 'open', -1], 
    31: ['preplate', -1, 'entrance', -1],
    32: [null, 0, 'obire', -1], 
    33: ['open', 1, 'entrance', -1],
    34: ['meeting', 1, 'open', -1], 
    35: ['meeting', 1, 'open', -1],
    36: ['entrance', 1, 'open', -1], 
    37: ['meeting', 1, 'open', -1],
    38: ['meeting', 1, 'open', -1], 
    39: ['arrival', 1, 'open', -1],
    40: ['meeting', 1, 'open', -1], 
    41: ['meeting', 1, 'open', -1],
    42: ['arrival', 1, 'open', -1], 
    43: ['tempura', -1, 'tempura', -1],
    44: ['meeting', 1, 'open', -1], 
    45: ['open', 1, 'toast', -1],
    46: ['meeting', 1, 'open', -1], 
    47: ['meeting', 1, 'open', -1],
    48: ['meeting', 1, 'open', -1], 
    49: ['meeting', 0, 'open', -1],
    50: ['meeting', 1, 'open', -1], 
    51: ['meeting', 1, 'open', -1],
    52: ['meeting', 1, 'open', -1], 
    53: ['event', -1, 'open', -1]
  };
  function initialState() {
    return { version: 1, name: '', date: '', venue: '', staff: '', course: 'western',
      options: {}, times: {}, edits: {}, custom: [], order: 'progress', includeUnset: true };
  }
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const minutes = value => validTime(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  const children = state => ['lunch', 'hamburg', 'childCourse'].some(key => state.options[key]);
  function eventLabel(id, state) {
    if (id === 'preplate' && state.course === 'mixed') return '前菜・ちらし寿司先付け';
    return eventMap[id]?.label || '';
  }
  function activeEvents(state) {
    return events.filter(e => e.condition === 'common' || e.condition === state.course || state.options[e.condition]
      || (state.course === 'mixed' && state.options.bread && ['soup', 'soupEnd'].includes(e.id))).map(e => ({...e, label:eventLabel(e.id, state)}));
  }
  function activeOptions(state) {
    return options.filter(([id]) => id !== 'bread' || state.course === 'mixed');
  }
  function applies(row, state) {
    if (row.category === 'パン') return state.course === 'western' || (state.course === 'mixed' && !!state.options.bread);
    if (row.category === '共通') return true;
    if (row.category === '洋コース') return state.course === 'western';
    if (row.category === '和洋会席') return state.course === 'mixed';
    if (row.category === '子ども料理') {
      const child = {44: 'lunch', 46: 'hamburg', 47: 'childCourse'}[row.row];
      return child ? !!state.options[child] : children(state);
    }
    return options.some(([id, label]) => label === row.category && state.options[id]);
  }
  function courseWording(row, state) {
    // Adapt only built-in timing text; saved user edits are applied afterwards.
    const label = eventLabel('preplate', state);
    const timingRows = [2, 8, 16, 17, 24, 25, 26, 27, 31];
    if (row.custom || !timingRows.includes(row.row)) return row;
    return {...row,
      title: row.row === 8 ? `${label}時刻を確認する` : row.title,
      start: row.start.replaceAll('先付け', label),
      deadline: row.deadline.replaceAll('先付け', label)
    };
  }
  function item(row, state, index) {
    const custom = !!row.custom;
    const edit = state.edits[row.id] || {};
    const [startId, startRelation, dueId, dueRelation, groupOverride] = custom
      ? [row.stage || null, 0, null, 0] : timing[row.row] || [null, 0, null, 0];
    const startManual = validTime(edit.startTime) ? edit.startTime : '';
    const dueManual = validTime(edit.dueTime) ? edit.dueTime : '';
    const startTime = startManual || (startId && state.times[startId]) || '';
    const dueTime = dueManual || (dueId && state.times[dueId]) || '';
    const group = custom ? row.stage || 'unassigned' : groupOverride || startId || dueId || 'unassigned';
    // All tasks applicable to this wedding are included, including legacy exclusions.
    const pdf = '○';
    const issues = [];
    if (row.revision) issues.push('確認が必要な変更内容あり');
    if (!custom && (!row.start || !row.deadline)) issues.push('開始または期限が未記入');
    if (row.row === 36)
      issues.push('開始「披露宴開始後〜デザート前」と期限「開場前」の前後関係を要確認');
    if (row.row === 53)
      issues.push('開始「イベント開始前」と期限「開場前」の前後関係を要確認');
    const a = minutes(startTime), b = minutes(dueTime);
    if (a !== null && b !== null && (a > b || (a === b && !startManual && !dueManual && startRelation > dueRelation)))
      issues.push('入力時刻では開始基準が期限基準より後です');
    return { ...row, ...edit, pdf, custom, startId, dueId, startRelation, dueRelation,
      startTime, dueTime, startManual, dueManual, group, issues, index,
      sortTime: a !== null ? a : b,
      sortRelation: startManual ? 0 : startId ? startRelation : dueManual ? 0 : dueRelation,
      rank: eventMap[group]?.rank ?? (group === 'ongoing' ? 998 : 999) };
  }
  function generate(rows, state) {
    return [...rows.filter(row => applies(row, state)), ...state.custom]
      .map((row, index) => item(courseWording(row, state), state, index))
      .sort((a, b) => state.order === 'time'
        ? (a.sortTime ?? Infinity) - (b.sortTime ?? Infinity) || a.rank - b.rank || a.sortRelation - b.sortRelation || a.index - b.index
        : a.rank - b.rank || a.sortRelation - b.sortRelation || a.index - b.index);
  }
  function printable(items, state) {
    return items.slice();
  }
  function normalizeState(value) {
    if (!value || value.version !== 1 || !['western', 'mixed'].includes(value.course)) throw new Error('保存形式が対応していません');
    const state = initialState();
    for (const key of ['name', 'date', 'venue', 'staff']) if (typeof value[key] === 'string') state[key] = value[key];
    state.course = value.course;
    state.order = value.order === 'time' ? 'time' : 'progress';
    state.includeUnset = value.includeUnset !== false;
    for (const [key] of options) state.options[key] = value.options?.[key] === true;
    for (const event of events) if (validTime(value.times?.[event.id])) state.times[event.id] = value.times[event.id];
    if (Array.isArray(value.custom)) state.custom = value.custom.filter(r => r && typeof r.id === 'string'
      && /^custom-[\w-]+$/.test(r.id) && typeof r.title === 'string' && r.title.trim()).map(r => ({
        id: r.id, custom: true, category: '独自ToDo', title: r.title, start: '', deadline: '',
        stage: eventMap[r.stage] ? r.stage : '', pdf: '○', status: '独自', caution: '', revision: ''
      }));
    if (value.edits && typeof value.edits === 'object') for (const [id, edit] of Object.entries(value.edits)) {
      if (!/^(excel-\d+|custom-[\w-]+)$/.test(id) || !edit || typeof edit !== 'object') continue;
      const safe = { done: edit.done === true };
      for (const key of ['note', 'title', 'equipment', 'place', 'contact', 'caution']) if (typeof edit[key] === 'string') safe[key] = edit[key];
      for (const key of ['startTime', 'dueTime']) if (validTime(edit[key]) || edit[key] === '') safe[key] = edit[key];
      if (['○', '△', '×', ''].includes(edit.pdf)) safe.pdf = edit.pdf;
      state.edits[id] = safe;
    }
    return state;
  }
  const api = { options, events, eventMap, timing, initialState, validTime, minutes, eventLabel, activeEvents, activeOptions, applies, generate, printable, normalizeState };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PassageEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
