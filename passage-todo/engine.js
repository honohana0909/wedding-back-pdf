(function (root) {
  'use strict';
  const options = [
    ['obire', '尾鰭椀'], ['dessert', 'デザートビュッフェ'], ['beef', 'ローストビーフ'],
    ['tempura', '天ぷら'], ['lunch', '子ランチ'], ['hamburg', '子バーグ'],
    ['childCourse', '子コース'], ['event', 'イベント・余興'], ['bread', 'パンを追加']
  ];
  // Stable IDs preserve saved input; each course defines its own display order.
  const events = [
    ['arrival', '出勤'], ['meeting', 'MTG'], ['preplate', 'バター先付け'],
    ['sashimiPreplate', '刺身先付け'], ['setup', 'セットアップ'], ['open', '開場'],
    ['entrance', '新郎新婦入場'], ['toast', '乾杯'], ['childMeal', 'お子様料理'],
    ['hov', 'HOV'], ['conversation', '歓談'], ['cakeCut', 'ケーキ入刀'],
    ['soup', 'スープ'], ['breadAfterSoup', 'パン'], ['intermission', 'お色直し中座'],
    ['fish', 'ポアソン'], ['breadAfterFish', 'パン'], ['meat', 'ビアンド'],
    ['reentry', 'お色直し入場'], ['cakeDessert', 'ケーキデザート・コーヒー'],
    ['photoRound', 'フォトラウンド'], ['close', 'お見送り'],
    ['obire', '尾鰭椀'], ['beef', 'ローストビーフ提供'], ['tempura', '天ぷら提供'],
    ['dessert', 'デザートビュッフェ開始'], ['event', 'イベント開始'], ['eventEnd', 'イベント終了']
  ].map(([id, label], rank) => ({id, label, rank}));
  // Retain legacy clock values in storage, but do not show obsolete input fields.
  const legacyEvents = {preplateEnd:'preplate', hovEnd:'hov', soupEnd:'soup', fishEnd:'fish', sashimi:'sashimiPreplate'};
  const eventMap = Object.fromEntries(events.map(e => [e.id, e]));
  const courseSequences = {
    western: ['arrival','meeting','preplate','setup','open','entrance','toast','childMeal','hov','conversation','cakeCut','soup','breadAfterSoup','intermission','fish','breadAfterFish','meat','reentry','cakeDessert','photoRound','close'],
    mixed: ['arrival','meeting','preplate','sashimiPreplate','setup','open','entrance','toast','childMeal','conversation','cakeCut','fish','intermission','meat','reentry','cakeDessert','photoRound','close']
  };
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
    15: ['fish', 1, 'meat', 0],
    16: ['preplate', 0, 'preplate', 0], 
    17: ['preplate', 0, 'preplate', 0],
    18: ['arrival', 1, 'open', -1], 
    19: ['arrival', 1, 'open', -1],
    20: ['open', 1, 'toast', -1], 
    21: ['hov', 1, 'soup', -1],
    22: ['breadAfterSoup', 0, 'breadAfterSoup', 0], 
    23: ['breadAfterFish', 0, 'breadAfterFish', 0],
    24: ['preplate', 0, 'preplate', 0], 
    25: [null, 0, 'preplate', 0],
    26: [null, 0, 'preplate', 0], 
    27: [null, 0, 'sashimiPreplate', -1, 'preplate'],
    28: [null, 0, 'sashimiPreplate', -1, 'sashimiPreplate'], 
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
    45: ['toast', 1, 'childMeal', 0, 'childMeal'],
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
    id = legacyEvents[id] || id;
    if (id === 'preplate' && state.course === 'mixed') return '前菜・ちらし寿司先付け';
    return eventMap[id]?.label || '';
  }
  function activeEvents(state) {
    const ids = [...courseSequences[state.course]];
    const after = (anchor, additions) => ids.splice(ids.indexOf(anchor) + 1, 0, ...additions);
    if (state.course === 'mixed' && state.options.bread) {
      after('cakeCut', ['soup', 'breadAfterSoup']);
      after('fish', ['breadAfterFish']);
    }
    if (state.options.obire) after('open', ['obire']);
    after('meat', ['beef','tempura'].filter(id => state.options[id]));
    if (state.options.dessert) after('cakeDessert', ['dessert']);
    if (state.options.event) after('photoRound', ['event','eventEnd']);
    return ids.map((id, rank) => ({...eventMap[id], label:eventLabel(id, state), rank}));
  }
  function eventRank(id, state) {
    return activeEvents(state).find(e => e.id === id)?.rank ?? (id === 'ongoing' ? 998 : 999);
  }
  function timelineGroups(items, state) {
    const groups = [];
    for (const row of items) {
      const id = state.order === 'progress' ? row.group : row.sortTime === null ? 'no-time' : String(row.sortTime);
      if (groups.at(-1)?.id !== id) groups.push({id, rows:[]});
      groups.at(-1).rows.push(row);
    }
    // Keep every scheduled event visible, even when it has no ToDo.
    for (const event of activeEvents(state)) {
      if (items.some(row => row.group === event.id)) continue;
      const eventTime = minutes(state.times[event.id]) ?? Infinity;
      const position = groups.findIndex(group => {
        const rank = group.event?.rank ?? group.rows[0].rank;
        if (state.order === 'progress') return rank > event.rank;
        const time = group.event ? minutes(state.times[group.event.id]) ?? Infinity : group.rows[0].sortTime ?? Infinity;
        return time > eventTime || (time === eventTime && rank > event.rank);
      });
      groups.splice(position < 0 ? groups.length : position, 0, {id:event.id, rows:[], event});
    }
    return groups;
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
      sortRelation: startManual ? 0 : startId ? startRelation : dueManual || (groupOverride && groupOverride !== dueId) ? 0 : dueRelation,
      rank: eventRank(group, state) };
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
    for (const id of [...events.map(e => e.id), ...Object.keys(legacyEvents)]) if (validTime(value.times?.[id])) state.times[id] = value.times[id];
    if (Array.isArray(value.custom)) state.custom = value.custom.filter(r => r && typeof r.id === 'string'
      && /^custom-[\w-]+$/.test(r.id) && typeof r.title === 'string' && r.title.trim()).map(r => ({
        id: r.id, custom: true, category: '独自ToDo', title: r.title, start: '', deadline: '',
        stage: eventMap[r.stage] ? r.stage : legacyEvents[r.stage] || '', pdf: '○', status: '独自', caution: '', revision: ''
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
  const api = { options, events, eventMap, timing, initialState, validTime, minutes, eventLabel, activeEvents, activeOptions, timelineGroups, applies, generate, printable, normalizeState };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PassageEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
