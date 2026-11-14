# LinguaAI 2.3

Learn a language by talking. LinguaAI gives you one AI tutor and two ways to practise with it:

- **AI Chat** – write to your tutor; every message gets a reply and level-appropriate feedback.
- **Live Speaking** – your tutor asks out loud, you answer through the microphone, it reviews
  what you said and answers by voice.

Both run on the same conversations, language and level. Saved words become spaced-repetition
flashcards, and progress is tracked. Built with React 19, TypeScript, Vite and SCSS.

## Start

Requirements: Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. **There is nothing to configure: no API key, no account, no
`.env` file.**

| Command                 | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run dev`           | Development server with hot reload                       |
| `npm run typecheck`     | TypeScript check                                         |
| `npm run build`         | Production build into `dist/`                            |
| `npm run build:checked` | Type check, then production build                        |
| `npm run preview`       | Serve the production build locally                       |
| `npm start`             | Serve `dist/` with the optional Node server (port 8787)  |

## Where the AI comes from

LinguaAI uses the same free services as the first version of the project. They need **no
account and no API key**, so there is nothing to set up, nothing to maintain and nothing that
could ever be billed:

1. **[OVHcloud AI Endpoints](https://endpoints.ai.cloud.ovh.net)** – open models (Mistral
   Small, Llama, Qwen, gpt-oss). Anonymous use allows 2 requests per minute *per model*, so
   LinguaAI rotates through several models.
2. **[LLM7.io](https://llm7.io)** – second service, anonymous with a daily allowance per IP
   address, used when the first is busy.

They are called straight from the visitor's browser (`src/services/freeAi.ts`). That has two
consequences worth knowing:

- **Every visitor has their own free allowance** (it is counted per IP address). One visitor
  cannot use it up for the others, and there is no key anyone could steal or run up costs on.
- **The limits are low.** A conversation at normal pace fits; rapid-fire messages get the
  notice "The tutor needs a short break" with the number of seconds to wait. The reply and
  the feedback on your message come from a single request to save allowance, and translations
  go to MyMemory first for the same reason.

What LinguaAI never does: show scripted, simulated or pre-written "AI" answers. If no AI can
answer, the conversation says so and your message waits for "Try again".

These are free community/preview offers without any guarantee. The model names in
`src/services/freeAi.ts` are the ones available in autumn 2026; if a service retires a model,
LinguaAI skips it automatically and uses the others, but if a service changes its rules the
list in that one file is what needs editing.

### Optional: Google Gemini as first choice

Not needed. If the person running LinguaAI has a Gemini API key (free tier; Google requires
the account owner to meet its age requirement), they can copy `.env.example` to `.env` and set
`GEMINI_API_KEY`. Then:

- the small Node backend in `server/` (started automatically by `npm run dev`, or with
  `npm start`) calls Gemini; the key never reaches the browser;
- only free-tier model families (Flash, Flash-Lite, Gemma) are accepted, the server keeps
  per-visitor and site-wide daily budgets below the free quota, and only answers requests
  from the app's own pages;
- when Gemini's quota is used up or Gemini is down, the free keyless services above answer
  instead, automatically.

Keep billing switched off for the Google project behind the key: without billing, Google
cannot charge anything.

## Lingua Translate

The translator from the first LinguaAI, in the new design. Open it from the sidebar (desktop)
or the translate icon in the top bar (phone).

- **Desktop:** a floating window over the app. Drag it by its title bar (or focus the grip and
  use the arrow keys), minimise it to a small bubble, and keep chatting; its text, languages
  and position are kept while you move between pages.
- **Phone and tablet (below 900 px):** a full-screen translator with a back button.
- All 18 LinguaAI languages in both directions, plus **Detect language**, swap, listen, copy
  and a 3,000-character limit.
- Translations come from MyMemory. "Detect language" recognises ordinary sentences offline
  (script and common words, `src/lib/langGuess.ts`); only very short or unclear texts use one
  AI request to detect and translate together.

Code: `src/components/LinguaTranslate.tsx`, `src/state/translator.tsx`,
`src/styles/_translator.scss`.

## Explanations are in your own language

The conversation is in the language you are learning; **every explanation, piece of praise and
hint is in the language you chose as your own** (Profile → My language). This is enforced in
three places:

1. the tutor prompt states it as the overriding rule (`shared/prompts.mjs`);
2. the same rule is repeated right after your message, where small models follow it best;
3. a safety net (`inNativeLanguage` in `src/services/tutor.ts`): if an explanation still
   arrives in the learning language, or comes from LanguageTool (which always answers in the
   language of the checked text), it is translated into your language before it is shown.

## Phones

Checked at 320, 360, 390, 430 and 768 px wide: no horizontal scrolling on any screen, controls
at least 40–44 px high on touch devices, 16 px text fields (so iPhone Safari does not zoom
in), bottom tab bar navigation, the conversation history as a slide-in drawer, and Lingua
Translate full-screen. Touch sizes live in `src/styles/_touch.scss`.

## Live Speaking and browser limits

Everything is browser-native and free.

| Step | Technology | Notes |
| ---- | ---------- | ----- |
| Tutor speaks | `SpeechSynthesis` | Needs a voice for the language installed on the device |
| You speak | `SpeechRecognition` | Chrome, Edge, Safari. Not Firefox. The browser sends the audio to its vendor's speech service, so it needs a connection |
| Feedback | the AI tutor | Works on the recognised **text** |
| Level meter | Web Audio | Desktop only; on phones the animation shows whose turn it is |

- **iPhone and iPad:** use Safari with Dictation enabled (Settings → General → Keyboard). Safari
  only opens the microphone and starts audio after a tap, so LinguaAI switches to
  push-to-talk there: tap the microphone for each answer, tap again when finished. Hands-free
  mode is desktop only. If Safari does not play a reply by itself, LinguaAI says so and
  "Repeat" plays it.
- **Pronunciation is not assessed.** Feedback covers grammar and word choice of what the
  recogniser understood; no score is shown.
- Latin has no speech recognition in any browser; Live Speaking says so and offers Chat.
- On a real domain the microphone requires HTTPS (`localhost` is fine).

## Deploying publicly

Because the AI needs no key and no backend, the built app is a plain static site:

```bash
npm run build      # creates dist/
```

Upload `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages …). Asset paths are
relative, so it also works from a sub-folder such as `https://name.github.io/LinguaAI/`. No
environment variables, no server, no costs. The one-time manual step is creating the hosting
account and uploading the folder.

Only if you want the optional Gemini backend do you need a Node host (`npm start`) with
`GEMINI_API_KEY` set there; `api/*.mjs` are untested starting points for serverless hosts.

## Flags and branding

No emoji flags anywhere (Windows renders them as letters such as "HR"): every flag is an SVG
file in `src/assets/flags/`, shown through one `<Flag>` component; the fallback is a neutral
globe, never a country code. English uses the United Kingdom flag, Portuguese Portugal, Chinese
China, Latin Vatican City, Arabic a letter badge.

The logo, favicon, gradient palette and typeface are the original LinguaAI identity
(`src/components/Logo.tsx`, `public/favicon.svg`, `src/styles/_tokens.scss`).

## Project structure

```
shared/prompts.mjs         tutor and feedback prompts per CEFR level (used by browser and server)
src/
  services/freeAi.ts       the keyless AI services: rotation, limits, error messages
  services/freeTutor.ts    tutor tasks on those services
  services/tutor.ts        one entry point: replies, feedback, translation, fallbacks
  services/ai.ts           client for the optional /api backend
  services/speech.ts, recognition.ts, microphone.ts
  lib/useConversation.ts   the one conversation engine behind Chat and Live Speaking
  state/                   app data (localStorage) and tutor status
  components/, pages/, data/, assets/flags/, styles/
server/                    optional Gemini backend (plain Node, no dependencies)
api/                       optional serverless wrappers (untested)
```

## Credits

- [OVHcloud AI Endpoints](https://endpoints.ai.cloud.ovh.net) and [LLM7.io](https://llm7.io) – the AI tutor
- [Google Gemini API](https://ai.google.dev) – optional
- Web Speech API – speech recognition and voices, provided by the browser
- [LanguageTool](https://languagetool.org) and [MyMemory](https://mymemory.translated.net) – checks and translations
- [Lucide](https://lucide.dev) icons via `react-icons` (ISC)
- Plus Jakarta Sans and Literata via Google Fonts (SIL OFL)

The same list is shown in the app under Settings → Services and credits, and every tutor
message shows which model wrote it.
