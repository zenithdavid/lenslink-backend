const express = require('express');
const bookingsRouter = require('./routes/bookings');

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingsRouter);

// Catches malformed JSON bodies thrown by express.json(), plus anything
// unhandled further up the chain.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
