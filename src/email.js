/**
 * src/email.js
 *
 * Thin wrapper around SendGrid's v3 REST API, plus a small template renderer.
 *
 * Templates live as .html files in src/templates/ rather than as string
 * literals in here — seven of them inline would be unmaintainable, and keeping
 * them as files means they can be opened in a browser to preview.
 *
 * Required env vars:
 *   SENDGRID_API_KEY  – SendGrid API key (starts with SG.)
 *   EMAIL_FROM        – verified sender address
 *
 * Optional:
 *   WAITLIST_SITE_URL – base URL of the waitlist site. Used for referral
 *                       links, image assets, and unsubscribe links.
 *
 * If SENDGRID_API_KEY is not set, sends are skipped with a warning rather than
 * throwing, so signups still succeed while developing without credentials.
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";
const SITE_URL = (process.env.WAITLIST_SITE_URL || "https://streamteam-waitlist.netlify.app").replace(/\/$/, "");
const TEMPLATE_DIR = path.join(__dirname, "templates");

// Templates are read once at startup, not per send. They never change at
// runtime, and a disk read on every email would be wasted work.
const templateCache = {};

function loadTemplate(name) {
  if (!templateCache[name]) {
    templateCache[name] = fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), "utf8");
  }
  return templateCache[name];
}

/**
 * Render a template with {{variable}} substitution.
 *
 * Also supports {{#if name}}...{{/if}} blocks, which is what lets a single
 * template handle "we have a Discord invite for you" and "we don't" without
 * needing two near-identical files. A missing or empty value drops the block.
 *
 * @param {string} name  Template filename without .html
 * @param {object} vars  Values to substitute
 */
function render(name, vars) {
  let html = loadTemplate(name);

  // Conditional blocks first, so variables inside a dropped block are never
  // substituted (and never leave stray {{placeholders}} behind).
  html = html.replace(
    /\{\{#if\s+([a-z_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, body) => (vars[key] ? body : "")
  );

  html = html.replace(/\{\{([a-z_]+)\}\}/g, (match, key) => {
    if (!(key in vars)) return match;
    return escapeHtml(vars[key]);
  });

  return html;
}

/**
 * Send one email through SendGrid.
 *
 * @param {object} opts
 * @param {string} opts.to       Recipient address
 * @param {string} opts.subject  Subject line
 * @param {string} opts.html     Rendered HTML body
 * @param {string} opts.text     Plain-text fallback
 */
async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn(`[email] SENDGRID_API_KEY not set — skipping "${subject}" to ${to}`);
    return;
  }

  await axios.post(
    SENDGRID_URL,
    {
      personalizations: [{ to: [{ email: to }] }],
      from: {
        email: process.env.EMAIL_FROM || "socials@streamteamkdk.com",
        name: "StreamTeam",
      },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(`[email] sent "${subject}" to ${to}`);
}

/** Values every template needs. */
function commonVars({ unsubscribe_token }) {
  return {
    asset_base: `${SITE_URL}/assets`,
    site_url: SITE_URL,
    unsubscribe_url: unsubscribe_token
      ? `${SITE_URL}/unsubscribe.html?t=${unsubscribe_token}`
      : "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional — sent regardless of marketing consent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Waitlist confirmation. Carries their referral link and, when we managed to
 * issue one, their personal Discord invite — this email is the only durable
 * copy of that invite, since the success page is gone once they close the tab.
 */
async function sendWaitlistConfirmation({ to, brand_name, referral_code, discord_invite, unsubscribe_token }) {
  const referral_link = `${SITE_URL}/join.html?ref=${referral_code}`;

  const vars = {
    ...commonVars({ unsubscribe_token }),
    brand_name,
    referral_link,
    discord_invite: discord_invite || "",
  };

  const text = [
    `You're on the StreamTeam waitlist, ${brand_name}.`,
    "",
    "Share your referral link — refer 3 streamers and Founder status is locked in:",
    referral_link,
    ...(discord_invite
      ? ["", "Your personal Discord invite (works once, just for you):", discord_invite]
      : []),
    "",
    "—StreamTeam",
  ].join("\n");

  await sendEmail({
    to,
    subject: "You're on the StreamTeam waitlist",
    html: render("confirmation", vars),
    text,
  });
}

/**
 * Founder status achieved. Transactional because the confirmation email
 * promises it — someone who earns it is owed the notification whether or not
 * they opted into marketing.
 */
async function sendFounderAchieved({ to, brand_name, referral_code, unsubscribe_token }) {
  const referral_link = `${SITE_URL}/join.html?ref=${referral_code}`;

  const vars = {
    ...commonVars({ unsubscribe_token }),
    brand_name,
    referral_link,
  };

  const text = [
    `Founder status locked in, ${brand_name}.`,
    "",
    "Three streamers joined through your link. You're in the founding group —",
    "priority matching the moment we open the doors.",
    "",
    `Keep sharing: ${referral_link}`,
    "",
    "—StreamTeam",
  ].join("\n");

  await sendEmail({
    to,
    subject: "You locked in Founder status",
    html: render("founder-achieved", vars),
    text,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing — only for rows with marketing_consent = true. Callers are
// responsible for that check; these functions do not enforce it.
// ─────────────────────────────────────────────────────────────────────────────

/** Sent when the cron detects they joined the Discord. */
async function sendDiscordCongrats({ to, brand_name, unsubscribe_token }) {
  const vars = { ...commonVars({ unsubscribe_token }), brand_name };

  const text = [
    `You're in the Discord, ${brand_name}.`,
    "",
    "Drop a hello in #introductions — people are more likely to collab with a",
    "name they've seen around.",
    "",
    "—StreamTeam",
  ].join("\n");

  await sendEmail({
    to,
    subject: "You're in the Discord",
    html: render("discord-congrats", vars),
    text,
  });
}

/** Sent ~7 days after signup when they still haven't joined. */
async function sendDiscordNudge({ to, brand_name, discord_invite, unsubscribe_token }) {
  const vars = {
    ...commonVars({ unsubscribe_token }),
    brand_name,
    discord_invite: discord_invite || "",
  };

  const text = [
    `Still want you in the Discord, ${brand_name}.`,
    "",
    ...(discord_invite ? ["Your invite:", discord_invite, ""] : []),
    "—StreamTeam",
  ].join("\n");

  await sendEmail({
    to,
    subject: "Still want you in the Discord",
    html: render("discord-nudge", vars),
    text,
  });
}

/** Sent to someone in the Discord who hasn't hit 3 referrals yet. */
async function sendFounderNudge({ to, brand_name, referral_code, referrals_remaining, unsubscribe_token }) {
  const referral_link = `${SITE_URL}/join.html?ref=${referral_code}`;
  const referrals_remaining_text =
    referrals_remaining === 1 ? "one referral" : `${referrals_remaining} referrals`;

  const vars = {
    ...commonVars({ unsubscribe_token }),
    brand_name,
    referral_link,
    referrals_remaining_text,
  };

  const text = [
    `You're ${referrals_remaining_text} away from Founder status.`,
    "",
    `Share your link: ${referral_link}`,
    "",
    "—StreamTeam",
  ].join("\n");

  await sendEmail({
    to,
    subject: `You're ${referrals_remaining_text} away from Founder status`,
    html: render("founder-nudge", vars),
    text,
  });
}

/** Sent when neither the Discord join nor any referrals have happened. */
async function sendFounderDiscordNudge({ to, brand_name, referral_code, referrals_remaining, discord_invite, unsubscribe_token }) {
  const referral_link = `${SITE_URL}/join.html?ref=${referral_code}`;
  const referrals_remaining_text =
    referrals_remaining === 1 ? "one referral" : `${referrals_remaining} referrals`;

  const vars = {
    ...commonVars({ unsubscribe_token }),
    brand_name,
    referral_link,
    referrals_remaining_text,
    discord_invite: discord_invite || "",
  };

  const text = [
    `Two quick things still open, ${brand_name}.`,
    "",
    ...(discord_invite ? ["Join the Discord:", discord_invite, ""] : []),
    `Refer ${referrals_remaining_text} for Founder status: ${referral_link}`,
    "",
    "—StreamTeam",
  ].join("\n");

  await sendEmail({
    to,
    subject: "Two quick things still open",
    html: render("founder-discord-nudge", vars),
    text,
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  sendWaitlistConfirmation,
  sendFounderAchieved,
  sendDiscordCongrats,
  sendDiscordNudge,
  sendFounderNudge,
  sendFounderDiscordNudge,
  // exported for tests and for any future one-off sends
  render,
  sendEmail,
};
