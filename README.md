# Banacraft - Palatető árbecslő (bontás, elszállítás, új tető)

A Hungarian chat widget for the Banacraft palatető site. The visitor answers a
short set of questions (clicking buttons **or** typing), leaves their details in
one form, and immediately sees an **itemised starting price** ("alapár … Ft-tól")
with the exclusions named. Banacraft gets the lead and the whole conversation by
e-mail, and conversations that stop halfway are e-mailed too.

One of three separate bots (`banacraft-kiurites-agent`, `banacraft-bontas-agent`,
`banacraft-palateto-agent`). They share the same engine; only `lib/flow.js`, the
`BOT` block at the top of `public/widget.js`, the colour variables at the top of
`public/style.css` and the logos differ.

## How it works

```
public/widget.js ──POST──► api/faq-agent.js (shared engine)
                               ├── lib/flow.js   questions, buttons, price model, company facts
                               ├── OpenAI/Gemini only for TYPED messages the engine can't map
                               ├── Resend        e-mail to Banacraft
                               └── Zoho Flow     CRM webhook (optional)
```

- **The backend owns the conversation.** It picks the next question, words it,
  shows its buttons and maps the click. A click never costs a model call.
- **The AI is only for typed messages** - a question of the visitor's own ("magam
  is leszedhetem?"), or an answer in their own words. It never tells anyone to
  handle asbestos themselves.
- **No AI key? Still works.** Every button path works; a typed message the engine
  can't read gets "please pick a button, or call us".

## The questions

1. **Mit szeretne?** Pala bontása és elszállítása · Csak elszállítás (a pala már
   le van szedve) · Bontás + elszállítás + **új tetőfedés**
2. Épület típusa
3. **Mi van a tetőn** (több is, mert gyakran több réteg van): hullámpala · síkpala ·
   bitumenes lemez
4. Tetőforma → **alapterület** - the roof area is never asked; it is calculated:
   **sátortető × 1,2, nyeregtető × 1,35** (félnyereg × 1,1, összetett × 1,45)
5. Magasság (állvány) → körbejárhatóság → tetőszerkezet állapota
6. Új tetőnél: új fedés anyaga → kiegészítők (eresz, bádog, tetőablak, kémény)
7. **Szeretne hőszigetelést?** (padlásfödém / tetőtér / tanácsot kér)
8. Kezdés: Amint lehet / 30 / 60 / 90 napon belül

**Csak elszállítás:** anyag → mennyi pala (**50–100 / 100–300 / 300+ m²**) → hogyan
van tárolva → megközelítés → kezdés.

The build year is not asked: every pala is treated as asbestos-cement. Price tiers
follow the roof-surface bands 100 m² alatt / 100–300 / 300 felett.

Then one form: név, telefon, település, e-mail (optional), **magánszemély / cég /
intézmény / társasház**, preferred survey time (optional). A typed start later
than 90 days is politely refused.

## Pricing

- **A floor, never a range.** Band answers are priced at their lower edge, "Nem
  tudom" at a modest default, and the assumption is printed ("135 m² tetőfelület:
  100 m² × 1,35"). The roof structure is **always** named as an exclusion - its
  real condition only shows once the pala is off.
- **VAT:** magánszemély and társasház see gross, cég and intézmény see net + ÁFA.
- **All rates live in `P` at the top of `lib/flow.js`.** They are
  market-calibrated starting points, **not Banacraft's own price list** - replace
  them with Banacraft's numbers as soon as they're known. `npm test` prints sample
  quotes, so a bad edit shows immediately.

## Run, test, deploy

```bash
npm install
npm start          # http://localhost:8895
npm test           # clicks through hundreds of random conversations + sample quotes
```

Locally, copy `.env.example` to `.env.local`. Without `RESEND_API_KEY` no e-mail
goes out; without an AI key typed messages fall back to the buttons.

## Deploy on Vercel

1. Vercel → **Add New… → Project** → import
   `Pirintvisuals/banacraft-palateto-agent-agent`.
2. **Framework Preset:** Other. Leave Root Directory, Build Command and Output
   Directory empty - there is no build; Vercel serves `public/` and turns
   `api/faq-agent.js` into the function.
3. **Environment Variables** (before the first deploy):

   | Name | Value |
   |---|---|
   | `AI_PROVIDER` | `gemini` or `openai` |
   | `GEMINI_API_KEY` or `OPENAI_API_KEY` | the key for that provider |
   | `RESEND_API_KEY` | Resend key |
   | `LEAD_EMAIL_TO` | `info@banacraft.hu` |
   | `LEAD_EMAIL_FROM` | a sender on a **verified** Resend domain, e.g. `Banacraft <ajanlat@send.traumbad.hu>` |
   | `ZOHO_FLOW_WEBHOOK_URL` | optional |
   | `OWNER_TEST_KEY` | optional - protects the self-test below |

   Without `LEAD_EMAIL_FROM` it falls back to Resend's test sender, which only
   delivers to the Resend account owner's own address - not to info@banacraft.hu.
4. **Deploy.** Then check:
   - `https://YOUR-PROJECT.vercel.app/` - the demo page with the widget
   - `https://YOUR-PROJECT.vercel.app/api/faq-agent?selftest=1` - sends a test
     e-mail and reports what Resend answered

Changing an environment variable later needs a redeploy to take effect.

## Embedding on the Banacraft site

```html
<script>
  window.BANACRAFT_CONFIG = {
    apiUrl: "https://YOUR-PROJECT.vercel.app/api/faq-agent",
    assetsUrl: "https://YOUR-PROJECT.vercel.app"
  };
</script>
<script src="https://YOUR-PROJECT.vercel.app/widget.js" defer></script>
```

The site's "Azonnali becslés az asszisztenstől" and "Becslést kérek" links are
marked `.js-quote-agent`; the widget catches those clicks before the site's
placeholder script, so they open the chat with no other change. This site has no
floating button of its own, so the widget's launcher stays on.

## What Banacraft receives

- **Finished estimate:** contact details, customer type, every answer, the
  itemised price, exclusions, warnings (damaged roof structure, tight plot) and the
  full chat.
- **Stopped halfway:** the conversation so far (chat closed, page left, or 3 idle
  minutes; max 3 per conversation).
- **Zoho Flow:** same webhook contract as the NM Bau bot (`ZOHO_FLOW_WEBHOOK_URL`),
  with `quote_basis: "floor"`. Remove the `[TEMP zoho payload]` log line once the
  mapping is verified.

## Editing

- **Prices:** `P` in `lib/flow.js`.
- **Questions, buttons, order:** `FIELDS` and `fieldOrder()` in `lib/flow.js`.
- **What the AI may say about Banacraft:** `KNOWLEDGE` in `lib/flow.js`.
- **Greeting, teaser texts:** `BOT` at the top of `public/widget.js`.
- **Colours:** the variables at the top of `public/style.css`.
