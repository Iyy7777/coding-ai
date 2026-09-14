# Codey — AI coding assistant with accounts, saved chats, and a live preview

A full-stack app: a Gemini-style landing screen, a chat sidebar (~1/4 width)
next to a live preview pane (~3/4 width), now with:

- **Login / Sign up** screens, backed by **Supabase Auth**
- **Sign-up gate**: must tick "I agree to the Terms & Conditions and Privacy
  Policy" (with a full T&Cs/Privacy modal) and "I am not a robot" before the
  Sign up button enables
- **Multiple saved chats per account** — a "+ New chat" button and a "Your
  chats" list to switch between past conversations, stored in Supabase
- The same Ollama-powered coding assistant + live preview as before

No Node.js/npm anywhere — the backend is Python (Flask), and Supabase's
browser SDK is loaded from a CDN `<script>` tag (not installed via npm).

## Architecture

```
Browser (login, chat list, chat UI)
   │
   ├── Supabase (direct from browser, via the public "anon" key)
   │     • Auth: sign up / log in / sessions
   │     • Database: chats + messages tables (Row Level Security scoped per user)
   │
   └── /api/chat (your Flask server, server.py)
         • Checks the caller's Supabase login token
         • Forwards the conversation to your local Ollama server
```

Supabase's `anon` key is a **public** key by design (it's meant to be shipped
to the browser) — real security comes from Row Level Security (RLS) policies
in `supabase/schema.sql`, which make sure each account can only read/write
its own chats and messages. Never put your Supabase **service_role** key
anywhere in this project — that one is secret.

## One-time setup

### 1. Create a Supabase project
Go to https://supabase.com, create a free project, and open
**Project Settings > API**. You'll need:
- **Project URL** (e.g. `https://abcd1234.supabase.co`)
- **anon / public** API key

### 2. Create the database tables
In the Supabase dashboard, open **SQL Editor > New query**, paste the
contents of `supabase/schema.sql`, and click **Run**. This creates the
`chats` and `messages` tables with Row Level Security so users can only see
their own data.

### 3. (Recommended for quick testing) Turn off email confirmation
By default Supabase emails a confirmation link before a new account can log
in. For local testing, go to **Authentication > Providers > Email** and
toggle **Confirm email** off. (Leave it on for anything beyond your own
testing — you want real email addresses verified.)

### 4. Fill in your config
Edit `public/config.js`:
```js
window.SUPABASE_CONFIG = {
  url: 'https://abcd1234.supabase.co',
  anonKey: 'your-anon-public-key',
};
```

Copy `.env.example` to `.env` and fill in the **same** URL/anon key (used by
the server to verify logins), plus your Ollama model:
```powershell
copy .env.example .env
```
```
SUPABASE_URL=https://abcd1234.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
OLLAMA_MODEL=qwen2.5-coder:7b
```

### 5. Install Python dependencies
```powershell
pip install -r requirements.txt
```

### 6. Make sure Ollama has a model pulled
```powershell
ollama pull qwen2.5-coder:7b
```

### 7. Run it
```powershell
python server.py
```
Open **http://localhost:3000** — you should land on the login/sign-up screen.

## Using the app

- **Sign up**: enter an email + password, tick the Terms & Conditions
  checkbox (click the link to read the full text) and the "I am not a robot"
  checkbox, then Sign up. If email confirmation is on, check your inbox and
  then log in.
- **New chat**: click the **+** button in the sidebar to start a fresh
  conversation (takes you back to the landing screen to type your first
  message).
- **Your chats**: click the **≡** button to open the list of your saved
  chats and switch between them. Each is saved to your account in Supabase.
- **Sign out**: at the bottom of the "Your chats" panel.

## Downloading your build

In the preview toolbar, the download icon saves what Codey just built:
- **Single file** → downloads that file directly (e.g. `index.html`).
- **Multiple files** → downloads a `codey-project.zip` containing all of them,
  built entirely in the browser (no server round-trip, no external library).

## Choosing a model

The "Model" dropdown at the top of the sidebar lets you pick which Ollama
model handles each request — smaller models (like `qwen2.5-coder:1.5b`)
respond much faster but write less capable code; larger ones are slower but
better. Pick "Custom…" to type any model tag you've pulled yourself. Your
choice is remembered in the browser for next time.

**You still need to `ollama pull <model>` before selecting it** — if you
pick a model you haven't pulled, Codey will tell you which command to run.

## Multi-file projects

Codey isn't limited to one file. For anything that naturally needs several
(an `index.html` + `style.css` + `script.js` app, or a few Python modules),
it labels each fenced code block with a filename like:

````
```html:index.html
...
```
```css:style.css
...
```
```javascript:script.js
...
```
````

The Code tab shows a row of file tabs so you can click between them, and the
Preview automatically wires the HTML/CSS/JS files together (multiple `<style>`
sources get combined, each JS file becomes its own `<script>` tag, in order).
Simple one-off demos still work as a single plain ` ```html ` block, same as
before.

## About the "I am not a robot" checkbox

This is a simple checkbox gate, as requested — it is **not** a real bot
detection service (no CAPTCHA API is called). If you want actual bot
protection, Supabase Auth has built-in support for hCaptcha and Cloudflare
Turnstile you can enable in **Authentication > Settings**; that's a bigger
change (needs a site key and a bit more JS) — ask if you'd like that added.

## About the Terms & Conditions / Privacy Policy

The text in the modal is a **general template** for a student/demo project —
**it is not legal advice**. It has placeholders like `[Your Country/State]`
and `[contact email]` that you should fill in, and you should have someone
qualified review it before using this with real users beyond your own
testing.

## Project structure

```
codey-app/
├── server.py             Flask server: /api/chat proxy to Ollama + Supabase token check
├── requirements.txt       flask, requests, python-dotenv
├── .env.example           Ollama + Supabase settings template
├── .gitignore
├── supabase/
│   └── schema.sql         Run once in Supabase's SQL Editor
└── public/
    ├── index.html         Auth screen, terms modal, landing, chat+preview layout
    ├── style.css
    ├── config.js           Your Supabase URL + anon key (public by design)
    ├── supabaseClient.js   Creates the shared Supabase client
    ├── auth.js             Login / sign-up / sign-out / terms modal logic
    └── app.js              Chat list, new chat, sending messages, live preview
```

## Troubleshooting

- **Stuck on the login screen after signing up** — you probably still have
  "Confirm email" turned on in Supabase; check your inbox for a confirmation
  link, or turn it off for local testing (step 3 above).
- **"Not authenticated. Please log in and try again."** from the assistant —
  your session may have expired; refresh the page and log in again.
- **"Couldn't reach Ollama..."** — make sure Ollama is running and
  `OLLAMA_MODEL` in `.env` matches a model you've pulled.
- **Chats not saving / list stays empty** — double check you ran
  `supabase/schema.sql` and that `public/config.js` and `.env` both have your
  real Supabase URL and anon key (not the placeholder text).
- **`pip`/`python` not recognized on Windows** — try `py -m pip install -r requirements.txt`
  and `py server.py`.

## Notes

- The live preview `<iframe>` is sandboxed (no `allow-same-origin`), so
  generated code can't reach cookies/storage from your real site.
- This is a demo/learning project — before using it with real users, review
  the legal template text, consider enabling real bot protection, and put
  the Flask server behind proper hosting (not the built-in dev server) if
  you deploy it beyond your own machine.
