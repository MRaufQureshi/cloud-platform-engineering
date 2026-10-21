# T.H.E.O. landing website

An interactive, scroll-driven site that explains vehicle-to-home (V2H), vehicle-to-grid (V2G) and vehicle-to-factory (V2F).The savings and fleet numbers come from small simulations that run in the browser and are labelled as illustrative.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then build into dist/
npm test           # simulation tests (Node ≥ 22.6)
```

- **Brand name:** T.H.E.O. ("The Holistic Energy Orchestrator"). `src/config.ts` is the source for the `.brand-mark` spans and the day HUD; `index.html` also writes it statically (title, meta description, aria-labels, footer), so update both when renaming.
- **Languages:** English (default) and German, switched live from the top bar and remembered per visitor. English text lives in `index.html`; German is in `src/i18n/de.ts` (page copy, keyed by `data-i18n`) and `src/i18n/strings.ts` (text that scripts generate). `npm test` checks that the two stay in step.
- **Waitlist form:** no backend is connected. Submissions stay in the visitor's browser (`localStorage`), and the form says so. Connect a form endpoint in `src/ui/sections.ts` (`initJoin`) before launch.
- **Hosting:** `dist/` is fully static and works on Vercel, Netlify, GitHub Pages or any static host.

## Deploy (AWS)
Terraform (`infra/theo/modules/landing`) creates a private bucket, a CloudFront address (`terraform output -raw landing_url`)
and `config.json` with the web app's address. **T.H.E.O. App Deploy** builds this folder and copies `dist/` to the bucket
(it never overwrites `config.json`). `src/appLink.ts` reads `config.json` and points the **Simulator** menu button at the
web app, because that address changes after every rebuild. Without a `config.json` (`npm run dev`) the button stays inactive.
