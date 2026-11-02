// Run with: node tests/cloud.test.cjs
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../cloud.js'), 'utf8');

async function setup({user = {id:'alice', email:'alice@example.invalid'}, initial = {}, remote = new Map(), failLoad = false} = {}) {
  const storage = new Map(Object.entries(initial));
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {textContent:'', hidden:true, classList:{toggle(){}}, addEventListener(name,handler){this[name]=handler;}, querySelectorAll:()=>[], showModal(){}, close(){}});
    return elements.get(id);
  };
  const controls = {failWrites:false, hold:null, calls:0, reloads:0, authCalls:[],authResponse:{data:{session:null}}};
  const client = {
    auth: {
      getSession:async()=>({data:{session:user ? {user} : null}}),onAuthStateChange(){},signOut:async()=>({}),
      signUp:async args=>{controls.authCalls.push({action:'signup',...args});return controls.authResponse;},
      signInWithPassword:async args=>{controls.authCalls.push({action:'login',...args});return controls.authResponse;}
    },
    from:()=>({select(){return this;},eq(){return this;},abortSignal:async()=>failLoad ? {error:{message:'offline'}} : {data:[...remote].map(([kind,row])=>({kind,...row}))}}),
    rpc:(_name,args)=>({abortSignal:async()=>{
      controls.calls++;
      if (controls.hold) await controls.hold;
      if (controls.failWrites) return {error:{message:'offline'}};
      const row = remote.get(args.p_kind);
      if ((row?.version || 0) !== args.p_version) return {error:{code:'40001'}};
      const version = args.p_version + 1;
      remote.set(args.p_kind,{payload:args.p_payload,version});
      return {data:version};
    }})
  };
  const sandbox = {
    window:{supabase:{createClient:()=>client},addEventListener(){}},
    document:{getElementById:element,addEventListener(){},createElement:()=>({click(){}}),body:{append:script=>script.onload?.()}},
    localStorage:{getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    location:{reload:()=>controls.reloads++},
    confirm:()=>true,
    setTimeout:()=>1,clearTimeout(){},AbortSignal,Blob,URL
  };
  await vm.runInNewContext(source,sandbox);
  return {store:sandbox.window.RhythmStore,storage,elements,element,remote,controls,flush:()=>element('retrySync').onclick()};
}

async function run() {
  const checks = [];
  let app = await setup({user:null,initial:{'daily-rhythm-v1':'{"habits":[{"name":"guest"}]}'}});
  app.store.setItem('daily-rhythm-areas-v1','{"days":{}}');
  assert.equal(app.controls.calls,0);
  assert.equal(app.storage.get('daily-rhythm-areas-v1'),'{"days":{}}');
  checks.push('guest remains local');

  app = await setup({initial:{'daily-rhythm-v1':'{"habits":[{"name":"guest"}]}'}});
  assert.equal(app.store.getItem('daily-rhythm-v1'),null);
  app.store.setItem('daily-rhythm-v1','{"habits":[{"name":"private"}]}');
  await app.flush();
  assert.equal(app.remote.get('habits').payload.habits[0].name,'private');
  assert.equal(JSON.parse(app.storage.get('daily-rhythm-v1')).habits[0].name,'guest');
  checks.push('account cache does not replace guest records');

  app = await setup();
  app.controls.failWrites = true;
  app.store.setItem('daily-rhythm-tasks-v1','{"2026-11-02":[{"text":"todo","done":false}]}');
  await app.flush();
  const backup = app.storage.get('daily-rhythm-cloud-v1:alice');
  assert.equal(JSON.parse(backup).study_tasks.dirty,true);
  app = await setup({initial:{'daily-rhythm-cloud-v1:alice':backup}});
  await app.flush();
  assert.equal(app.remote.get('study_tasks').payload['2026-11-02'][0].text,'todo');
  assert.equal(JSON.parse(app.storage.get('daily-rhythm-cloud-v1:alice')).study_tasks.dirty,false);
  checks.push('failed writes survive reload and retry');

  app = await setup();
  let release;
  app.controls.hold = new Promise(resolve=>release=resolve);
  app.store.setItem('daily-rhythm-areas-v1','{"days":{"today":{"water":250}}}');
  const first = app.flush();
  await Promise.resolve();
  app.store.setItem('daily-rhythm-areas-v1','{"days":{"today":{"water":500}}}');
  release();
  await first;
  app.controls.hold = null;
  await app.flush();
  assert.equal(app.remote.get('daily_entries').version,2);
  assert.equal(app.remote.get('daily_entries').payload.days.today.water,500);
  checks.push('edits during an in-flight save preserve the newest value');

  app = await setup({remote:new Map([['habits',{payload:{habits:[]},version:1}]])});
  app.store.setItem('daily-rhythm-v1','{"habits":[{"name":"local"}]}');
  app.remote.set('habits',{payload:{habits:[{name:'other-device'}]},version:2});
  await app.flush();
  assert.equal(app.remote.get('habits').payload.habits[0].name,'other-device');
  assert.equal(JSON.parse(app.store.getItem('daily-rhythm-v1')).habits[0].name,'local');
  assert.equal(app.elements.get('resolveConflict').hidden,false);
  checks.push('conflicts preserve both local and remote data');

  app = await setup({failLoad:true});
  app.store.setItem('daily-rhythm-v1','{"habits":[]}');
  await app.flush();
  assert.equal(app.controls.calls,0);
  assert.equal(app.controls.reloads,1);
  checks.push('failed cloud reads cannot overwrite unknown remote data');

  app = await setup({remote:new Map([['habits',{payload:{habits:[{name:'remote'}]},version:1}]]),initial:{'daily-rhythm-v1':'{"habits":[{"name":"guest"}]}','daily-rhythm-tasks-v1':'{"today":[{"text":"old todo"}]}'}});
  await app.elements.get('importLocal').onclick();
  assert.equal(app.remote.get('habits').payload.habits[0].name,'remote');
  assert.equal(app.remote.get('study_tasks').payload.today[0].text,'old todo');
  checks.push('explicit import fills missing categories without overwriting cloud records');
  app = await setup({user:null});
  app.element('authEmail').value = 'tester@example.invalid';
  app.element('authPassword').value = 'short';
  const submit = action=>app.elements.get('authForm').submit({preventDefault(){},submitter:{value:action}});
  await submit('signup');
  assert.equal(app.controls.authCalls.length,0);
  app.elements.get('authPassword').value = 'mock-password-123';
  await submit('signup');
  assert.equal(app.controls.authCalls[0].action,'signup');
  assert.match(app.elements.get('authMessage').textContent,/驗證信/);
  assert.equal(app.elements.get('authPassword').value,'');
  app.elements.get('authPassword').value = 'mock-password-123';
  app.controls.authResponse = {error:{code:'invalid_credentials'}};
  await submit('login');
  assert.match(app.elements.get('authMessage').textContent,/信箱或密碼/);
  app.controls.authResponse = {data:{session:{user:{id:'alice'}}}};
  await submit('login');
  assert.equal(app.controls.reloads,1);
  checks.push('registration validation, confirmation message, login errors and success handling');
  return checks;
}
module.exports = run;
if (require.main === module) run().then(checks=>console.log(checks.map(x=>'PASS: '+x).join('\n'))).catch(error=>{console.error(error);process.exitCode=1;});
