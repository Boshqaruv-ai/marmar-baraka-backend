const request = require('supertest');
const app = require('../../src/app');

describe('Product Integration Tests', () => {
  let adminToken;
  let productId;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@marmarbaraka.com', password: 'Admin@123!' });

    if (loginRes.body.data?.accessToken) {
      adminToken = loginRes.body.data.accessToken;
    }
  });

  describe('GET /api/v1/products', () => {
    it('should return list of products', async () => {
      const res = await request(app)
        .get('/api/v1/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should filter products by category', async () => {
      const res = await request(app)
        .get('/api/v1/products?category=marble')
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.products.forEach((product) => {
        expect(product.category).toBe('marble');
      });
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/v1/products?page=1&limit=5')
        .expect(200);

      expect(res.body.data.pagination.limit).toBe(5);
      expect(res.body.data.products.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/v1/products/:id', () => {
    it('should return product by ID', async () => {
      const productsRes = await request(app).get('/api/v1/products');
      if (productsRes.body.data.products.length > 0) {
        const product = productsRes.body.data.products[0];
        const res = await request(app)
          .get(`/api/v1/products/${product.id}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(product.id);
      }
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app)
        .get('/api/v1/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/products/categories', () => {
    it('should return categories', async () => {
      const res = await request(app)
        .get('/api/v1/products/categories')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/v1/products', () => {
    it('should create product with admin token', async () => {
      if (!adminToken) return;

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nameUz: 'Test Marmar',
          nameEn: 'Test Marble',
          category: 'marble',
          color: 'white',
          pricePerM2: 100,
          stockM2: 500,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      productId = res.body.data.id;
    });

    it('should reject product creation without admin token', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .send({
          nameUz: 'Test Marmar',
          category: 'marble',
          pricePerM2: 100,
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });
});
