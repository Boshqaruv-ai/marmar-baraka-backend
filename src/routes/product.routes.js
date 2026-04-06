const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const uploadController = require('../controllers/upload.controller');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth.middleware');
const { validate, validateParams } = require('../middleware/validation.middleware');
const { apiLimiter } = require('../middleware/rateLimit.middleware');

const uuidSchema = require('joi').object({ id: require('joi').string().uuid().required() });

router.get('/', apiLimiter, optionalAuth, validate('pagination'), productController.getAllProducts);
router.get('/categories', productController.getCategories);
router.get('/slug/:slug', productController.getProductBySlug);

router.post('/upload/images', uploadController.uploadImages[0], uploadController.uploadImages[1], uploadController.uploadImages[2], uploadController.uploadImages[3]);
router.post('/upload/thumbnail', uploadController.uploadThumbnail[0], uploadController.uploadThumbnail[1], uploadController.uploadThumbnail[2], uploadController.uploadThumbnail[3]);
router.delete('/upload/:filename', uploadController.deleteImage[0], uploadController.deleteImage[1], uploadController.deleteImage[2]);

router.get('/:id', optionalAuth, validateParams(uuidSchema), productController.getProductById);
router.post('/', authMiddleware, requireRole('admin', 'manager'), validate('product'), productController.createProduct);
router.put('/:id', authMiddleware, requireRole('admin', 'manager'), validateParams(uuidSchema), validate('product'), productController.updateProduct);
router.delete('/:id', authMiddleware, requireRole('admin'), validateParams(uuidSchema), productController.deleteProduct);

module.exports = router;
