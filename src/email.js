/**
 * src/email.js
 *
 * Thin wrapper around SendGrid's v3 REST API.
 * Uses `axios` (already a dependency) — no extra package needed.
 *
 * Required env vars:
 *   SENDGRID_API_KEY  – your SendGrid API key (starts with SG.)
 *   EMAIL_FROM        – verified sender address, e.g. hello@streamteam.app
 *
 * Optional:
 *   WAITLIST_SITE_URL – base URL for the waitlist pages, used to build
 *                       referral links in the email body.
 *                       Defaults to https://streamteam.app/waitlist
 *
 * If SENDGRID_API_KEY is not set the function logs a warning and returns
 * without throwing, so the API still responds successfully while you're
 * developing locally without email credentials.
 */

const axios = require("axios");

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";
const SITE_URL = (process.env.WAITLIST_SITE_URL || "https://streamteam.app/waitlist").replace(/\/$/, "");

/**
 * Send a waitlist confirmation email.
 *
 * @param {object} opts
 * @param {string} opts.to            Recipient email address
 * @param {string} opts.brand_name    Streamer/brand name (used in greeting)
 * @param {string} opts.referral_code Their unique referral code
 */
async function sendWaitlistConfirmation({ to, brand_name, referral_code }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("[email] SENDGRID_API_KEY not set — skipping confirmation email");
    return;
  }

  const referral_link = `${SITE_URL}/join.html?ref=${referral_code}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're on the StreamTeam waitlist</title>
</head>
<body style="margin:0;padding:0;background:#0a0810;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4f2f8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0810;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#131020;border-radius:16px;overflow:hidden;border:1px solid #2a2340;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a0e2e 0%,#0f0a1e 100%);padding:40px 40px 32px;text-align:center;">
              <div style="font-family:Arial,sans-serif;font-weight:900;font-size:24px;letter-spacing:1px;text-transform:uppercase;background:linear-gradient(92deg,#e8617f 0%,#b562d6 40%,#4da6ff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;color:#b562d6;">StreamTeam</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#f4f2f8;">You're on the list, ${escapeHtml(brand_name)}.</h1>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#9a92ae;">
                We'll email you the second a spot opens. In the meantime, share your link and move up the queue — every streamer who joins using your link bumps you closer to the front.
              </p>

              <!-- Referral box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1528;border:1px solid #2a2340;border-radius:12px;padding:20px;margin-bottom:28px;">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#6f677f;margin-bottom:8px;">Your referral link</div>
                    <div style="font-family:'Courier New',monospace;font-size:14px;color:#a855f7;word-break:break-all;">${referral_link}</div>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:linear-gradient(95deg,#e8617f 0%,#b562d6 55%,#8b5cf6 100%);border-radius:10px;padding:1px;">
                    <a href="${referral_link}" style="display:inline-block;background:#131020;border-radius:9px;padding:14px 28px;font-size:15px;font-weight:600;color:#f4f2f8;text-decoration:none;">
                      Share your link →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#6f677f;line-height:1.6;">
                You'll hear from us soon. If you have questions, reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2340;">
              <p style="margin:0;font-size:12px;color:#6f677f;text-align:center;">
                You're receiving this because you signed up at streamteam.app.
                ${process.env.EMAIL_UNSUBSCRIBE_URL
                  ? `<br><a href="${process.env.EMAIL_UNSUBSCRIBE_URL}" style="color:#6f677f;">Unsubscribe</a>`
                  : ""}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `
You're on the StreamTeam waitlist, ${brand_name}.

We'll email you the second a spot opens. Share your referral link to move up the queue:

${referral_link}

Every streamer who joins via your link bumps you closer to the front.

—StreamTeam
  `.trim();

  await axios.post(
    SENDGRID_URL,
    {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.EMAIL_FROM || "hello@streamteam.app", name: "StreamTeam" },
      subject: "You're on the StreamTeam waitlist",
      content: [
        { type: "text/plain", value: text },
        { type: "text/html",  value: html },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { sendWaitlistConfirmation };
