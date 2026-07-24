const { Sequelize } = require('sequelize');

// In production this points at Postgres via DATABASE_URL.
// Tests and local dev fall back to an in-memory SQLite DB so the
// integration tests exercise real transaction/rollback behavior
// without needing a running Postgres instance.
const sequelize = new Sequelize(process.env.DATABASE_URL || 'sqlite::memory:', {
  logging: false,
});

module.exports = sequelize;
