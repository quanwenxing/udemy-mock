const L = ['A', 'B', 'C', 'D'];

const state = {
  tests: [],
  testIndex: 0,
  questionIndex: 0,
  score: 0,
  answered: 0,
  locked: false,
};

const el = {
  testSelect: document.getElementById('testSelect'),
  qnum: document.getElementById('qnum'),
  counter: document.getElementById('counter'),
  progressBar: document.getElementById('progressBar'),
  questionText: document.getElementById('questionText'),
  options: document.getElementById('options'),
  result: document.getElementById('result'),
  nextBtn: document.getElementById('nextBtn'),
  restartBtn: document.getElementById('restartBtn'),
  scoreChip: document.getElementById('scoreChip'),
};

function escapeHtml(s = '') {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function loadTests() {
  const res = await fetch('./data/tests.json');
  if (!res.ok) throw new Error('Failed to load tests.json');
  const payload = await res.json();
  state.tests = payload.tests || [];
  el.testSelect.innerHTML = state.tests
    .map((test, i) => `<option value="${i}">${escapeHtml(test.title)} (${test.questions.length}問)</option>`)
    .join('');
}

function currentTest() {
  return state.tests[state.testIndex];
}

function renderQuestion() {
  const test = currentTest();
  const q = test.questions[state.questionIndex];

  state.locked = false;
  el.result.className = 'result';
  el.result.innerHTML = '';
  el.nextBtn.disabled = true;

  el.qnum.textContent = `${test.title} - 問題 ${q.n}`;
  el.counter.textContent = `${state.questionIndex + 1} / ${test.questions.length}`;
  el.progressBar.style.width = `${(state.questionIndex / test.questions.length) * 100}%`;
  el.questionText.textContent = q.question;

  el.options.innerHTML = q.options
    .map(
      (txt, i) =>
        `<button class="option" data-i="${i}" aria-label="${L[i]} ${escapeHtml(txt)}"><span class="label">${L[i]}.</span>${escapeHtml(
          txt,
        )}</button>`,
    )
    .join('');

  [...el.options.querySelectorAll('.option')].forEach((btn) => {
    btn.addEventListener('click', () => judge(Number(btn.dataset.i)));
  });
}

function judge(selected) {
  if (state.locked) return;
  state.locked = true;

  const test = currentTest();
  const q = test.questions[state.questionIndex];

  state.answered += 1;
  const isCorrect = selected === q.answer;
  if (isCorrect) state.score += 1;

  const optionEls = [...el.options.querySelectorAll('.option')];
  optionEls.forEach((op, i) => {
    op.classList.add('disabled');
    if (i === q.answer) op.classList.add('correct');
    else if (i === selected) op.classList.add('wrong');
    else op.classList.add('muted');
  });

  const wrongNotes = q.options
    .map((_, i) => {
      if (i === q.answer) return null;
      const msg = (q.whyWrong || [])[i] || 'この選択肢は要件との整合性が低く、AWS推奨パターンから外れます。';
      return `<li><strong>${L[i]}:</strong> ${escapeHtml(msg)}</li>`;
    })
    .filter(Boolean)
    .join('');

  const refs = (q.refs || [])
    .map(
      (r) =>
        `<li><a href="${encodeURI(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          r.label,
        )}</a></li>`,
    )
    .join('');

  el.result.className = `result show ${isCorrect ? 'ok' : 'bad'}`;
  el.result.innerHTML = `
    <h3>${isCorrect ? '✅ 正解' : '❌ 不正解'}（正解: ${L[q.answer]}）</h3>
    <p>${escapeHtml(q.explain || 'AWS公式ドキュメントを参照して確認してください。')}</p>
    <div class="sec-title">誤答の理由</div>
    <ul>${wrongNotes || '<li>補足なし</li>'}</ul>
    <div class="sec-title">参考ドキュメント</div>
    <ul>${refs || '<li>なし</li>'}</ul>
  `;

  el.scoreChip.textContent = `Score ${state.score} / ${state.answered}`;
  el.nextBtn.disabled = false;
  el.nextBtn.textContent =
    state.questionIndex === test.questions.length - 1 ? '結果を見る' : '次の問題へ';
}

function finish() {
  const test = currentTest();
  const total = test.questions.length;
  const percent = Math.round((state.score / total) * 100);

  el.progressBar.style.width = '100%';
  el.qnum.textContent = `${test.title} - 結果`;
  el.counter.textContent = `${total} / ${total}`;
  el.questionText.innerHTML = `終了！ <strong>${state.score}/${total}</strong> 正解（${percent}%）`;
  el.options.innerHTML = '';
  el.result.className = 'result show';
  el.result.innerHTML = '<h3>おつかれさまでした！</h3><p>別のPractice Testに切り替えて続けて練習できます。</p>';
  el.nextBtn.disabled = true;
}

function next() {
  const total = currentTest().questions.length;
  if (state.questionIndex < total - 1) {
    state.questionIndex += 1;
    renderQuestion();
    return;
  }
  finish();
}

function resetCurrentTest() {
  state.questionIndex = 0;
  state.score = 0;
  state.answered = 0;
  state.locked = false;
  el.scoreChip.textContent = 'Score 0 / 0';
  el.nextBtn.textContent = '次の問題へ';
  renderQuestion();
}

function switchTest(i) {
  state.testIndex = i;
  resetCurrentTest();
}

function bindEvents() {
  el.testSelect.addEventListener('change', (e) => switchTest(Number(e.target.value)));
  el.nextBtn.addEventListener('click', next);
  el.restartBtn.addEventListener('click', resetCurrentTest);
}

(async function init() {
  try {
    await loadTests();
    bindEvents();
    switchTest(0);
  } catch (err) {
    el.questionText.textContent = '問題データの読み込みに失敗しました。';
    el.result.className = 'result show bad';
    el.result.textContent = String(err.message || err);
  }
})();
