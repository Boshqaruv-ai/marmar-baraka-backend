const db = require('../config/database');
const redis = require('../config/redis');
const { AppError } = require('../middleware/error.middleware');
const logger = require('../utils/logger');

const createOrder = async (userId, orderData) => {
  return db.transaction(async (client) => {
    const items = orderData.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400, 'EMPTY_ORDER');
    }

    let subtotal = 0;
    const orderItems = [];

    // Batch fetch all products in one query (fixes N+1)
    const productIds = items.map((item) => item.productId);
    const productsResult = await client.query(
      `SELECT id, name_uz, name_en, price_per_m2, stock_m2, min_order_m2
       FROM products
       WHERE id = ANY($1) AND is_active = TRUE AND deleted_at IS NULL
       FOR UPDATE`,
      [productIds]
    );

    const productMap = new Map(productsResult.rows.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new AppError(`Product ${item.productId} not found or inactive`, 404, 'PRODUCT_NOT_FOUND');
      }

      if (product.stock_m2 < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${product.name_uz}. Available: ${product.stock_m2} m²`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      if (product.min_order_m2 > item.quantity) {
        throw new AppError(
          `Minimum order for ${product.name_uz} is ${product.min_order_m2} m²`,
          400,
          'BELOW_MINIMUM_ORDER'
        );
      }

      const unitPrice = parseFloat(product.price_per_m2);
      const totalPrice = unitPrice * parseFloat(item.quantity);
      subtotal += totalPrice;

      orderItems.push({
        productId: product.id,
        productName: product.name_uz,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      });
    }

    // Batch update stock with atomic check (1.9)
    for (const item of items) {
      const updateResult = await client.query(
        'UPDATE products SET stock_m2 = stock_m2 - $1 WHERE id = $2 AND stock_m2 >= $1 RETURNING stock_m2',
        [item.quantity, item.productId]
      );
      if (updateResult.rows.length === 0) {
        throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK');
      }
    }

    const shippingCost = parseFloat(process.env.SHIPPING_COST || 50);
    const taxRate = parseFloat(process.env.TAX_RATE || 0.15);
    const tax = subtotal * taxRate;
    const totalAmount = subtotal + shippingCost + tax;

    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, subtotal, shipping_cost, tax, total_amount,
        shipping_address, billing_address, payment_method,
        shipping_method, customer_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        subtotal,
        shippingCost,
        tax,
        totalAmount,
        JSON.stringify(orderData.shippingAddress),
        orderData.billingAddress ? JSON.stringify(orderData.billingAddress) : null,
        orderData.paymentMethod,
        orderData.shippingMethod || null,
        orderData.customerNotes || null,
      ]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.productId, item.productName, item.quantity, item.unitPrice, item.totalPrice]
      );
    }

    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    logger.info('Order created', { orderId: order.id, userId, totalAmount });

    return {
      order: formatOrderResponse(order),
      items: orderItems,
    };
  });
};

const getOrderById = async (orderId, userId, isAdmin = false) => {
  // 1.8 — Admin check explicit, no OR $2 IS NULL bypass
  const query = isAdmin
    ? `SELECT o.*,
            COALESCE(
              (SELECT json_agg(oi.*) FROM order_items oi WHERE oi.order_id = o.id),
              '[]'::json
            ) as items
     FROM orders o
     WHERE o.id = $1`
    : `SELECT o.*,
            COALESCE(
              (SELECT json_agg(oi.*) FROM order_items oi WHERE oi.order_id = o.id),
              '[]'::json
            ) as items
     FROM orders o
     WHERE o.id = $1 AND o.user_id = $2`;
  const params = isAdmin ? [orderId] : [orderId, userId];

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  return formatOrderResponse(result.rows[0]);
};

const getAllOrders = async (filters = {}) => {
  const { page = 1, limit = 20, status, search } = filters;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`o.status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (search) {
    conditions.push(`(o.order_number ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await db.query(
    `SELECT COUNT(*) FROM orders o LEFT JOIN users u ON o.user_id = u.id ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await db.query(
    `SELECT o.*, u.first_name, u.last_name, u.email as user_email, u.phone as user_phone,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'total_price', oi.total_price
              )) FROM order_items oi WHERE oi.order_id = o.id),
              '[]'::json
            ) as items
     FROM orders o
     LEFT JOIN users u ON o.user_id = u.id
     ${whereClause}
     ORDER BY o.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, limit, offset]
  );

  const orders = result.rows.map((row) => ({
    ...formatOrderResponse(row),
    customer: {
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.user_email,
      phone: row.user_phone,
    },
  }));

  return {
    orders,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getUserOrders = async (userId, filters = {}) => {
  const { page = 1, limit = 20, status } = filters;
  const offset = (page - 1) * limit;

  const conditions = ['o.user_id = $1'];
  const values = [userId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`o.status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) FROM orders o WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await db.query(
    `SELECT o.* FROM orders o WHERE ${whereClause}
     ORDER BY o.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, limit, offset]
  );

  const orders = result.rows.map(formatOrderResponse);

  return {
    orders,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const updateOrderStatus = async (orderId, status, adminId) => {
  return db.transaction(async (client) => {
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid order status', 400, 'INVALID_STATUS');
    }

    const currentOrder = await client.query(
      'SELECT id, status FROM orders WHERE id = $1',
      [orderId]
    );

    if (currentOrder.rows.length === 0) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: ['refunded'],
      cancelled: [],
      refunded: [],
    };

    const currentStatus = currentOrder.rows[0].status;
    if (!validTransitions[currentStatus]?.includes(status)) {
      throw new AppError(
        `Cannot transition from '${currentStatus}' to '${status}'`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const statusField = `${status}_at`;
    const timestampQuery = ['confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)
      ? `, ${statusField} = NOW()`
      : '';

    const result = await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW() ${timestampQuery}
       WHERE id = $2 RETURNING *`,
      [status, orderId]
    );

    if (status === 'cancelled') {
      await client.query('UPDATE orders SET cancelled_by = $1 WHERE id = $2', [adminId, orderId]);

      await client.query(
        `UPDATE products p SET stock_m2 = stock_m2 + oi.quantity
         FROM order_items oi WHERE oi.order_id = $1 AND p.id = oi.product_id`,
        [orderId]
      );
    }

    logger.info('Order status updated', { orderId, status, adminId });
    return formatOrderResponse(result.rows[0]);
  });
};

const cancelOrder = async (orderId, userId) => {
  const result = await db.query(
    'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
    [orderId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  const order = result.rows[0];

  if (!['pending', 'confirmed'].includes(order.status)) {
    throw new AppError('Order cannot be cancelled at this stage', 400, 'CANCELLATION_NOT_ALLOWED');
  }

  return updateOrderStatus(orderId, 'cancelled', userId);
};

const getCart = async (userId) => {
  const result = await db.query(
    `SELECT ci.id, ci.quantity, ci.added_at,
            p.id as product_id, p.name_uz, p.name_en, p.slug, p.price_per_m2,
            p.thumbnail_url, p.stock_m2, p.min_order_m2
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL
     ORDER BY ci.added_at DESC`,
    [userId]
  );

  const items = result.rows.map((row) => ({
    cartItemId: row.id,
    productId: row.product_id,
    nameUz: row.name_uz,
    nameEn: row.name_en,
    slug: row.slug,
    pricePerM2: parseFloat(row.price_per_m2),
    quantity: parseFloat(row.quantity),
    totalPrice: parseFloat(row.price_per_m2) * parseFloat(row.quantity),
    thumbnailUrl: row.thumbnail_url,
    stockM2: parseFloat(row.stock_m2),
    minOrderM2: parseFloat(row.min_order_m2),
    addedAt: row.added_at,
  }));

  const total = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return { items, total, itemCount: items.length };
};

const addToCart = async (userId, productId, quantity) => {
  const product = await db.query(
    'SELECT id, stock_m2, min_order_m2 FROM products WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
    [productId]
  );

  if (product.rows.length === 0) {
    throw new AppError('Product not found or inactive', 404, 'PRODUCT_NOT_FOUND');
  }

  const p = product.rows[0];

  if (p.stock_m2 < quantity) {
    throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK');
  }

  if (p.min_order_m2 > quantity) {
    throw new AppError(`Minimum order is ${p.min_order_m2} m²`, 400, 'BELOW_MINIMUM_ORDER');
  }

  const result = await db.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = $3, updated_at = NOW()
     RETURNING id`,
    [userId, productId, quantity]
  );

  logger.info('Item added to cart', { userId, productId, quantity });
  return await getCart(userId);
};

const updateCartItem = async (userId, cartItemId, quantity) => {
  const result = await db.query(
    `UPDATE cart_items SET quantity = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 RETURNING id`,
    [quantity, cartItemId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
  }

  return await getCart(userId);
};

const removeFromCart = async (userId, cartItemId) => {
  const result = await db.query(
    'DELETE FROM cart_items WHERE id = $1 AND user_id = $2',
    [cartItemId, userId]
  );

  if (result.rowCount === 0) {
    throw new AppError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
  }

  return await getCart(userId);
};

const clearCart = async (userId) => {
  await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
  return await getCart(userId);
};

const formatOrderResponse = (order) => ({
  id: order.id,
  orderNumber: order.order_number,
  status: order.status,
  subtotal: parseFloat(order.subtotal),
  shippingCost: parseFloat(order.shipping_cost),
  tax: parseFloat(order.tax),
  discount: parseFloat(order.discount) || 0,
  totalAmount: parseFloat(order.total_amount),
  currency: order.currency,
  shippingAddress: order.shipping_address,
  billingAddress: order.billing_address,
  paymentMethod: order.payment_method,
  paymentStatus: order.payment_status,
  shippingMethod: order.shipping_method,
  trackingNumber: order.tracking_number,
  carrier: order.carrier,
  estimatedDelivery: order.estimated_delivery,
  customerNotes: order.customer_notes,
  items: order.items || [],
  createdAt: order.created_at,
  updatedAt: order.updated_at,
  confirmedAt: order.confirmed_at,
  shippedAt: order.shipped_at,
  deliveredAt: order.delivered_at,
  cancelledAt: order.cancelled_at,
  cancellationReason: order.cancellation_reason,
});

module.exports = {
  createOrder,
  getOrderById,
  getAllOrders,
  getUserOrders,
  updateOrderStatus,
  cancelOrder,
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};
