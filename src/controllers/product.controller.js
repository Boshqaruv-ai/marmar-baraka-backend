const productService = require('../services/product.service');
const { asyncHandler } = require('../middleware/error.middleware');

const getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAll(req.query);

  res.status(200).json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await productService.getById(req.params.id);
  await productService.incrementViews(req.params.id);

  res.status(200).json({
    success: true,
    data: product,
    meta: { timestamp: new Date().toISOString() },
  });
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getBySlug(req.params.slug);

  res.status(200).json({
    success: true,
    data: product,
    meta: { timestamp: new Date().toISOString() },
  });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.create(req.body);

  res.status(201).json({
    success: true,
    data: product,
    meta: { timestamp: new Date().toISOString() },
  });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.update(req.params.id, req.body);

  res.status(200).json({
    success: true,
    data: product,
    meta: { timestamp: new Date().toISOString() },
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);

  res.status(200).json({
    success: true,
    data: { message: 'Product deleted successfully' },
    meta: { timestamp: new Date().toISOString() },
  });
});

const getCategories = asyncHandler(async (req, res) => {
  const categories = await productService.getCategories();

  res.status(200).json({
    success: true,
    data: categories,
    meta: { timestamp: new Date().toISOString() },
  });
});

module.exports = {
  getAllProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
};
