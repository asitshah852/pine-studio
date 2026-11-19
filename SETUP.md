# Putting pine studio online (about 15 minutes, once)

Same steps as the other studio. A key is a password for an app: never paste one into chat,
email or GitHub — only into Vercel's settings.

1. **Vercel → Add New → Project** → pick the `pine-studio` GitHub repo → **Deploy**.
   It works straight away (Library, Classes, Exhibits, slides, PowerPoint).
2. **Claude key** (switches on Research, Textbook and Checker):
   console.anthropic.com → API keys → Create key → copy.
   Vercel → the project → **Settings → Environment Variables** → `ANTHROPIC_API_KEY` = the key.
3. **Saving across devices:** Vercel → the project → **Storage → Create → Upstash (Redis)** →
   connect to the project (it adds the two `KV_…` settings itself).
4. **Passcode:** add `APP_PASSCODE` = any phrase. Give it to Tanya; the site asks once per device.
5. **YouTube exhibits:** add `YOUTUBE_API_KEY` (copy it from the Silent Sheep project: pp-studio-pyzt → Settings → Environment Variables). The Library of Congress needs no key.
6. **Optional email of feedback notes:** `RESEND_API_KEY` and `FEEDBACK_EMAIL_TO`.
7. **Deployments → ⋯ → Redeploy** so the new settings take effect.

**Check it worked:** the top-right dot reads **research on**, and the Prep page footer says
"shared across your devices".

Costs: Claude is billed per use — a research run or a deck check is typically a few cents
to a few tens of cents (web searches included). Museum APIs, Upstash free tier and Vercel
hobby are free.
