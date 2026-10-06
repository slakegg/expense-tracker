# Expense Tracker

Дашборд учёта личных финансов: Google-авторизация, Supabase, БЭМ + модульный SCSS (`@use`).

## Запуск
1. `npm install` и `npm run sass` — сборка `src/scss/main.scss` → `css/style.css` (`npm run sass:watch` — автосборка).
2. Supabase: создайте проект, выполните `supabase/schema.sql` в SQL Editor.
3. Authentication → Providers → Google: включите, вставьте Client ID/Secret из Google Cloud Console
   (Authorized redirect URI — `https://<project>.supabase.co/auth/v1/callback`).
4. Authentication → URL Configuration: добавьте адрес сайта (например `http://127.0.0.1:5500/`) в Redirect URLs.
5. В `js/app.js` впишите `SUPABASE_URL` и `SUPABASE_ANON_KEY`.
6. Откройте `index.html` через Live Server в VS Code (по `file://` OAuth не работает).
