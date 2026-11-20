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
    assert.equal((html.match(/<tr>/g)||[]).length-1,E.generate(rows,s).length);
    for(const filter of ['unfinished','review','custom','all']) {
      a.handlers.change({target:{id:'filter',value:filter,dataset:{}}});
      assert.equal(a.node('#print-document').innerHTML,html);
    }
  }
});
