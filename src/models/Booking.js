const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('../db');
const Booking = require('../models/Booking');
const BookingLog = require('../models/BookingLog');

const router = express.Router();

const REQUIRED_FIELDS = ['clientName', 'clientEmail', 'sessionType', 'sessionDate'];
const VALID_SESSION_TYPES = ['portrait', 'wedding', 'event', 'commercial'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/bookings
 * REQ-02: Booking Request
 *
 * Creates a new booking request. A booking and its audit log entry
 * are written inside a single DB transaction so a partial write
 * (e.g. the log insert failing) never leaves an orphaned booking.
 */
router.post('/', async (req, res) => {
  const body = req.body || {};
  const { clientName, clientEmail, sessionType, sessionDate, location, notes } = body;

  // --- Validation (fails fast, before opening a transaction) ---
  const missing = REQUIRED_FIELDS.filter((field) => !body[field]);
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields', fields: missing });
  }

  if (!EMAIL_RE.test(clientEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!VALID_SESSION_TYPES.includes(sessionType)) {
    return res.status(400).json({ error: 'Invalid session type', allowed: VALID_SESSION_TYPES });
  }

  const parsedDate = new Date(sessionDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Invalid session date' });
  }
  if (parsedDate < new Date()) {
    return res.status(400).json({ error: 'Session date must be in the future' });
  }

  const t = await sequelize.transaction();
  try {
    // Lock and check for a clashing slot inside the transaction so two
    // concurrent requests for the same date can't both succeed.
    const conflict = await Booking.findOne({
      where: { sessionDate: parsedDate, status: { [Op.ne]: 'cancelled' } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (conflict) {
      await t.rollback();
      return res.status(409).json({ error: 'That date/time is already booked' });
    }

    const booking = await Booking.create(
      { clientName, clientEmail, sessionType, sessionDate: parsedDate, location, notes },
      { transaction: t }
    );

    await BookingLog.create(
      {
        bookingId: booking.id,
        action: 'CREATED',
        detail: `Booking requested by ${clientName} for ${parsedDate.toISOString()}`,
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(201).json({ booking });
  } catch (err) {
    await t.rollback();

    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors.map((e) => e.message),
      });
    }

    // eslint-disable-next-line no-console
    console.error('Booking creation failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
