const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const rows = require('../checklist.js');
const get = (state, row) => E.generate(rows, state).find(r => r.row === row);

test('Excelの52項目と空欄、変更済みの内容を保持する', () => {
  assert.equal(rows.length, 52);
  assert.equal(new Set(rows.map(r => r.id)).size, 52);
  assert.deepEqual(rows.filter(r => !r.pdf).map(r => r.row), [19,21,22,23,45]);
  assert.deepEqual(rows.filter(r => !r.status).map(r => r.row), [45]);
  assert.equal(rows.find(r => r.row === 18).title, 'スープ用のソーサーを準備する');
  assert.equal(rows.find(r => r.row === 18).start, '出勤後');
  assert.equal(rows.find(r => r.row === 36).deadline, '開場前');
  assert.equal(rows.find(r => r.row === 39).equipment, '出皿・レードル');
  assert.equal(rows.find(r => r.row === 42).equipment, '箸・塩のスプーン');
  assert.equal(rows.filter(r => r.title.startsWith('パンを1Fへ上げる')).length, 2);
  assert.ok(!JSON.stringify(rows).includes('パティスリー'));
});

test('2コース×9条件の全1024通りで対象件数と固有項目が一致する', () => {
  for (const course of ['western','mixed']) for (let mask=0; mask<(1<<E.options.length); mask++) {
    const s=E.initialState(); s.course=course;
    E.options.forEach(([id],i) => { s.options[id]=!!(mask & (1<<i)); });
    const items=E.generate(rows,s);
    const n=Number(s.options.lunch)+Number(s.options.hamburg)+Number(s.options.childCourse);
    const expected=14+(course==='western'?8:6)+4*Number(s.options.obire)+4*Number(s.options.dessert)
      +3*Number(s.options.beef)+3*Number(s.options.tempura)+5*Number(s.options.event)+n+(n?2:0)
      +(course==='mixed' && s.options.bread ? 4 : 0);
    assert.equal(items.length,expected,`${course}/${mask}`);
    assert.equal(new Set(items.map(r=>r.id)).size,items.length);
    assert.equal(items.some(r=>r.row===44),s.options.lunch);
    assert.equal(items.some(r=>r.row===46),s.options.hamburg);
    assert.equal(items.some(r=>r.row===47),s.options.childCourse);
    assert.equal(items.some(r=>r.row===45),n>0);
    assert.equal(items.some(r=>r.row===24),course==='mixed');
    assert.equal(items.some(r=>r.row===16),course==='western' || s.options.bread);
    const active = new Set(E.activeEvents(s).map(e=>e.id));
    for(const row of items) {
      assert.ok(row.group==='ongoing' || active.has(row.group),`${course}/${mask}: missing group ${row.group}`);
      for(const anchor of [row.startId,row.dueId].filter(Boolean)) assert.ok(active.has(anchor),`${row.id}: missing anchor ${anchor}`);
    }
  }
});

test('未入力の時刻を補完せず、新しい主要進行時刻を基準にする', () => {
  const s=E.initialState();
  assert.ok(E.generate(rows,s).every(r=>!r.startTime && !r.dueTime));
  s.times={open:'12:00',hov:'12:30',hovEnd:'12:40',fish:'13:00',fishEnd:'13:15'};
  assert.equal(get(s,10).startTime,'12:00');
  assert.equal(get(s,10).start,'開場直後');
  assert.equal(get(s,21).startTime,'12:30');assert.equal(get(s,21).startRelation,1);
  assert.equal(get(s,15).startTime,'13:00');
  delete s.times.hov;
  assert.equal(get(s,21).startTime,'');
});

test('和洋会席の運搬依存は時刻に置換せず原票の条件と順序を保つ', () => {
  const s=E.initialState();s.course='mixed';s.times={preplate:'11:30',preplateEnd:'11:45'};
  const items=E.generate(rows,s);
  assert.deepEqual(items.filter(r=>[24,25,26,27].includes(r.row)).map(r=>r.row),[24,25,26,27]);
  assert.equal(get(s,25).startTime,'');
  assert.equal(get(s,25).start,'2Fから受取後');
  assert.equal(get(s,25).dueTime,'11:30');
  assert.equal(get(s,28).startTime,'');assert.equal(get(s,28).dueId,'sashimiPreplate');
});

test('手動時刻、メモ、完了チェックは条件の切替え・保存復元後も保持', () => {
  let s=E.initialState();s.times.open='12:00';
  s.edits['excel-20']={startTime:'12:05',dueTime:'12:20',note:'担当と数量を確認',done:true};
  s.course='mixed';assert.ok(!get(s,20));
  s=E.normalizeState(JSON.parse(JSON.stringify(s)));s.course='western';
  const row=get(s,20);
  assert.equal(row.startTime,'12:05');assert.equal(row.dueTime,'12:20');
  assert.equal(row.note,'担当と数量を確認');assert.equal(row.done,true);
  s.edits['excel-20'].startTime='';assert.equal(get(s,20).startTime,'12:00');
});

test('時刻順は手動開始、開始基準、期限基準を使い、未指定を末尾にする', () => {
  const s=E.initialState();s.order='time';s.times={arrival:'10:00',meeting:'10:30',preplate:'11:30',open:'12:00'};
  s.edits['excel-20']={startTime:'09:50'};
  let items=E.generate(rows,s);
  assert.equal(items[0].row,20);
  assert.equal(items.at(-1).sortTime,null);
  const times=items.map(r=>r.sortTime).filter(v=>v!==null);
  assert.deepEqual(times,[...times].sort((a,b)=>a-b));
  s.edits['excel-20'].startTime='12:30';items=E.generate(rows,s);
  assert.notEqual(items[0].row,20);
});

test('作業の未記入・前後矛盾・逆転時刻を表示し、原票の管理情報は表示しない', () => {
  const s=E.initialState();s.options={dessert:true,event:true,lunch:true};
  assert.equal(get(s,36).status,'確定');assert.ok(get(s,36).issues.some(x=>x.includes('前後関係')));
  assert.ok(get(s,53).issues.some(x=>x.includes('前後関係')));
  assert.ok(!get(s,45).issues.some(x=>x.includes('確認状態')));
  assert.ok(!get(s,45).issues.some(x=>x.includes('PDF掲載')));
  s.times.meeting='12:30';s.times.open='12:00';
  assert.ok(get(s,9).issues.some(x=>x.includes('入力時刻')));
  s.edits['excel-36']={startTime:'10:30',dueTime:'11:00'};
  assert.ok(get(s,36).issues.some(x=>x.includes('前後関係')));
});

test('進行順の前後判定は時刻の入力有無に左右されない', () => {
  const s=E.initialState();
  const before=E.generate(rows,s).map(r=>r.id);
  for(const e of E.events) s.times[e.id]='12:00';
  assert.deepEqual(E.generate(rows,s).map(r=>r.id),before);
  const opening=E.generate(rows,s).filter(r=>r.group==='open').map(r=>r.row);
  assert.deepEqual(opening,[10,11,20]);
});

test('当日のToDoは旧保存データの非掲載設定に関係なくすべてPDF掲載', () => {
  const s=E.initialState();s.edits['excel-2']={pdf:'×'};s.edits['excel-3']={pdf:'△'};
  s.includeUnset=false;
  const restored=E.normalizeState(JSON.parse(JSON.stringify(s)));
  const items=E.generate(rows,restored);
  assert.deepEqual(E.printable(items,restored),items);
  assert.ok(items.every(r=>r.pdf==='○'));
});

test('独自ToDoはコースに依存せず、メモや印刷設定を復元できる', () => {
  let s=E.initialState();s.custom=[{id:'custom-test',custom:true,title:'追加の準備',stage:'open',pdf:'○'}];
  s.edits['custom-test']={note:'確認事項',startTime:'11:00',pdf:'△'};
  s=E.normalizeState(JSON.parse(JSON.stringify(s)));s.course='mixed';
  const row=E.generate(rows,s).find(r=>r.id==='custom-test');
  assert.equal(row.title,'追加の準備');assert.equal(row.note,'確認事項');assert.equal(row.pdf,'○');
  assert.equal(row.startTime,'11:00');
});

test('壊れた保存形式と不正な時刻を無条件に取り込まない', () => {
  assert.throws(()=>E.normalizeState({version:2}));
  const s=E.initialState();s.times={open:'25:00',meeting:'10:61',arrival:'09:00'};
  s.edits={'__proto__':{note:'bad'},'excel-2':{startTime:'99:00',done:'true'}};
  const restored=E.normalizeState(s);
  assert.deepEqual(restored.times,{arrival:'09:00'});
  assert.equal(restored.edits['excel-2'].startTime,undefined);
  assert.equal(restored.edits['excel-2'].done,false);
  assert.equal(E.validTime('24:00'),false);assert.equal(E.validTime('00:00'),true);
});

test('必要物・場所・連携先・注意点の編集と空欄への変更を保存復元できる', () => {
  const s=E.initialState();
  s.edits['excel-39']={equipment:'出皿 4枚',place:'厨房',contact:'担当者',caution:'熱いので注意'};
  s.options.beef=true;
  let restored=E.normalizeState(JSON.parse(JSON.stringify(s)));
  for(const key of ['equipment','place','contact','caution']) assert.equal(get(restored,39)[key],s.edits['excel-39'][key]);
  restored.edits['excel-39'].equipment='';
  restored=E.normalizeState(JSON.parse(JSON.stringify(restored)));
  assert.equal(get(restored,39).equipment,'');
  assert.equal(rows.find(r=>r.row===39).equipment,'出皿・レードル');
});

test('保存データの独自ToDo IDは安全な文字だけを受け付ける', () => {
  const s=E.initialState();
  s.custom=[{id:'custom-valid-1',title:'正常'}, {id:'custom-\" onclick=\"alert(1)',title:'不正'}, {id:'custom-<script>',title:'不正'}];
  assert.deepEqual(E.normalizeState(s).custom.map(r=>r.id),['custom-valid-1']);
});

test('セットアップは両方のコースで共通の進行時刻として保存できる', () => {
  for(const course of ['western','mixed']) {
    const s=E.initialState();s.course=course;s.times.setup='11:40';
    assert.ok(E.activeEvents(s).some(e=>e.id==='setup'));
    assert.equal(E.normalizeState(JSON.parse(JSON.stringify(s))).times.setup,'11:40');
  }
});

test('ビアンド用ウォーマーの期限はビアンド時刻まで', () => {
  const s=E.initialState();s.times={fish:'13:20',meat:'13:40'};
  const row=get(s,15);
  assert.equal(row.group,'fish');
  assert.equal(row.startTime,'13:20');
  assert.equal(row.deadline,'ビアンドまで');
  assert.equal(row.dueId,'meat');assert.equal(row.dueRelation,0);assert.equal(row.dueTime,'13:40');
});

test('パンはスープ後と魚後の2回で、和洋会席にはオプションで準備ごと追加する', () => {
  for(const course of ['western','mixed']) for(const bread of [false,true]) {
    const s=E.initialState();s.course=course;s.options.bread=bread;
    s.times={breadAfterSoup:'13:00',breadAfterFish:'13:30'};
    const items=E.generate(rows,s);
    const breadRows=items.filter(r=>r.category==='パン');
    const enabled=course==='western'||bread;
    assert.equal(breadRows.length,enabled?4:0);
    assert.equal(E.activeOptions(s).some(([id])=>id==='bread'),course==='mixed');
    assert.equal(E.activeEvents(s).some(e=>e.id==='breadAfterSoup'),enabled);
    if(!enabled) continue;
    const first=get(s,22), second=get(s,23);
    assert.equal(first.group,'breadAfterSoup');assert.equal(first.startTime,'13:00');
    assert.equal(second.group,'breadAfterFish');assert.equal(second.startTime,'13:30');
    assert.equal(first.start,'スープ提供後');assert.equal(second.start,'ポアソン提供後');
    assert.ok(items.findIndex(r=>r.row===22)<items.findIndex(r=>r.row===23));
    assert.ok(!first.issues.some(x=>x.includes('入力時刻')));
    assert.ok(!second.issues.some(x=>x.includes('入力時刻')));
    assert.ok(E.printable(items,s).some(r=>r.row===22));
    assert.ok(E.printable(items,s).some(r=>r.row===23));
  }
});

test('和洋会席のパン設定・完了時刻・既存のメモとチェックは保存復元される', () => {
  const s=E.initialState();s.course='mixed';s.options.bread=true;
  s.times={preplateEnd:'11:20',setup:'11:30',soupEnd:'13:00',fishEnd:'13:30'};
  s.edits['excel-22']={note:'担当と数量を確認',done:true,equipment:'パン用トング'};
  const restored=E.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.times,s.times);assert.equal(restored.options.bread,true);
  const row=get(restored,22);
  assert.equal(row.note,'担当と数量を確認');assert.equal(row.done,true);assert.equal(row.equipment,'パン用トング');
  restored.course='western';assert.ok(get(restored,22));
  restored.course='mixed';restored.options.bread=false;assert.ok(!get(restored,22));
});

test('コースごとの先付け名・順序と刺身先付けの関連作業が一致する', () => {
  const s=E.initialState();
  assert.equal(E.eventLabel('preplate',s),'バター先付け');
  assert.ok(!E.activeEvents(s).some(e=>e.id==='sashimiPreplate'));
  assert.equal(get(s,17).title,'バター先付けを行う');
  assert.equal(get(s,8).title,'バター先付け時刻を確認する');
  s.course='mixed';
  const events=E.activeEvents(s);
  assert.equal(E.eventLabel('preplate',s),'前菜・ちらし寿司先付け');
  assert.ok(events.findIndex(e=>e.id==='preplate')<events.findIndex(e=>e.id==='sashimiPreplate'));
  assert.ok(events.findIndex(e=>e.id==='sashimiPreplate')<events.findIndex(e=>e.id==='setup'));
  assert.equal(get(s,28).group,'sashimiPreplate');
  assert.equal(get(s,29).group,'sashimiPreplate');
  assert.equal(get(s,29).title,'刺身を先付けする');
  assert.equal(get(s,29).deadline,'刺身先付け時');
  assert.equal(get(s,2).deadline,'前菜・ちらし寿司先付け前');
});

test('既存の時刻・利用者の編集を保持し、刺身先付け時刻は勝手に補完しない', () => {
  const s=E.initialState();s.course='mixed';
  s.times={preplate:'11:00',preplateEnd:'11:15',setup:'11:45',sashimi:'12:40'};
  s.edits['excel-8']={title:'自分で変更した作業名',note:'確認済み',done:true};
  let restored=E.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.times,s.times);
  assert.equal(restored.times.sashimiPreplate,undefined);
  assert.equal(get(restored,29).dueTime,'');
  assert.equal(get(restored,8).title,'自分で変更した作業名');
  restored.times.sashimiPreplate='11:30';
  restored=E.normalizeState(JSON.parse(JSON.stringify(restored)));
  assert.equal(get(restored,29).dueTime,'11:30');
  assert.equal(restored.times.sashimi,'12:40');
});

test('主要進行は指定されたコース別の順序で、作業のない進行もフローに含む', () => {
  const expected={
    western:['出勤','MTG','バター先付け','セットアップ','開場','新郎新婦入場','乾杯','お子様料理','HOV','歓談','ケーキ入刀','スープ','パン','お色直し中座','ポアソン','パン','ビアンド','お色直し入場','ケーキデザート・コーヒー','フォトラウンド','お見送り'],
    mixed:['出勤','MTG','前菜・ちらし寿司先付け','刺身先付け','セットアップ','開場','新郎新婦入場','乾杯','お子様料理','歓談','ケーキ入刀','ポアソン','お色直し中座','ビアンド','お色直し入場','ケーキデザート・コーヒー','フォトラウンド','お見送り']
  };
  for(const course of ['western','mixed']) {
    const s=E.initialState();s.course=course;
    const events=E.activeEvents(s);
    assert.deepEqual(events.map(e=>e.label),expected[course]);
    const groups=E.timelineGroups(E.generate(rows,s),s);
    const ids=groups.map(g=>g.event?.id || g.rows[0].group).filter(id=>id!=='ongoing');
    assert.deepEqual(ids,events.map(e=>e.id));
    assert.deepEqual(E.timelineGroups([],s).map(g=>g.event.id),events.map(e=>e.id));
    assert.ok(events.every(e=>!['preplateEnd','soupEnd','fishEnd','hovEnd','sashimi'].includes(e.id)));
  }
});

test('パンの時刻を個別に保存し、旧完了時刻と既存メモは破棄しない', () => {
  const s=E.initialState();s.times={preplateEnd:'11:00',soupEnd:'13:00',fishEnd:'13:30',breadAfterSoup:'13:05',breadAfterFish:'13:35'};
  s.custom=[{id:'custom-old',title:'追加作業',stage:'fishEnd'}];
  s.edits['excel-22']={note:'変更済み',done:true};
  const restored=E.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.times,s.times);
  assert.equal(restored.custom[0].stage,'fish');
  assert.equal(get(restored,22).startTime,'13:05');assert.equal(get(restored,23).startTime,'13:35');
  assert.equal(get(restored,22).note,'変更済み');assert.equal(get(restored,22).done,true);
});
