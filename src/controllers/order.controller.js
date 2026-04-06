const orderService = require('../services/order.service');
const emailService = require('../services/email.service');
const { asyncHandler } = require('../middleware/error.middleware');

const createOrder = asyncHandler(async (req, res) => {
  const result = await orderService.createOrder(req.user.id, req.body);
  const user = { firstName: req.user.firstName, email: req.user.email };
  // Email failure doesn't block order
  emailService.sendOrderConfirmationEmail(user, result.order).catch(err => {
    require('../utils/logger').error('Failed to send order confirmation', { orderId: result.order.id, error: err.message });
  });

  res.status(201).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const getAllOrders = asyncHandler(async (req, res) => {
  const result = await orderService.getAllOrders(req.query);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const getOrder = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'manager';
  const order = await orderService.getOrderById(req.params.id, req.user.id, isAdmin);

  res.status(200).json({
    success: true,
    data: order,
    meta: { timestamp: new Date().toISOString() },
  });
});

const getUserOrders = asyncHandler(async (req, res) => {
  const result = await orderService.getUserOrders(req.user.id, req.query);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id, req.user.id);

  res.status(200).json({
    success: true,
    data: order,
    meta: { timestamp: new Date().toISOString() },
  });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await orderService.updateOrderStatus(req.params.id, status, req.user.id);

  res.status(200).json({
    success: true,
    data: order,
    meta: { timestamp: new Date().toISOString() },
  });
});

const getCart = asyncHandler(async (req, res) => {
  const cart = await orderService.getCart(req.user.id);

  res.status(200).json({
    success: true,
    data: cart,
    meta: { timestamp: new Date().toISOString() },
  });
});

const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const result = await orderService.addToCart(req.user.id, productId, quantity);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const result = await orderService.updateCartItem(req.user.id, req.params.itemId, quantity);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const removeFromCart = asyncHandler(async (req, res) => {
  const cart = await orderService.removeFromCart(req.user.id, req.params.itemId);

  res.status(200).json({
    success: true,
    data: cart,
    meta: { timestamp: new Date().toISOString() },
  });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await orderService.clearCart(req.user.id);

  res.status(200).json({
    success: true,
    data: cart,
    meta: { timestamp: new Date().toISOString() },
  });
});

module.exports = {
  createOrder,
  getAllOrders,
  getOrder,
  getUserOrders,
  cancelOrder,
  updateOrderStatus,
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};
