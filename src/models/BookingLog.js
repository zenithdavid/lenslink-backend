const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// Every booking creation also writes an audit row inside the SAME
// transaction. This gives the integration tests something concrete
// to assert on: if either write fails, BOTH must roll back.
const BookingLog = sequelize.define('BookingLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  bookingId: { type: DataTypes.UUID, allowNull: false },
  action: { type: DataTypes.STRING, allowNull: false },
  detail: { type: DataTypes.TEXT, allowNull: true },
});

module.exports = BookingLog;
