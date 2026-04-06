const { uploadProductImages, uploadSingleImage, getPublicUrl } = require('../middleware/upload.middleware');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../middleware/upload.middleware');

const uploadImages = [
  authMiddleware,
  requireRole('admin', 'manager'),
  uploadProductImages,
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILES', message: 'Rasm tanlang' },
      });
    }

    const urls = req.files.map(file => getPublicUrl(file.filename));

    res.status(200).json({
      success: true,
      data: { urls },
    });
  }),
];

const uploadThumbnail = [
  authMiddleware,
  requireRole('admin', 'manager'),
  uploadSingleImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'Rasm tanlang' },
      });
    }

    res.status(200).json({
      success: true,
      data: { url: getPublicUrl(req.file.filename) },
    });
  }),
];

const deleteImage = [
  authMiddleware,
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(200).json({
      success: true,
      data: { message: 'Rasm o\'chirildi' },
    });
  }),
];

module.exports = {
  uploadImages,
  uploadThumbnail,
  deleteImage,
};
