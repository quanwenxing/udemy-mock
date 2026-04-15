function labelFor(index) {
  return String.fromCharCode(65 + index);
}

const state = {
  tests: [],
  testIndex: 0,
  questionIndex: 0,
  score: 0,
  answered: 0,
  locked: false,
  selected: new Set(),
  questionResults: [], // null | { correct: bool, selected: number[] }
};

const el = {
  testSelect: document.getElementById('testSelect'),
  qnum: document.getElementById('qnum'),
  counter: document.getElementById('counter'),
  progressBar: document.getElementById('progressBar'),
  questionText: document.getElementById('questionText'),
  questionMeta: document.getElementById('questionMeta'),
  options: document.getElementById('options'),
  result: document.getElementById('result'),
  checkBtn: document.getElementById('checkBtn'),
  nextBtn: document.getElementById('nextBtn'),
  restartBtn: document.getElementById('restartBtn'),
  scoreChip: document.getElementById('scoreChip'),
  navToggle: document.getElementById('navToggle'),
  navPanel: document.getElementById('navPanel'),
  navGrid: document.getElementById('navGrid'),
};

function escapeHtml(s = '') {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getAnswers(q) {
  return Array.isArray(q.answer) ? [...q.answer] : [q.answer];
}

function isMultiSelect(q) {
  return getAnswers(q).length > 1;
}

function requiredSelections(q) {
  return getAnswers(q).length;
}

function getWhyWrong(q, index) {
  return (q.whyWrong || [])[index] || 'この選択肢は設問の要件を満たしません。';
}

function setsMatch(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// --- localStorage ---

function storageKey() {
  return `quiz_${currentTest().id}`;
}

function saveProgress() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      questionResults: state.questionResults,
      questionIndex: state.questionIndex,
    }));
  } catch {
    // ignore storage errors (private mode, quota exceeded, etc.)
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    const total = currentTest().questions.length;
    state.questionResults = Array.from(
      { length: total },
      (_, i) => data.questionResults?.[i] ?? null,
    );
    state.questionIndex = Math.min(data.questionIndex ?? 0, total - 1);
    state.score = state.questionResults.filter(r => r?.correct).length;
    state.answered = state.questionResults.filter(r => r !== null).length;
  } catch {
    // ignore corrupt data
  }
}

// --- Data loading ---

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

// --- Navigator ---

function renderNavigator() {
  const test = currentTest();
  el.navGrid.innerHTML = test.questions
    .map((q, i) => {
      const result = state.questionResults[i];
      const isCurrent = i === state.questionIndex;
      let cls = 'nav-btn';
      if (isCurrent) cls += ' current';
      if (result != null) cls += result.correct ? ' correct' : ' wrong';
      return `<button class="${cls}" data-i="${i}" aria-label="問題 ${q.n}">${q.n}</button>`;
    })
    .join('');

  el.navGrid.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => jumpTo(Number(btn.dataset.i)));
  });
}

function jumpTo(index) {
  state.questionIndex = index;
  saveProgress();
  renderQuestion();
  // Close the panel after jumping
  el.navPanel.classList.remove('open');
  el.navToggle.setAttribute('aria-expanded', 'false');
  el.navToggle.textContent = '問題一覧 ▼';
}

// --- Rendering ---

function updateCheckButton() {
  const q = currentTest().questions[state.questionIndex];
  const needed = requiredSelections(q);
  const selectedCount = state.selected.size;

  if (!isMultiSelect(q) || state.locked) {
    el.checkBtn.hidden = true;
    el.checkBtn.disabled = true;
    return;
  }

  el.checkBtn.hidden = false;
  el.checkBtn.disabled = selectedCount !== needed;
  el.checkBtn.textContent = `回答をチェック (${selectedCount}/${needed})`;
}

function buildOptionReview(q, correctAnswers, selectedAnswers) {
  return q.options
    .map((opt, i) => {
      const isCorrect = correctAnswers.has(i);
      const isSelected = selectedAnswers.has(i);
      const status = isCorrect ? '正解選択肢' : isSelected ? '選択した誤答' : '未選択の誤答';
      const note = isCorrect ? q.explain || '正解理由の補足はありません。' : getWhyWrong(q, i);
      return `<li><strong>${labelFor(i)} (${status}):</strong> ${escapeHtml(note)}</li>`;
    })
    .join('');
}

// Shared visual rendering for answered state (used by judge() and question restore)
function renderAnsweredState(q, correctAnswers, selectedAnswers, isCorrect) {
  const optionEls = [...el.options.querySelectorAll('.option')];
  optionEls.forEach((op, i) => {
    op.classList.add('disabled');
    op.classList.remove('selected');
    op.setAttribute('aria-pressed', selectedAnswers.has(i) ? 'true' : 'false');
    if (correctAnswers.has(i)) op.classList.add('correct');
    else if (selectedAnswers.has(i)) op.classList.add('wrong');
    else op.classList.add('muted');
    if (correctAnswers.has(i) && !selectedAnswers.has(i)) op.classList.add('missed');
  });

  const refs = (q.refs || [])
    .map(r =>
      `<li><a href="${encodeURI(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label)}</a></li>`,
    )
    .join('');

  const correctLabel = getAnswers(q).map(i => labelFor(i)).join(', ');
  const selectedLabel = [...selectedAnswers].map(i => labelFor(i)).join(', ');

  el.result.className = `result show ${isCorrect ? 'ok' : 'bad'}`;
  el.result.innerHTML = `
    <h3>${isCorrect ? '✅ 正解' : '❌ 不正解'}（正解: ${correctLabel}）</h3>
    <p>${isMultiSelect(q) ? `あなたの回答: ${selectedLabel}` : `あなたの回答: ${selectedLabel || '未回答'}`}</p>
    <div class="sec-title">正解の理由</div>
    <p>${escapeHtml(q.explain || '正解理由の補足はありません。')}</p>
    <div class="sec-title">選択肢ごとの解説</div>
    <ul>${buildOptionReview(q, correctAnswers, selectedAnswers)}</ul>
    <div class="sec-title">参考ドキュメント</div>
    <ul>${refs || '<li>なし</li>'}</ul>
  `;
}

function renderQuestion() {
  const test = currentTest();
  const q = test.questions[state.questionIndex];
  const multi = isMultiSelect(q);
  const needed = requiredSelections(q);

  state.locked = false;
  state.selected = new Set();
  el.result.className = 'result';
  el.result.innerHTML = '';
  el.nextBtn.disabled = true;
  el.nextBtn.textContent = '次の問題へ';

  el.qnum.textContent = `${test.title} - 問題 ${q.n}`;
  el.counter.textContent = `${state.questionIndex + 1} / ${test.questions.length}`;
  el.progressBar.style.width = `${(state.questionIndex / test.questions.length) * 100}%`;
  el.questionText.textContent = q.question;
  el.questionMeta.textContent = multi
    ? `複数選択問題: ${needed}つ選んでから採点します。`
    : '単一選択問題: 選ぶとその場で採点します。';

  el.options.innerHTML = q.options
    .map(
      (txt, i) =>
        `<button class="option" data-i="${i}" aria-pressed="false" aria-label="${labelFor(i)} ${escapeHtml(txt)}"><span class="label">${labelFor(i)}.</span>${escapeHtml(txt)}</button>`,
    )
    .join('');

  [...el.options.querySelectorAll('.option')].forEach(btn => {
    btn.addEventListener('click', () => selectOption(Number(btn.dataset.i)));
  });

  // Restore answered state if this question was already answered
  const result = state.questionResults[state.questionIndex];
  if (result) {
    const correctAnswers = new Set(getAnswers(q));
    const selectedAnswers = new Set(result.selected);
    state.locked = true;
    state.selected = selectedAnswers;
    renderAnsweredState(q, correctAnswers, selectedAnswers, result.correct);
    el.checkBtn.hidden = true;
    el.checkBtn.disabled = true;
    el.nextBtn.disabled = false;
    el.nextBtn.textContent =
      state.questionIndex === test.questions.length - 1 ? '結果を見る' : '次の問題へ';
  } else {
    updateCheckButton();
  }

  renderNavigator();
}

function selectOption(index) {
  if (state.locked) return;

  const q = currentTest().questions[state.questionIndex];
  const optionEls = [...el.options.querySelectorAll('.option')];

  if (!isMultiSelect(q)) {
    state.selected = new Set([index]);
    optionEls.forEach((op, i) => {
      op.classList.toggle('selected', i === index);
      op.setAttribute('aria-pressed', i === index ? 'true' : 'false');
    });
    judge();
    return;
  }

  if (state.selected.has(index)) state.selected.delete(index);
  else if (state.selected.size < requiredSelections(q)) state.selected.add(index);
  else {
    const first = [...state.selected][0];
    state.selected.delete(first);
    state.selected.add(index);
  }

  optionEls.forEach((op, i) => {
    const active = state.selected.has(i);
    op.classList.toggle('selected', active);
    op.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  updateCheckButton();
}

function judge() {
  if (state.locked) return;

  const test = currentTest();
  const q = test.questions[state.questionIndex];
  const correctAnswers = new Set(getAnswers(q));
  const selectedAnswers = new Set(state.selected);

  if (selectedAnswers.size === 0) return;
  if (isMultiSelect(q) && selectedAnswers.size !== correctAnswers.size) return;

  state.locked = true;
  state.answered += 1;

  const isCorrect = setsMatch(selectedAnswers, correctAnswers);
  if (isCorrect) state.score += 1;

  // Record and persist result
  state.questionResults[state.questionIndex] = {
    correct: isCorrect,
    selected: [...selectedAnswers],
  };
  saveProgress();

  renderAnsweredState(q, correctAnswers, selectedAnswers, isCorrect);

  el.scoreChip.textContent = `Score ${state.score} / ${state.answered}`;
  el.checkBtn.hidden = true;
  el.checkBtn.disabled = true;
  el.nextBtn.disabled = false;
  el.nextBtn.textContent =
    state.questionIndex === test.questions.length - 1 ? '結果を見る' : '次の問題へ';

  renderNavigator();
}

function finish() {
  const test = currentTest();
  const total = test.questions.length;
  const percent = Math.round((state.score / total) * 100);

  el.progressBar.style.width = '100%';
  el.qnum.textContent = `${test.title} - 結果`;
  el.counter.textContent = `${total} / ${total}`;
  el.questionText.innerHTML = `終了！ <strong>${state.score}/${total}</strong> 正解（${percent}%）`;
  el.questionMeta.textContent = '別の Practice Test に切り替えて続けて練習できます。';
  el.options.innerHTML = '';
  el.result.className = 'result show';
  el.result.innerHTML = '<h3>おつかれさまでした！</h3><p>別のPractice Testに切り替えて続けて練習できます。</p>';
  el.checkBtn.hidden = true;
  el.checkBtn.disabled = true;
  el.nextBtn.disabled = true;
}

function next() {
  const total = currentTest().questions.length;
  if (state.questionIndex < total - 1) {
    state.questionIndex += 1;
    saveProgress();
    renderQuestion();
    return;
  }
  finish();
}

function resetCurrentTest() {
  localStorage.removeItem(storageKey());
  state.questionIndex = 0;
  state.score = 0;
  state.answered = 0;
  state.locked = false;
  state.selected = new Set();
  state.questionResults = new Array(currentTest().questions.length).fill(null);
  el.scoreChip.textContent = 'Score 0 / 0';
  renderQuestion();
}

function switchTest(i) {
  state.testIndex = i;
  state.questionIndex = 0;
  state.score = 0;
  state.answered = 0;
  state.locked = false;
  state.selected = new Set();
  state.questionResults = new Array(currentTest().questions.length).fill(null);
  loadProgress(); // Restore saved progress for this test
  el.scoreChip.textContent = `Score ${state.score} / ${state.answered}`;
  renderQuestion();
}

function bindEvents() {
  el.testSelect.addEventListener('change', e => switchTest(Number(e.target.value)));
  el.checkBtn.addEventListener('click', judge);
  el.nextBtn.addEventListener('click', next);
  el.restartBtn.addEventListener('click', resetCurrentTest);
  el.navToggle.addEventListener('click', () => {
    const open = el.navPanel.classList.toggle('open');
    el.navToggle.setAttribute('aria-expanded', String(open));
    el.navToggle.textContent = open ? '問題一覧 ▲' : '問題一覧 ▼';
  });
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
