"use strict";

// In-memory rate limiter. Keyed by userId.
// For multi-process/multi-instance deployments swap for a Redis-backed limiter.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 100;
const windows = new Map();

function createRateLimiter({ windowMs = WINDOW_MS, maxRequests = MAX_REQUESTS } = {}) {
  return function rateLimiterMiddleware(req, res, next) {
    const userId = req.user && req.user.userId;
    if (!userId) return next();

    const now = Date.now();
    let entry = windows.get(userId);

    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      windows.set(userId, entry);
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      return res.status(429).json({ error: "Rate limit exceeded", retryAfter });
    }

    next();
  };
}

module.exports = { createRateLimiter };
