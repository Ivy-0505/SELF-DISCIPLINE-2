/* Supabase SDK is vendored at an exact version; only the public key is used here. */
(async () => {
  const $ = id => document.getElementById(id);
  const kinds = {'daily-rhythm-v1':'habits','daily-rhythm-areas-v1':'daily_entries','daily-rhythm-tasks-v1':'study_tasks'};
  const status = $('syncStatus');
  const dashboardSections = ['areas', 'habits', 'progress'];
  for (const id of dashboardSections) $(id).inert = true;
  $('heroAdd').disabled = true;
  const read = (key, fallback = null) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); };
  let client, user = null, cache = {}, running = false, timer, initialized = false, loading = true;
  let conflict = false, loadFailed = false, storageFailed = false;
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('sync-error', error); };
  const pending = () => Object.values(cache).some(item => item.dirty);
  const cacheKey = () => 'daily-rhythm-cloud-v1:' + user.id;
  function persist() {
    try { write(cacheKey(), cache); storageFailed = false; }
    catch { storageFailed = true; say('瀏覽器無法保存備份，請保持此頁開啟並重試同步。', true); }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }
  async function flush() {
    if (!user || !client || loadFailed || conflict || running) return !pending();
    running = true;
    let failed = false;
    try {
      for (const kind of Object.values(kinds)) {
        const item = cache[kind];
        if (!item?.dirty) continue;
        const snapshot = JSON.stringify(item.payload);
        say('正在同步…');
        const {data, error} = await client.rpc('save_rhythm_document', {
          p_kind: kind, p_payload: JSON.parse(snapshot), p_version: item.version
        }).abortSignal(AbortSignal.timeout(15000));
        if (error) {
          if (error.code === '40001') {
            conflict = true;
            $('resolveConflict').hidden = false;
            say('另一個裝置已有更新。請下載待同步備份，或保留備份後載入雲端版本。', true);
          } else say('尚未同步，記錄保留在本機。請確認網路後按「重試同步」。', true);
          failed = true;
          break;
        }
        item.version = data;
        item.dirty = JSON.stringify(item.payload) !== snapshot;
        persist();
      }
    } catch {
      failed = true;
      say('連線失敗，記錄保留在本機，請重試同步。', true);
    } finally { running = false; }
    if (!failed && pending()) schedule();
    else if (!failed && !storageFailed) say('已同步到雲端');
    return !failed && !pending();
  }
  window.RhythmStore = {
    getItem(key) {
      if (!user) return localStorage.getItem(key);
      const kind = kinds[key];
      if (kind) return cache[kind] ? JSON.stringify(cache[kind].payload) : null;
      return localStorage.getItem(key + ':' + user.id);
    },
    setItem(key, value) {
      if (!user) {
        try { localStorage.setItem(key, value); say('訪客模式：僅儲存在此瀏覽器。登入可同步。'); }
        catch { say('瀏覽器無法儲存資料，請保持此頁開啟。', true); }
        return;
      }
      const kind = kinds[key];
      if (!kind) {
        try { localStorage.setItem(key + ':' + user.id, value); } catch { say('瀏覽器無法儲存本機記錄。', true); }
        return;
      }
      const previous = cache[kind];
      if (previous) { previous.payload = JSON.parse(value); previous.dirty = true; }
      else cache[kind] = {payload: JSON.parse(value), version: 0, dirty: true};
      persist();
      if (!conflict) say('已保留在本機，等待同步…');
      schedule();
    }
  };
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({exported_at:new Date().toISOString(), documents:cache}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'daily-rhythm-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('downloadBackup').onclick = downloadBackup;
  $('resolveConflict').onclick = () => {
    if (!confirm('將保留此頁的待同步記錄備份，再載入雲端版本。是否繼續？')) return;
    try {
      write(cacheKey() + ':conflict-backup:' + Date.now(), cache);
      downloadBackup();
      localStorage.removeItem(cacheKey());
      location.reload();
    } catch { say('無法保存備份，尚未載入雲端版本。請先下載備份。', true); }
  };
  $('retrySync').onclick = async () => {
    if (loading) return;
    if (loadFailed) { location.reload(); return; }
    if (await flush()) await refreshCloud();
  };
  async function refreshCloud() {
    if (!user || pending() || running || loading || loadFailed) return;
    const {data, error} = await client.from('rhythm_documents').select('kind,payload,version').eq('user_id', user.id)
      .abortSignal(AbortSignal.timeout(15000));
    if (error) { say('暫時無法檢查雲端更新，請稍後重試。', true); return; }
    if (pending() || running) return;
    const changed = data.some(row => row.version !== cache[row.kind]?.version);
    if (changed) {
      for (const row of data) cache[row.kind] = {...row, dirty:false};
      persist();
      location.reload();
    }
  }
  $('importLocal').onclick = async () => {
    if (!user || loading || running || loadFailed || conflict) return;
    if (!confirm('將匯入這個瀏覽器的習慣、生活記錄與待辦；雲端已存在的分類會保留，不會覆蓋。是否繼續？')) return;
    let count = 0;
    for (const [key, kind] of Object.entries(kinds)) {
      const old = read(key);
      if (!cache[kind] && old && typeof old === 'object' && !Array.isArray(old)) {
        cache[kind] = {payload:old,version:0,dirty:true}; count++;
      }
    }
    if (!count) { say('沒有可匯入的新分類，雲端記錄已保留。'); return; }
    persist();
    if (await flush()) location.reload();
    else say('匯入記錄已保留在本機，請重試同步後重新整理。', true);
  };
  $('accountOpen').onclick = () => $('accountDialog').showModal();
  $('accountClose').onclick = () => $('accountDialog').close();
  $('accountDialog').addEventListener('click', e => { if (e.target === $('accountDialog')) $('accountDialog').close(); });
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    const action = event.submitter?.value || 'login';
    if (!client) { $('authMessage').textContent = '登入服務尚未載入，請重新整理再試。'; return; }
    const email = $('authEmail').value.trim(), password = $('authPassword').value;
    if (action === 'signup' && password.length < 8) {
      $('authMessage').textContent = '註冊密碼請至少使用 8 個字元。';
      return;
    }
    const buttons = $('authForm').querySelectorAll('button');
    buttons.forEach(button => button.disabled = true);
    $('authMessage').textContent = '處理中…';
    try {
      const {data, error} = action === 'signup'
        ? await client.auth.signUp({email,password})
        : await client.auth.signInWithPassword({email,password});
      if (error) {
        const messages = {invalid_credentials:'信箱或密碼不正確。',email_not_confirmed:'請先完成信箱驗證，再回到此頁登入。',over_email_send_rate_limit:'驗證信寄送次數已達上限，請稍後再試。',user_already_exists:'此信箱已註冊，請直接登入。',weak_password:'密碼強度不足，請使用更長且包含不同字元的密碼。',signup_disabled:'目前暫停註冊，請聯絡網站管理者。'};
        $('authMessage').textContent = messages[error.code] || '暫時無法完成操作，請確認資料及網路後再試。';
        return;
      }
      $('authPassword').value = '';
      if (data.session) location.reload();
      else $('authMessage').textContent = '請查看驗證信並完成信箱驗證，之後回到此頁登入。若已註冊，請直接登入。';
    } catch { $('authMessage').textContent = '無法連線，請稍後再試。'; }
    finally { buttons.forEach(button => button.disabled = false); }
  });
  $('signOut').onclick = async () => {
    if (!(await flush()) && !confirm('仍有待同步記錄。登出後，本機備份會保留，重新登入同一帳號可重試。確定登出？')) return;
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) { say('登出失敗，請稍後再試。', true); return; }
    location.reload();
  };
  try {
    if (!window.supabase) throw new Error('SDK unavailable');
    client = window.supabase.createClient('https://xeotzkothvtrqjsnegqz.supabase.co', 'sb_publishable_x0UgdV_Dba5TdhgGavmDFA_Rd9ojQCA');
    const {data, error} = await client.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    if (user) {
      $('accountName').textContent = user.email || '已登入';
      $('accountOpen').hidden = true;
      $('signOut').hidden = false;
      $('cloudTools').hidden = false;
      cache = read(cacheKey(), {});
      if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
      const {data: rows, error: loadError} = await client.from('rhythm_documents').select('kind,payload,version').eq('user_id', user.id)
        .abortSignal(AbortSignal.timeout(15000));
      if (loadError) {
        loadFailed = true;
        say('雲端讀取失敗，目前顯示此帳號的本機備份；請重試同步。', true);
      } else {
        for (const row of rows) {
          const local = cache[row.kind];
          if (local?.dirty && local.version !== row.version) conflict = true;
          if (!local?.dirty) cache[row.kind] = {...row,dirty:false};
        }
        persist();
        if (conflict) {
          $('resolveConflict').hidden = false;
          say('另一個裝置已有更新。請先保留待同步備份，再載入雲端版本。', true);
        } else say(pending() ? '本機有待同步記錄。' : '已同步到雲端');
      }
      $('importLocal').hidden = !Object.keys(kinds).some(key => read(key) !== null);
    } else say('訪客模式：僅儲存在此瀏覽器。登入可同步。');
    client.auth.onAuthStateChange((_event, session) => {
      if (initialized && (session?.user?.id || null) !== (user?.id || null)) location.reload();
    });
  } catch {
    say('無法連接登入服務，目前使用本機記錄。請重新整理再試。', true);
  }
  loading = false;
  initialized = true;
  const script = document.createElement('script');
  script.src = 'dashboard.js';
  script.onload = () => {
    for (const id of dashboardSections) $(id).inert = false;
    $('heroAdd').disabled = false;
  };
  script.onerror = () => say('頁面功能載入失敗，請重新整理。', true);
  document.body.append(script);
  if (user && pending() && !conflict && !loadFailed) schedule();
  window.addEventListener('online', () => { if (loadFailed) say('網路已恢復，請按「重試同步」載入雲端資料。'); else flush(); });
  window.addEventListener('beforeunload', event => {
    if (user && pending()) { event.preventDefault(); event.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && user) { if (pending()) flush(); else refreshCloud(); }
  });
})();
