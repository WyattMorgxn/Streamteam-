/**
 * src/routes/waitlist.js
 *
 * POST /waitlist
 *
 * Public endpoint — no auth required.
 *
 * Body (JSON):
 *   brand_name        string  required
 *   email             string  required
 *   platform          string  required — "twitch" | "youtube" | "kick" | "other"
 *   handle            string  optional — channel link or handle
 *   marketing_consent boolean optional — defaults to false
 *   ref               string  optional — referral_code of the person who sent them
 *
 * Success 201:
 *   { referral_code: string, discord_invite: string|null, already_signed_up: false }
 *
 * Duplicate email 200 (not an error — return their existing code with a flag):
 *   { referral_code: string, discord_invite: string|null, already_signed_up: true }
 *
 * Validation error 400:
 *   { error: string }
 */

const express = require("express");
const crypto  = require("crypto");
const { pool } = require("../db");
const { sendWaitlistConfirmation } = require("../email");
const { createPersonalInvite } = require("../discord");

const router = express.Router();

const VALID_PLATFORMS = ["twitch", "youtube", "kick", "other"];

/** Generate an 8-character hex referral code — short enough to share, unique enough not to collide. */
function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex"); // e.g. "a3f9c12b"
}

router.post("/", async (req, res) => {
  const {
    brand_name,
    email,
    platform,
    handle = null,
    marketing_consent = false,
    ref = null,
  } = req.body || {};

  // ── Validation ────────────────────────────────────────────────────────────
  if (!brand_name || typeof brand_name !== "string" || !brand_name.trim()) {
    return res.status(400).json({ error: "brand_name is required" });
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` });
  }

  const cleanEmail    = email.trim().toLowerCase();
  const cleanBrand    = brand_name.trim().slice(0, 120);
  const cleanHandle   = handle ? handle.trim().slice(0, 200) : null;
  const cleanConsent  = Boolean(marketing_consent);
  const cleanRef      = ref && typeof ref === "string" ? ref.trim() : null;

  try {
    // ── Check for duplicate ───────────────────────────────────────────────
    const existing = await pool.query(
      "SELECT referral_code, discord_invite_code FROM waitlist WHERE email = $1",
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      // Already signed up — return their code without re-inserting or re-emailing
      const row = existing.rows[0];
      return res.status(200).json({
        referral_code: row.referral_code,
        discord_invite: row.discord_invite_code
          ? `https://discord.gg/${row.discord_invite_code}`
          : null,
        already_signed_up: true,
      });
    }

    // ── Verify the referring code exists (if supplied) ────────────────────
    let verifiedRef = null;
    if (cleanRef) {
      const refCheck = await pool.query(
        "SELECT referral_code, email FROM waitlist WHERE referral_code = $1",
        [cleanRef]
      );
      // A code that doesn't exist, or someone referring themselves, is ignored
      // rather than erroring — neither should block a signup.
      if (refCheck.rows.length > 0 && refCheck.rows[0].email !== cleanEmail) {
        verifiedRef = cleanRef;
      }
    }

    // ── Insert ────────────────────────────────────────────────────────────
    let referral_code;
    let newId = null;

    // Retry loop in case of referral_code collision (extremely unlikely but safe)
    while (!newId) {
      referral_code = generateReferralCode();
      try {
        const ins = await pool.query(
          `INSERT INTO waitlist
             (email, brand_name, platform, handle, marketing_consent, referral_code, referred_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [cleanEmail, cleanBrand, platform, cleanHandle, cleanConsent, referral_code, verifiedRef]
        );
        newId = ins.rows[0].id;
      } catch (err) {
        // Unique violation on referral_code — retry with a new code
        if (err.code === "23505" && err.constraint && err.constraint.includes("referral_code")) {
          continue;
        }
        throw err;
      }
    }

    // ── Personal Discord invite (non-blocking) ────────────────────────────
    // A Discord outage must not cost us the signup. Rows left with a null
    // invite code get picked up by the backfill job.
    let discord_invite = null;
    try {
      const inviteCode = await createPersonalInvite();
      await pool.query(
        "UPDATE waitlist SET discord_invite_code = $1 WHERE id = $2",
        [inviteCode, newId]
      );
      discord_invite = `https://discord.gg/${inviteCode}`;
    } catch (err) {
      console.error("[waitlist] discord invite failed:", err.message);
    }

    // ── Founder flip for the referrer ─────────────────────────────────────
    // One atomic statement so two simultaneous signups can't both read a count
    // of 2 and neither trigger the flip. RETURNING only yields rows on a real
    // flip, so it doubles as the "should we send the email?" check.
    if (verifiedRef) {
      try {
        const flip = await pool.query(
          `UPDATE waitlist
              SET is_founder = true, founder_at = NOW()
            WHERE referral_code = $1
              AND is_founder = false
              AND (SELECT count(*) FROM waitlist WHERE referred_by = $1) >= 3
          RETURNING email, brand_name`,
          [verifiedRef]
        );
        if (flip.rows.length > 0) {
          console.log("[waitlist] founder unlocked:", flip.rows[0].email);
          // TODO: sendFounderAchievedEmail(flip.rows[0])
        }
      } catch (err) {
        console.error("[waitlist] founder flip failed:", err.message);
      }
    }

    // ── Send confirmation email (non-blocking — don't fail the request) ───
    sendWaitlistConfirmation({ to: cleanEmail, brand_name: cleanBrand, referral_code })
      .catch((err) => console.error("[waitlist] email send failed:", err.message));

    return res.status(201).json({ referral_code, discord_invite, already_signed_up: false });

  } catch (err) {
    console.error("[waitlist] error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
