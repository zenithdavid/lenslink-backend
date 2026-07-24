const request = require('supertest');
const sequelize = require('../src/db');
const Booking = require('../src/models/Booking');
const BookingLog = require('../src/models/BookingLog');
const app = require('../src/app');

const validPayload = () => ({
  clientName: 'Amara Boateng',
  clientEmail: 'amara@example.com',
  sessionType: 'portrait',
  sessionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  location: 'Labadi Beach, Accra',
  notes: 'Golden hour, family of four',
});

beforeAll(async () => {
  // sqlite::memory: gives us a real DB to test real transaction/rollback
  // behavior against, instead of mocking Sequelize away.
  await sequelize.sync({ force: true });
});

afterEach(async () => {
  await Booking.destroy({ where: {}, truncate: true });
  await BookingLog.destroy({ where: {}, truncate: true });
  jest.restoreAllMocks();
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/bookings (REQ-02: Booking Request)', () => {
  describe('happy path', () => {
    it('creates a booking and a linked audit log row in the same transaction', async () => {
      const res = await request(app).post('/api/bookings').send(validPayload());

      expect(res.status).toBe(201);
      expect(res.body.booking).toMatchObject({
        clientName: 'Amara Boateng',
        clientEmail: 'amara@example.com',
        sessionType: 'portrait',
        status: 'pending',
      });
      expect(res.body.booking.id).toBeDefined();

      const savedBooking = await Booking.findByPk(res.body.booking.id);
      expect(savedBooking).not.toBeNull();

      const log = await BookingLog.findOne({ where: { bookingId: res.body.booking.id } });
      expect(log).not.toBeNull();
      expect(log.action).toBe('CREATED');
    });
  });

  describe('validation errors', () => {
    it('rejects requests missing required fields and persists nothing', async () => {
      const payload = validPayload();
      delete payload.clientEmail;

      const res = await request(app).post('/api/bookings').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.fields).toContain('clientEmail');
      expect(await Booking.count()).toBe(0);
    });

    it('rejects an invalid email format', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({ ...validPayload(), clientEmail: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    it('rejects an invalid session type', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({ ...validPayload(), sessionType: 'birthday-party' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/session type/i);
    });

    it('rejects a session date in the past', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({ ...validPayload(), sessionDate: '2020-01-01T10:00:00.000Z' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/future/i);
    });

    it('rejects malformed JSON bodies', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Content-Type', 'application/json')
        .send('{ this is not valid json');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/json/i);
    });
  });

  describe('booking conflicts', () => {
    it('returns 409 and persists nothing new when the slot is already taken', async () => {
      const payload = validPayload();

      const first = await request(app).post('/api/bookings').send(payload);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/bookings')
        .send({ ...payload, clientName: 'Kwame Asante', clientEmail: 'kwame@example.com' });

      expect(second.status).toBe(409);
      expect(await Booking.count()).toBe(1); // only the first booking persisted
    });
  });

  describe('transactional integrity', () => {
    it('rolls back the booking if the audit log write fails mid-transaction', async () => {
      jest.spyOn(BookingLog, 'create').mockImplementationOnce(() => {
        throw new Error('Simulated audit log failure');
      });

      const res = await request(app).post('/api/bookings').send(validPayload());

      expect(res.status).toBe(500);
      // No orphaned booking row despite the booking insert itself succeeding.
      expect(await Booking.count()).toBe(0);
      expect(await BookingLog.count()).toBe(0);
    });

    it('does not commit either row if the booking insert itself fails', async () => {
      jest.spyOn(Booking, 'create').mockImplementationOnce(() => {
        throw new Error('Simulated DB failure on booking insert');
      });

      const res = await request(app).post('/api/bookings').send(validPayload());

      expect(res.status).toBe(500);
      expect(await Booking.count()).toBe(0);
      expect(await BookingLog.count()).toBe(0);
    });
  });
});
