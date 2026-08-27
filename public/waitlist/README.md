# StreamTeam Waitlist Pages — Setup

## Folder structure

Put everything in one folder like this:

```
waitlist/
├── index.html      ← landing page
├── join.html       ← signup form
└── assets/
    ├── mascot.jpg  ← "Stream Team Mascot.jpg" from your Drive
    └── banner.jpg  ← "Mascot banner" from your Drive
```

Download both images from Drive, make an `assets` folder next to the HTML files, and rename them exactly `mascot.jpg` and `banner.jpg`.

**Compress the banner first.** It's 879KB, which is heavy on mobile — that's most of a second of load time on a bad connection, right at the moment someone decides whether to stay. Run it through tinypng.com or squoosh.app; you'll likely get it under 150KB with no visible difference.

The mascot at 112KB is fine as-is, though squoosh will shrink it too.

## Test it locally

Open `index.html` in your browser. Click through to the signup page, fill it in, submit.

If the backend is deployed, you'll get a real referral link back. If it isn't yet, you'll see an error — that's expected and tells you the form is wired correctly.

## Hosting

Any static host works since these are plain HTML files:

- **Netlify or Vercel** — drag the folder onto their dashboard, done. Free tier is plenty.
- **GitHub Pages** — push the folder to a repo, enable Pages in Settings. Free, and you already know the workflow.
- **Cloudflare Pages** — same idea, fast CDN.

Once hosted, set `WAITLIST_SITE_URL` in Railway to your live URL so referral links point to the right place.

## Two things to check before launch

**The API URL.** Near the bottom of `join.html`:
```js
const API_URL = "https://streamteam-production.up.railway.app";
```
That's your live Railway backend. If the domain ever changes, update it here.

**Rate limiting.** The `/waitlist` endpoint is public and unauthenticated. Before you drive real traffic to it, point something like the existing swipe rate limiter at it — otherwise you'll collect bot signups.

## What the pages do

**index.html** — landing page. Hero, three "why it's different" cards, three-step explainer, closing callout. Every CTA points to `join.html`.

**join.html** — the form. Validates client-side with real error messages, POSTs to your API, and on success swaps to a state showing their referral link with a copy button.

The referral link matters more than it looks: people share it in that moment or not at all. Burying it in an email loses most of them. If someone arrives via `?ref=CODE`, that code rides along with their signup automatically.

Duplicate signups don't error — submitting the same email twice returns the existing referral link with different copy, since an error just makes people retry.
