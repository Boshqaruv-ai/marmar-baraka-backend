const db = require('../config/database');
const redis = require('../config/redis');
const { AppError } = require('../middleware/error.middleware');
const logger = require('../utils/logger');

const CACHE_TTL = 1800;
const CACHE_PREFIX = 'product:';

const getAll = async (filters) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'created_at',
    order = 'desc',
    category,
    color,
    minPrice,
    maxPrice,
    search,
    featured,
  } = filters;

  const offset = (page - 1) * limit;
  const conditions = ['p.deleted_at IS NULL', 'p.is_active = TRUE'];
  const values = [];
  let paramIndex = 1;

  if (category) {
    conditions.push(`p.category = $${paramIndex}`);
    values.push(category);
    paramIndex++;
  }

  if (color) {
    conditions.push(`p.color = $${paramIndex}`);
    values.push(color);
    paramIndex++;
  }

  if (minPrice !== undefined) {
    conditions.push(`p.price_per_m2 >= $${paramIndex}`);
    values.push(minPrice);
    paramIndex++;
  }

  if (maxPrice !== undefined) {
    conditions.push(`p.price_per_m2 <= $${paramIndex}`);
    values.push(maxPrice);
    paramIndex++;
  }

  if (featured) {
    conditions.push('p.is_featured = TRUE');
  }

  if (search) {
    conditions.push(`(p.name_uz ILIKE $${paramIndex} OR p.name_en ILIKE $${paramIndex} OR p.description_uz ILIKE $${paramIndex} OR p.description_en ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');
  // 1.5 — sortBy whitelist validation
  const VALID_SORT_COLUMNS = ['name_uz', 'name_en', 'price_per_m2', 'created_at', 'updated_at', 'views_count'];
  const safeSortBy = VALID_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const countQuery = `SELECT COUNT(*) FROM products p WHERE ${whereClause}`;
  const countResult = await db.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const dataQuery = `
    SELECT p.id, p.name_uz, p.name_en, p.slug, p.category, p.color,
           p.description_uz, p.description_en, p.price_per_m2, p.currency,
           p.stock_m2, p.min_order_m2, p.thumbnail_url, p.image_urls,
           p.model_3d_url, p.is_featured, p.views_count, p.sales_count,
           p.created_at, p.updated_at,
           COALESCE(
             (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.is_approved = TRUE),
             0
           ) as review_count,
           COALESCE(
             (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id AND r.is_approved = TRUE),
             0
           ) as average_rating
    FROM products p
    WHERE ${whereClause}
    ORDER BY p.${safeSortBy} ${safeSortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  values.push(limit, offset);
  const dataResult = await db.query(dataQuery, values);

  const products = dataResult.rows.map(formatProductResponse);

  return {
    products,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};

const getById = async (id) => {
  const cacheKey = `${CACHE_PREFIX}${id}`;
  let cached;
  try { cached = await redis.get(cacheKey); } catch (e) {
    logger.warn('Cache read failed', { cacheKey, error: e.message });
  }

  if (cached) return cached;

  const result = await db.query(
    `SELECT p.*,
            COALESCE(
              (SELECT json_agg(pi.*) FROM product_images pi WHERE pi.product_id = p.id),
              '[]'::json
            ) as images,
            COALESCE(
              (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.is_approved = TRUE),
              0
            ) as review_count,
            COALESCE(
              (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id AND r.is_approved = TRUE),
              0
            ) as average_rating
     FROM products p
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  const product = formatProductResponse(result.rows[0]);
  await redis.set(cacheKey, product, CACHE_TTL);

  return product;
};

const getBySlug = async (slug) => {
  const cacheKey = `${CACHE_PREFIX}slug:${slug}`;
  const cached = await redis.get(cacheKey);

  if (cached) return cached;

  const result = await db.query(
    `SELECT p.*,
            COALESCE(
              (SELECT json_agg(pi.* ORDER BY pi.display_order) FROM product_images pi WHERE pi.product_id = p.id),
              '[]'::json
            ) as images
     FROM products p
     WHERE p.slug = $1 AND p.deleted_at IS NULL`,
    [slug]
  );

  if (result.rows.length === 0) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  const product = formatProductResponse(result.rows[0]);
  await redis.set(cacheKey, product, CACHE_TTL);

  return product;
};

const create = async (productData) => {
  const slug = productData.slug || generateSlug(productData.nameUz || productData.nameEn);

  const existing = await db.query('SELECT id FROM products WHERE slug = $1 FOR UPDATE', [slug]);
  if (existing.rows.length > 0) {
    throw new AppError('Product with this slug already exists', 409, 'SLUG_EXISTS');
  }

  const result = await db.query(
    `INSERT INTO products (
      name_uz, name_ru, name_en, slug, category, color,
      description_uz, description_ru, description_en,
      density, compressive_strength, water_absorption, porosity,
      price_per_m2, currency, stock_m2, min_order_m2,
      model_3d_url, texture_urls, thumbnail_url, image_urls,
      is_featured, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    RETURNING *`,
    [
      productData.nameUz, productData.nameRu || null, productData.nameEn || null,
      slug, productData.category, productData.color || null,
      productData.descriptionUz || null, productData.descriptionRu || null, productData.descriptionEn || null,
      productData.density || null, productData.compressiveStrength || null,
      productData.waterAbsorption || null, productData.porosity || null,
      productData.pricePerM2, productData.currency || 'USD',
      productData.stockM2 || 0, productData.minOrderM2 || 10,
      productData.model3dUrl || null, productData.textureUrls ? JSON.stringify(productData.textureUrls) : null,
      productData.thumbnailUrl || null, productData.imageUrls ? JSON.stringify(productData.imageUrls) : null,
      productData.isFeatured || false, productData.isActive !== undefined ? productData.isActive : true,
    ]
  );

  await redis.invalidatePattern('product:*');

  logger.info('Product created', { productId: result.rows[0].id, name: result.rows[0].name_uz });
  return formatProductResponse(result.rows[0]);
};

const update = async (id, updates) => {
  const safeFields = {
    nameUz: 'name_uz', nameRu: 'name_ru', nameEn: 'name_en',
    slug: 'slug', category: 'category', color: 'color',
    descriptionUz: 'description_uz', descriptionRu: 'description_ru', descriptionEn: 'description_en',
    density: 'density', compressiveStrength: 'compressive_strength',
    waterAbsorption: 'water_absorption', porosity: 'porosity',
    pricePerM2: 'price_per_m2', currency: 'currency',
    stockM2: 'stock_m2', minOrderM2: 'min_order_m2',
    model3dUrl: 'model_3d_url', textureUrls: 'texture_urls',
    thumbnailUrl: 'thumbnail_url', imageUrls: 'image_urls',
    isFeatured: 'is_featured', isActive: 'is_active',
  };

  const fields = [];
  const values = [];
  let paramIndex = 1;

  const jsonFields = ['imageUrls', 'textureUrls'];
  for (const [key, column] of Object.entries(safeFields)) {
    if (updates[key] !== undefined) {
      fields.push(`${column} = $${paramIndex}`);
      const value = jsonFields.includes(key) && typeof updates[key] !== 'string'
        ? JSON.stringify(updates[key])
        : updates[key];
      values.push(value);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400, 'NO_UPDATES');
  }

  values.push(id);

  const result = await db.query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.invalidatePattern('product:slug:*');

  logger.info('Product updated', { productId: id });
  return formatProductResponse(result.rows[0]);
};

const deleteProduct = async (id) => {
  const result = await db.query(
    'UPDATE products SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  await redis.del(`${CACHE_PREFIX}${id}`);
  await redis.invalidatePattern('product:*');

  logger.info('Product deleted', { productId: id });
  return { id };
};

const incrementViews = async (id) => {
  await db.query('UPDATE products SET views_count = views_count + 1 WHERE id = $1', [id]);
  await redis.del(`${CACHE_PREFIX}${id}`);
};

const getCategories = async () => {
  const cacheKey = 'categories:all';
  const cached = await redis.get(cacheKey);

  if (cached) return cached;

  const result = await db.query(
    'SELECT id, name_uz, name_en, slug, description, parent_id, display_order, is_active FROM categories WHERE is_active = TRUE ORDER BY display_order'
  );

  const categories = result.rows.map((cat) => ({
    id: cat.id,
    nameUz: cat.name_uz,
    nameEn: cat.name_en,
    slug: cat.slug,
    description: cat.description,
    parentId: cat.parent_id,
    displayOrder: cat.display_order,
    isActive: cat.is_active,
  }));

  await redis.set(cacheKey, categories, CACHE_TTL * 2);
  return categories;
};

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

const formatProductResponse = (product) => {
  let imageUrls = product.image_urls;
  if (typeof imageUrls === 'string') {
    try { imageUrls = JSON.parse(imageUrls); } catch { imageUrls = []; }
  }
  if (!Array.isArray(imageUrls)) imageUrls = [];

  let textureUrls = product.texture_urls;
  if (typeof textureUrls === 'string') {
    try { textureUrls = JSON.parse(textureUrls); } catch { textureUrls = null; }
  }

  return {
    id: product.id,
    nameUz: product.name_uz,
    nameRu: product.name_ru,
    nameEn: product.name_en,
    slug: product.slug,
    category: product.category,
    color: product.color,
    descriptionUz: product.description_uz,
    descriptionRu: product.description_ru,
    descriptionEn: product.description_en,
    density: product.density,
    compressiveStrength: product.compressive_strength,
    waterAbsorption: product.water_absorption,
    porosity: product.porosity,
    pricePerM2: parseFloat(product.price_per_m2),
    currency: product.currency,
    stockM2: parseFloat(product.stock_m2),
    minOrderM2: parseFloat(product.min_order_m2),
    model3dUrl: product.model_3d_url,
    textureUrls,
    thumbnailUrl: product.thumbnail_url,
    imageUrls,
    images: product.images || [],
    isFeatured: product.is_featured,
    isActive: product.is_active,
    viewsCount: product.views_count,
    salesCount: product.sales_count,
    reviewCount: parseInt(product.review_count, 10) || 0,
    averageRating: parseFloat(product.average_rating) || 0,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
};

module.exports = {
  getAll,
  getById,
  getBySlug,
  create,
  update,
  deleteProduct,
  incrementViews,
  getCategories,
};
