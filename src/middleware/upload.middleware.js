const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/error.middleware');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'products');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Faqat JPEG, PNG, WebP va GIF rasmlar yuklash mumkin', 400, 'INVALID_FILE_TYPE'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10,
  },
});

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Rasm hajmi 5MB dan oshmasligi kerak' },
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_FILES', message: 'Bir vaqtda 10 dan ortiq rasm yuklab bo\'lmaydi' },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: err.message },
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      error: { code: err.code || 'UPLOAD_ERROR', message: err.message },
    });
  }
  next();
};

const uploadProductImages = (req, res, next) => {
  upload.array('images', 10)(req, res, (err) => {
    handleUploadError(err, req, res, next);
  });
};

const uploadSingleImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    handleUploadError(err, req, res, next);
  });
};

const getPublicUrl = (filename) => {
  return `/uploads/products/${filename}`;
};

module.exports = {
  uploadProductImages,
  uploadSingleImage,
  getPublicUrl,
  UPLOAD_DIR,
};
