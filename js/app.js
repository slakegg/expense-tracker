import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CURRENCY = 'KZT'; // RUB, USD, EUR ...

const CATEGORIES = {
  food: { label: 'Продукты', types: ['expense'] },
  transport: { label: 'Транспорт', types: ['expense'] },
  entertainment: { label: 'Развлечения', types: ['expense'] },
  bills: { label: 'Коммуналка', types: ['expense'] },
  health: { label: 'Здоровье', types: ['expense'] },
  salary: { label: 'Зарплата', types: ['income'] },
  other: { label: 'Другое', types: ['expense', 'income'] }
};

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (sel) => document.querySelector(sel);
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 });

let user = null;
let transactions = [];
let channel = null;

// ---------- Авторизация через Google ----------
$('.js-login').addEventListener('click', () =>
  db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  })
);
$('.js-logout').addEventListener('click', () => db.auth.signOut());

db.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));

async function setUser(newUser) {
  if (newUser?.id === user?.id) return;
  user = newUser;
  const loggedIn = Boolean(user);
  $('.js-login').classList.toggle('is-hidden', loggedIn);
  $('.js-logout').classList.toggle('is-hidden', !loggedIn);
  $('.js-user').classList.toggle('is-hidden', !loggedIn);
  $('.js-auth').classList.toggle('is-hidden', loggedIn);
  $('.js-app').classList.toggle('is-hidden', !loggedIn);
  if (channel) { db.removeChannel(channel); channel = null; }

  if (!loggedIn) { transactions = []; render(); return; }
  const meta = user.user_metadata || {};
  $('.js-greeting').textContent = `Привет, ${meta.full_name || meta.name || user.email}!`;
  const avatar = meta.avatar_url || meta.picture || '';
  $('.js-avatar').src = avatar;
  $('.js-avatar').classList.toggle('is-hidden', !avatar);
  await loadTransactions();
  subscribe();
}

// ---------- Данные ----------
async function loadTransactions() {
  const { data, error } = await db.from('transactions').select('*')
    .eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return showError(error.message);
  transactions = data;
  render();
}

// Realtime: изменения из других вкладок/устройств
function subscribe() {
  channel = db.channel('transactions-' + user.id)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` },
      (payload) => {
        if (payload.eventType === 'INSERT' && !transactions.some((t) => t.id === payload.new.id)) {
          transactions.unshift(payload.new);
        } else if (payload.eventType === 'DELETE') {
          transactions = transactions.filter((t) => t.id !== payload.old.id);
        }
        render();
      })
    .subscribe();
}

$('.js-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const form = e.currentTarget;
  const f = new FormData(form);
  const { data, error } = await db.from('transactions').insert({
    user_id: user.id,
    title: CATEGORIES[f.get('category')].label,
    amount: Number(f.get('amount')),
    type: f.get('type'),
    category: f.get('category')
  }).select().single();
  if (error) return showError(error.message);
  if (!transactions.some((t) => t.id === data.id)) transactions.unshift(data);
  form.reset();
  fillCategories();
  render(); // мгновенное обновление баланса и списка
});

async function removeTransaction(id) {
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) return showError(error.message);
  transactions = transactions.filter((t) => t.id !== id);
  render();
}

// ---------- Отрисовка ----------
function showError(msg) { $('.js-error').textContent = msg; }

function fillCategories() {
  const type = $('.js-type').value;
  const select = $('.js-category');
  select.replaceChildren(...Object.entries(CATEGORIES)
    .filter(([, c]) => c.types.includes(type))
    .map(([key, c]) => new Option(c.label, key)));
}
$('.js-type').addEventListener('change', fillCategories);

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const sum = (type) => transactions.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
  const income = sum('income');
  const expense = sum('expense');
  $('.js-income').textContent = money.format(income);
  $('.js-expense').textContent = money.format(expense);
  $('.js-balance').textContent = money.format(income - expense);
  renderChart();

  const list = $('.js-list');
  if (!transactions.length) {
    list.replaceChildren(el('p', 'welcome', 'Пока нет транзакций. Добавьте первую в форме выше.'));
    return;
  }
  list.replaceChildren(...transactions.map((t) => {
    const cat = CATEGORIES[t.category] ? t.category : 'other';
    const item = el('div', 'transaction-item');
    const del = el('button', 'transaction-item__delete', '✕');
    del.type = 'button';
    del.title = 'Удалить';
    del.addEventListener('click', () => removeTransaction(t.id));
    item.append(
      el('span', `badge category--${cat}`, CATEGORIES[cat].label),
      el('span', 'transaction-item__date', new Date(t.created_at).toLocaleDateString('ru-RU')),
      el('span', `transaction-item__amount transaction-item__amount--${t.type}`,
        (t.type === 'income' ? '+' : '−') + money.format(Number(t.amount))),
      del
    );
    return item;
  }));
}

// ---------- Диаграмма расходов ----------
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgCircle(className, dash, offset) {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('class', className);
  c.setAttribute('cx', '21'); c.setAttribute('cy', '21'); c.setAttribute('r', '15.915');
  if (dash !== undefined) {
    c.setAttribute('stroke-dasharray', `${dash} ${100 - dash}`);
    c.setAttribute('stroke-dashoffset', offset);
  }
  return c;
}

function renderChart() {
  const totals = {};
  transactions.filter((t) => t.type === 'expense').forEach((t) => {
    const cat = CATEGORIES[t.category] ? t.category : 'other';
    totals[cat] = (totals[cat] || 0) + Number(t.amount);
  });
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const svg = $('.js-donut');
  const legend = $('.js-legend');
  svg.replaceChildren(svgCircle('chart__track'));

  if (!total) {
    legend.replaceChildren(el('li', 'chart__empty', 'Расходов пока нет'));
    return;
  }
  let shown = 0;
  const items = rows.map(([cat, sum]) => {
    const pct = (sum / total) * 100;
    svg.append(svgCircle(`chart__segment chart__segment--${cat}`, pct, 25 - shown));
    shown += pct;
    const li = el('li', 'chart__item');
    li.append(
      el('span', `chart__dot category-dot--${cat}`),
      el('span', 'chart__name', CATEGORIES[cat].label),
      el('span', 'chart__sum', money.format(sum)),
      el('span', 'chart__percent', Math.round(pct) + '%')
    );
    return li;
  });
  legend.replaceChildren(...items);
}

// ---------- Вход / регистрация / восстановление ----------
const authForm = $('.js-auth-form');
const authTitles = { login: 'Войти', signup: 'Зарегистрироваться', reset: 'Сменить пароль и войти' };
let authMode = 'login';

function authMessage(text, ok = false) {
  const box = $('.js-auth-message');
  box.textContent = text;
  box.classList.toggle('auth__message--ok', ok);
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.js-tab').forEach((tab) =>
    tab.classList.toggle('auth__tab--active', tab.dataset.mode === mode));
  const phrase = $('.js-phrase');
  phrase.classList.toggle('is-hidden', mode === 'login');
  phrase.required = mode !== 'login';
  phrase.placeholder = mode === 'signup'
    ? 'Секретная фраза (для восстановления пароля)' : 'Секретная фраза';
  authForm.password.placeholder = mode === 'reset' ? 'Новый пароль' : 'Пароль';
  $('.js-forgot').classList.toggle('is-hidden', mode !== 'login');
  $('.js-auth-submit').textContent = authTitles[mode];
  authMessage('');
}

document.querySelectorAll('.js-tab').forEach((tab) =>
  tab.addEventListener('click', () => setAuthMode(tab.dataset.mode)));
$('.js-forgot').addEventListener('click', () => setAuthMode('reset'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authForm.email.value.trim();
  const password = authForm.password.value;
  const phrase = authForm.phrase.value.trim();
  authMessage('Подождите…', true);
  let error;

  if (authMode === 'login') {
    ({ error } = await db.auth.signInWithPassword({ email, password }));
  } else if (authMode === 'signup') {
    const res = await db.auth.signUp({
      email, password,
      options: {
        data: { secret_phrase: phrase },
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    error = res.error;
    if (!error && !res.data.session) {
      return authMessage('Мы отправили письмо: подтвердите почту и войдите.', true);
    }
  } else {
    const res = await db.functions.invoke('reset-password', { body: { email, phrase, password } });
    error = res.error || (res.data?.error ? { message: res.data.error } : null);
    if (!error) ({ error } = await db.auth.signInWithPassword({ email, password }));
  }

  if (error) return authMessage(error.message);
  authForm.reset();
  authMessage('');
});

setAuthMode('login');
fillCategories();