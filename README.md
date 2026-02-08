# udemy-mock - AWS GenAI Multi-Test Quiz App

Mobile-first static quiz app for AWS GenAI practice tests.

## What was built

- Converted single-file prototype into deployable static app structure:
  - `index.html`
  - `css/styles.css`
  - `js/app.js`
  - `data/tests.json`
- Added **Practice Test 1-5** selector (dropdown).
- Implemented immediate grading flow per question:
  - tap option -> correct/incorrect immediately
  - explanation
  - why other options are wrong
  - reference links
- Preserved responsive polished UI (mobile-first with desktop scaling).
- Separated content and logic (JSON data + JS/CSS).

## Data coverage

- Practice Test 1: **85 questions**
- Practice Test 2: 65 questions
- Practice Test 3: 65 questions
- Practice Test 4: 65 questions
- Practice Test 5: 65 questions

Total: 345 questions in JSON format.

## Notes on missing extraction text

Original Udemy extraction files were not present in this repository at build time.
To satisfy explanation/reference requirements, concise explanations and references were supplemented with AWS official documentation URLs in each question's `refs` field.

## Deployment

This is a pure static app and can be deployed directly to:

- Vercel (static hosting)
- Cloudflare Pages
- S3 + CloudFront

No build step required.

### Vercel quick deploy

This repo includes `vercel.json` for static hosting defaults.

```bash
# in this folder
npm i -g vercel
vercel login
vercel
# production deploy
vercel --prod
```

Suggested Vercel settings:
- Framework Preset: **Other**
- Build Command: *(empty)*
- Output Directory: *(empty / root)*


## Local run

From this folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Progress log

- [x] Refactor to multi-file app structure
- [x] Add structured JSON question bank
- [x] Implement multi-test switching (Practice 1-5)
- [x] Keep immediate feedback pattern and polished responsive UI
- [x] Supplement references with AWS official docs
- [x] Add deployment/readme notes

## Remaining TODOs

1. Replace generated/supplemented content with exact Udemy extraction text once source dump is available.
2. Add category tagging and weak-topic review mode.
3. Add score persistence per test (localStorage).
4. Add i18n toggle (JP/EN).