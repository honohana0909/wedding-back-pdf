const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');
const rows = require('../checklist.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
function app(state) {
  const nodes = new Map(), handlers = {};
  let saved = JSON.stringify(state);
  function node(key) {
    if (!nodes.has(key)) nodes.set(key, {
      innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, handlers:{},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(){}, focus(){}, showModal(){}, close(){}
    });
    return nodes.get(key);
  }
  const context = {
    window: { PassageEngine:E, PassageChecklist:rows, matchMedia:()=>({matches:true}), addEventListener(){} },
    document: {querySelector:node, querySelectorAll:()=>[], addEventListener:(type, handler)=>{handlers[type]=handler;}},
    localStorage: {getItem:()=>saved, setItem:(key, value)=>{saved=value;}}
  };
  vm.runInNewContext(source, context);
  return {node, handlers, saved:()=>JSON.parse(saved)};
}

test('入力したHTMLを画面・印刷で文字として出力する', () => {
  const payload = `"><img src=x onerror=alert(1)><script>alert(2)</script>&'`;
  const s=E.initialState();
  s.name=s.venue=s.staff=payload;
  s.custom=[{id:'custom-xss-test',custom:true,title:payload,stage:'open'}];
  s.edits['custom-xss-test']={title:payload,note:payload,equipment:payload,place:payload,contact:payload,caution:payload};
  const a=app(s);
  for (const id of ['#todo-list','#print-document']) {
    const html=a.node(id).innerHTML;
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&quot;'));
    assert.ok(html.includes('&#39;'));
  }
});

test('編集画面で変更した必要物などは保存後・再読み込み後も表示される', () => {
  const a=app(E.initialState());
  a.handlers.click({target:{closest:selector=>selector==='[data-edit]'?{dataset:{edit:'excel-2'}}:null}});
  a.node('#edit-equipment').value='トレー 3枚';
  a.node('#edit-place').value='控室';
  a.node('#edit-contact').value='進行担当';
  a.node('#edit-caution').value='数量を確認';
  a.node('#edit-note').value='当日のメモ';
  a.node('#edit-form').handlers.submit({preventDefault(){}});
  const saved=a.saved();
  assert.equal(saved.edits['excel-2'].equipment,'トレー 3枚');
  const reloaded=app(saved);
  const html=reloaded.node('#todo-list').innerHTML;
  for(const text of ['トレー 3枚','控室','進行担当','数量を確認','当日のメモ']) assert.ok(html.includes(text));
  assert.ok(reloaded.node('#print-document').innerHTML.includes('数量を確認'));
  assert.ok(!html.includes('原票：'));
});

test('全件を印刷し、未完了などの表示フィルターはPDFに影響しない', () => {
  for(const course of ['western','mixed']) for(const order of ['progress','time']) {
    const s=E.initialState();Object.assign(s,{course,order});
    s.options=Object.fromEntries(E.options.map(([id])=>[id,true]));
    s.edits['excel-2']={pdf:'×',done:true};s.includeUnset=false;
    const a=app(s), html=a.node('#print-document').innerHTML;
    assert.equal((html.match(/<tr class="p-task /g)||[]).length,E.generate(rows,s).length);
    for(const filter of ['unfinished','review','custom','all']) {
      a.handlers.change({target:{id:'filter',value:filter,dataset:{}}});
      assert.equal(a.node('#print-document').innerHTML,html);
    }
  }
});

test('既存ToDoの進行名が表示され、和洋会席のパン切替が画面とPDFに反映される', () => {
  const s=E.initialState();s.course='mixed';
  const a=app(s);
  assert.ok(a.node('#option-fields').innerHTML.includes('パンを追加'));
  assert.ok(a.node('#time-fields').innerHTML.includes('セットアップ'));
  assert.ok(!a.node('#todo-list').innerHTML.includes('進行未指定'));
  assert.ok(!a.node('#todo-list').innerHTML.includes('1回目・スープ後'));
  a.handlers.change({target:{dataset:{option:'bread'},checked:true}});
  for(const id of ['#todo-list','#print-document']) {
    const html=a.node(id).innerHTML;
    assert.ok(html.includes('1回目・スープ後'));assert.ok(html.includes('2回目・魚後'));
    assert.ok(!html.includes('進行未指定'));
  }
  assert.ok(a.node('#time-fields').innerHTML.includes('スープ'));
  a.handlers.change({target:{dataset:{},name:'course',value:'western'}});
  assert.ok(!a.node('#option-fields').innerHTML.includes('パンを追加'));
  assert.ok(!a.node('#print-document').innerHTML.includes('パンを追加'));
  assert.ok(a.node('#todo-list').innerHTML.includes('HOV'));
  assert.ok(!a.node('#todo-list').innerHTML.includes('進行未指定'));
});

test('画面・PDFの先付け名がコースで切り替わり、作業のないセットアップも表示する', () => {
  const s=E.initialState();s.times={preplate:'11:00',setup:'11:45',sashimiPreplate:'11:30'};
  const a=app(s);
  for(const id of ['#time-fields','#todo-list','#print-document']) assert.ok(a.node(id).innerHTML.includes('バター先付け'));
  let html=a.node('#todo-list').innerHTML;
  assert.ok(html.includes('stage-milestone'));
  assert.ok(html.includes('セットアップ'));
  assert.ok(html.indexOf('バター先付け</h3>')<html.indexOf('セットアップ</h3>'));
  assert.equal((html.match(/<article /g)||[]).length,E.generate(rows,s).length);
  a.handlers.change({target:{dataset:{},name:'course',value:'mixed'}});
  for(const id of ['#time-fields','#todo-list','#print-document']) {
    const content=a.node(id).innerHTML;
    assert.ok(content.includes('前菜・ちらし寿司先付け'));
    assert.ok(content.includes('刺身先付け'));
    assert.ok(!content.includes('バター先付け'));
  }
  html=a.node('#todo-list').innerHTML;
  assert.ok(html.indexOf('前菜・ちらし寿司先付け</h3>')<html.indexOf('刺身先付け</h3>'));
  assert.ok(html.indexOf('刺身先付け</h3>')<html.indexOf('セットアップ</h3>'));
  assert.ok(!html.includes('進行未指定'));
  a.handlers.click({target:{closest:selector=>selector==='[data-order]'?{dataset:{order:'time'}}:null}});
  html=a.node('#todo-list').innerHTML;
  assert.ok(html.includes('stage-milestone'));
  assert.ok(html.includes('<time>11:45</time>'));
});

test('PDFは工程見出しを付け、数値の時刻と元の前後条件を両方表示する', () => {
  const s=E.initialState();
  s.times={meeting:'10:30',preplate:'11:30',open:'12:00'};
  const html=app(s).node('#print-document').innerHTML;
  assert.ok(html.includes('scope="rowgroup"'));
  assert.ok(html.includes('p-stage-food'));
  assert.ok(html.includes('10:30 → 11:30'));
  assert.ok(html.includes('p-relation'));
  const row=E.generate(rows,s).find(r=>r.id==='excel-2');
  assert.ok(html.includes(row.start));
  assert.ok(html.includes(row.deadline));
  assert.ok(!html.includes('undefined'));
});

test('長い注意点もPDFから省略しない', () => {
  const s=E.initialState();
  const caution='注意事項を最後まで表示。'.repeat(100);
  s.edits['excel-2']={caution};
  const html=app(s).node('#print-document').innerHTML;
  assert.ok(html.includes(caution));
  assert.ok(html.includes('long-row'));
});

test('印刷でもコース別の先付け名と空のセットアップを維持する', () => {
  const s=E.initialState();s.course='mixed';s.times={preplate:'11:00',sashimiPreplate:'11:30',setup:'11:45'};
  const html=app(s).node('#print-document').innerHTML;
  assert.ok(html.includes('前菜・ちらし寿司先付け'));
  assert.ok(html.includes('刺身先付け'));
  assert.ok(html.includes('p-milestone'));
  assert.ok(html.includes('11:45'));
  assert.ok(!html.includes('バター先付け'));
  assert.ok(!html.includes('undefined'));
  assert.equal((html.match(/<tr class="p-task /g)||[]).length,E.generate(rows,s).length);
});

test('時刻欄・タイムライン・PDFのフローが同じ進行順になる', () => {
  for(const course of ['western','mixed']) {
    const s=E.initialState();s.course=course;
    // Different clock values must not reorder progress mode.
    s.times={open:'15:00',entrance:'14:00'};
    const a=app(s), events=E.activeEvents(s);
    const inputs=[...a.node('#time-fields').innerHTML.matchAll(/data-time="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(inputs,events.map(e=>e.id));
    const headings=[...a.node('#todo-list').innerHTML.matchAll(/<h3 id="stage-\d+">([^<]+)<\/h3>/g)].map(m=>m[1]);
    assert.deepEqual(headings.slice(0,events.length),events.map(e=>e.label));
    const flow=a.node('#print-document').innerHTML.split('<div class="print-flow">')[1].split('</div>')[0];
    const labels=[...flow.matchAll(/<\/b> ([^<]+)<\/span>/g)].map(m=>m[1]);
    assert.deepEqual(labels,events.map(e=>e.label));
    assert.equal(Number(a.node('#total-count').textContent),E.generate(rows,s).length);
  }
});
