// ===== Настройки: вставьте свои значения из Supabase → Project Settings → API =====
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
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

// ---------- Авторизация ----------
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
  $('.js-welcome').classList.toggle('is-hidden', loggedIn);
  $('.js-app').classList.toggle('is-hidden', !loggedIn);
  if (channel) { db.removeChannel(channel); channel = null; }

  if (!loggedIn) { transactions = []; render(); return; }
  const meta = user.user_metadata || {};
  $('.js-greeting').textContent = `Привет, ${meta.full_name || meta.name || user.email}!`;
  $('.js-avatar').src = meta.avatar_url || meta.picture || '';
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
    title: f.get('title').trim(),
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
      el('span', 'transaction-item__title', t.title),
      el('span', `badge category--${cat}`, CATEGORIES[cat].label),
      el('span', 'transaction-item__date', new Date(t.created_at).toLocaleDateString('ru-RU')),
      el('span', `transaction-item__amount transaction-item__amount--${t.type}`,
        (t.type === 'income' ? '+' : '−') + money.format(Number(t.amount))),
      del
    );
    return item;
  }));
}

fillCategories();
