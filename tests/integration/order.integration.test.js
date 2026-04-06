const request = require('supertest');
const app = require('../../src/app');

describe('Order Integration Tests', () => {
  let userToken;
  let userId;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `order-test-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        firstName: 'Order',
        lastName: 'Tester',
      });

    if (registerRes.body.data?.accessToken) {
      userToken = registerRes.body.data.accessToken;
    }
  });

  describe('Cart Operations', () => {
    it('should get empty cart', async () => {
      const res = await request(app)
        .get('/api/v1/orders/cart')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('Order Creation', () => {
    it('should reject order without items', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          shippingAddress: {
            fullName: 'Test User',
            phone: '+998901234567',
            address: 'Test Street 1',
            city: 'Tashkent',
            country: 'UZ',
          },
          paymentMethod: 'bank_transfer',
          items: [],
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Order Retrieval', () => {
    it('should get user orders', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.orders)).toBe(true);
    });
  });
});
