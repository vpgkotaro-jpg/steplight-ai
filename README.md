# StepLight

Live demo: https://vpgkotaro-jpg.github.io/steplight-ai/

Turn an overwhelming task list into one clear next step.

## Run it

No build step and no dependencies.

```
cd steplight
python3 -m http.server 8000     # then open http://localhost:8000
```

You can also open `index.html` directly, but the service worker (offline cache) only works over `http://localhost` or `https`.

## Test it

```
cd steplight
node --test test/core.test.js
```

The tests cover the pure logic in `steplight-core.js`: parsing a pasted list, the suggested order, the starter steps, the "Too big" steps, and the strict check of the on-device AI reply.

## How to use

1. Dump: paste your tasks in any format (bullets, numbers, `[ ]` boxes, semicolons, "then"). Press "Make my list".
2. Pick: the suggested order is urgent first, then tasks with a day, then your own order. Press "Start" on any task.
3. Focus: one task and its first physical step. Done (D), Too big (S), Pause (P). Pause saves a note for next time.
4. "Ask on-device AI" (Chrome only, when available): asks the browser's built-in model for 3 to 5 first steps. The reply must be one JSON array of 3 to 5 strings, each 12 words or fewer. Anything else is rejected, the reason is shown, and the built-in step stays on screen.

## Files

- `index.html`: the screens and the strict Content-Security-Policy (no network requests from the page)
- `app.js`: screens, saving to `localStorage`, the AI button, keyboard keys
- `steplight-core.js`: parsing, order, steps, and the AI reply check (no DOM)
- `sw.js`, `manifest.webmanifest`: cache the app files after the first visit
- `test/core.test.js`: unit tests

## Limits

- The parser is rule based and tuned for English. It understands only simple day words such as "fri" or "tomorrow".
- The fixed starter table covers about eight task types. Other tasks get a generic first step.
- The on-device AI needs a recent Chrome with the built-in model installed. Other browsers use the built-in step.
- Data stays in this browser. There is no sync and no account.

## Privacy

The app makes no network requests of its own (CSP `connect-src 'none'`). Nothing is sent to a server.

## Built with AI assistance

This app was written with Claude Code (Anthropic) as the coding assistant, and reviewed and tested by the author. The product itself uses Chrome's built-in on-device model (Prompt API) when available.

## License

MIT
