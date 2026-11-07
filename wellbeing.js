(() => {
  const questions = ['我會為重要的事情訂下具體目標。','我能按照計畫開始要做的事。','遇到干擾時，我能把注意力帶回手邊的事。','即使沒有立即看到成果，我仍願意持續練習。','沒有做到計畫時，我會調整方法再試一次。'];
  const options = ['很少','偶爾','經常','幾乎總是'];
  const container = document.getElementById('assessmentQuestions');
  const form = document.getElementById('surveyForm');
  const result = document.getElementById('surveyResult');
  const key = 'daily-rhythm-self-assessment-v1';
  questions.forEach((question, i) => {
    const field = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${i + 1}. ${question}`;
    field.append(legend);
    options.forEach((option, n) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `q${i}`; input.value = String(n + 1); input.required = true;
      label.append(input, document.createTextNode(' ' + option)); field.append(label);
    });
    container.append(field);
  });
  function display(values) {
    const score = values.reduce((sum, value) => sum + Number(value), 0);
    const advice = score <= 10 ? '可以先挑一件容易做到的小事，安排固定時間練習。' : score <= 15 ? '你已建立一些基礎；試著找出最容易中斷的環節，調整目標或環境。' : '你已有不錯的自我管理習慣，記得保持彈性，也為休息留空間。';
    result.textContent = `你的分數：${score}／20。${advice} 這是自我反思工具，並非專業診斷。`;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved) && saved.length === questions.length && saved.every(x => Number.isInteger(x) && x >= 1 && x <= 4)) {
      saved.forEach((v, i) => { form.elements[`q${i}`].value = String(v); }); display(saved);
    }
  } catch {}
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = questions.map((_, i) => Number(form.elements[`q${i}`].value));
    display(values);
    try { localStorage.setItem(key, JSON.stringify(values)); } catch { result.textContent += ' 此瀏覽器無法儲存答案。'; }
  });

  const area = document.getElementById('gameArea');
  const choices = document.querySelectorAll('[data-game]');
  let cleanup = () => {};
  function selectGame(game) {
    cleanup(); cleanup = () => {};
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.game === game)));
    area.replaceChildren();
    if (game === 'bubble') bubbles(); else if (game === 'match') match(); else breath();
  }
  function bubbles() {
    area.innerHTML = '<strong>🫧 戳破泡泡</strong><p>輕輕點掉泡泡，慢慢放鬆一下。</p><div class="bubble-board"></div><p class="game-status" role="status" aria-live="polite"></p><button class="game-action" type="button">再玩一次</button>';
    const board = area.querySelector('.bubble-board'), status = area.querySelector('.game-status'); let count = 0;
    for (let i = 0; i < 12; i++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '◯'; b.setAttribute('aria-label', `戳破第 ${i + 1} 個泡泡`); b.addEventListener('click', () => { b.disabled = true; b.textContent = '✧'; count++; status.textContent = count === 12 ? '泡泡全都戳破了，深呼吸一下吧！' : `已戳破 ${count}／12 個泡泡`; }); board.append(b); }
    area.querySelector('.game-action').onclick = () => selectGame('bubble');
  }
  function match() {
    area.innerHTML = '<strong>🌿 翻牌配對</strong><p>翻開兩張卡片，找出四組相同的圖案。</p><div class="match-board"></div><p class="game-status" role="status" aria-live="polite"></p><button class="game-action" type="button">重新洗牌</button>';
    const board = area.querySelector('.match-board'), status = area.querySelector('.game-status');
    const cards = ['🌿','🌸','☀️','🍋','🌿','🌸','☀️','🍋'];
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    let first = null, locked = false, pairs = 0, timer;
    cards.forEach((symbol, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = '？'; b.setAttribute('aria-label', `翻開第 ${i + 1} 張卡片`); b.onclick = () => { if (locked || b === first) return; b.textContent = symbol; b.setAttribute('aria-label', `第 ${i + 1} 張：${symbol}`); if (!first) { first = b; return; } if (first.textContent === symbol) { first.disabled = b.disabled = true; first = null; pairs++; status.textContent = pairs === 4 ? '完成配對！做得很好。' : `已找到 ${pairs}／4 組`; } else { locked = true; const previous = first; timer = setTimeout(() => { previous.textContent = b.textContent = '？'; previous.setAttribute('aria-label','翻開卡片'); b.setAttribute('aria-label','翻開卡片'); first = null; locked = false; }, 800); } }; board.append(b); });
    cleanup = () => clearTimeout(timer);
    area.querySelector('.game-action').onclick = () => selectGame('match');
  }
  function breath() {
    area.innerHTML = '<strong>🌬️ 呼吸節奏</strong><p>跟著提示，吸氣 4 秒、吐氣 4 秒。依自己的舒適節奏進行。</p><div class="breath-orb" aria-live="polite">準備好了</div><button class="game-action" type="button">開始</button>';
    const orb = area.querySelector('.breath-orb'), button = area.querySelector('.game-action'); let timer = null, seconds = 0;
    button.onclick = () => { if (timer) { clearInterval(timer); timer = null; orb.textContent = '準備好了'; button.textContent = '開始'; return; } seconds = 0; orb.textContent = '吸氣 4'; button.textContent = '停止'; timer = setInterval(() => { seconds++; orb.textContent = (seconds % 8 < 4 ? '吸氣 ' : '吐氣 ') + (4 - seconds % 4); }, 1000); };
    cleanup = () => clearInterval(timer);
  }
  choices.forEach(button => button.addEventListener('click', () => selectGame(button.dataset.game)));
  selectGame('bubble');
})();
