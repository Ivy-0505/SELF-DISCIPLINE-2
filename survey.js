(() => {
  const form = document.getElementById('surveyForm');
  const result = document.getElementById('surveyResult');
  const button = form.querySelector('button[type="submit"]');
  const draftKey = 'daily-rhythm-feedback-v1';
  const endpoint = 'https://xeotzkothvtrqjsnegqz.supabase.co/rest/v1/survey_responses';
  // Public browser key. Database permissions allow submissions only.
  const publishableKey = 'sb_publishable_x0UgdV_Dba5TdhgGavmDFA_Rd9ojQCA';
  let submitting = false;

  try {
    const saved = JSON.parse(localStorage.getItem(draftKey));
    if (saved && typeof saved === 'object') {
      for (const name of ['rating', 'feature', 'ease', 'usage_frequency', 'visual_clarity', 'helpfulness', 'return_intent']) {
        for (const input of form.elements[name]) input.checked = input.value === saved[name];
      }
      form.elements.suggestion.value = typeof saved.suggestion === 'string' ? saved.suggestion : '';
      result.textContent = '已載入之前的答案，按「送出回饋」即可提交。';
    }
  } catch { /* Browser storage is optional; submission still works. */ }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    const answers = Object.fromEntries(new FormData(form));
    const payload = {
      rating: answers.rating,
      feature: answers.feature,
      ease: answers.ease,
      usage_frequency: answers.usage_frequency,
      visual_clarity: answers.visual_clarity,
      helpfulness: answers.helpfulness,
      return_intent: answers.return_intent,
      suggestion: (answers.suggestion || '').trim()
    };
    try { localStorage.setItem(draftKey, JSON.stringify(payload)); } catch {}
    submitting = true;
    button.disabled = true;
    button.textContent = '送出中…';
    form.setAttribute('aria-busy', 'true');
    result.textContent = '正在送出回饋，請稍候。';
    result.style.color = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Submission failed: ' + response.status);
      result.textContent = '感謝你的回饋！答案已成功送出。';
      form.reset();
      try { localStorage.removeItem(draftKey); } catch {}
    } catch (error) {
      result.style.color = '#b75f52';
      result.textContent = error.name === 'AbortError'
        ? '連線逾時，暫時無法確認送出結果。你的答案仍保留在表單中，請稍後再試。'
        : '回饋送出失敗，請確認網路後再試一次。你的答案仍保留在表單中。';
    } finally {
      clearTimeout(timeout);
      submitting = false;
      button.disabled = false;
      button.textContent = '送出回饋';
      form.removeAttribute('aria-busy');
    }
  });
})();
