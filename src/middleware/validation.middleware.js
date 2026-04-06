const Joi = require('joi');
const logger = require('../utils/logger');

const schemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email is required',
      'any.required': 'Email is required',
    }),
    password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
        'string.max': 'Password must not exceed 128 characters',
        'any.required': 'Password is required',
      }),
    firstName: Joi.string().min(1).max(100).required().messages({
      'string.min': 'First name is required',
      'string.max': 'First name must not exceed 100 characters',
      'any.required': 'First name is required',
    }),
    lastName: Joi.string().min(1).max(100).required().messages({
      'string.min': 'Last name is required',
      'string.max': 'Last name must not exceed 100 characters',
      'any.required': 'Last name is required',
    }),
    phone: Joi.string().pattern(/^[+]?[0-9]{10,14}$/).optional().allow('').messages({
      'string.pattern.base': 'Please provide a valid phone number (10-14 digits)',
    }),
    companyName: Joi.string().max(255).optional().allow(''),
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required',
    }),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  }),

  resetPassword: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Reset token is required',
    }),
    password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
        'any.required': 'Password is required',
      }),
  }),

  product: Joi.object({
    nameUz: Joi.string().min(1).max(255).required(),
    nameRu: Joi.string().max(255).optional().allow('', null),
    nameEn: Joi.string().max(255).optional().allow('', null),
    slug: Joi.string().max(255).optional().allow('', null),
    category: Joi.string().valid('marble', 'granite', 'other').required(),
    color: Joi.string().max(100).optional().allow('', null),
    descriptionUz: Joi.string().optional().allow('', null),
    descriptionRu: Joi.string().optional().allow('', null),
    descriptionEn: Joi.string().optional().allow('', null),
    density: Joi.number().min(0).max(10).optional().allow(null),
    compressiveStrength: Joi.number().min(0).optional().allow(null),
    waterAbsorption: Joi.number().min(0).max(100).optional().allow(null),
    porosity: Joi.number().min(0).max(100).optional().allow(null),
    pricePerM2: Joi.number().min(0).required(),
    currency: Joi.string().length(3).default('USD'),
    stockM2: Joi.number().min(0).default(0),
    minOrderM2: Joi.number().min(0.01).default(10),
    model3dUrl: Joi.string().optional().allow('', null),
    textureUrls: Joi.object().optional().allow(null),
    thumbnailUrl: Joi.string().optional().allow('', null),
    imageUrls: Joi.array().items(Joi.string()).optional().allow(null),
    isFeatured: Joi.boolean().default(false),
    isActive: Joi.boolean().default(true),
  }),

  order: Joi.object({
    shippingAddress: Joi.object({
      fullName: Joi.string().required(),
      phone: Joi.string().required(),
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      postalCode: Joi.string().optional(),
    }).required(),
    billingAddress: Joi.object().optional(),
    paymentMethod: Joi.string().valid('stripe', 'bank_transfer', 'cash').required(),
    shippingMethod: Joi.string().optional(),
    customerNotes: Joi.string().max(1000).optional().allow(''),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        quantity: Joi.number().min(0.01).required(),
      })
    ).min(1).required(),
  }),

  inquiry: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^[+]?[0-9]{10,14}$/).optional().allow(''),
    company: Joi.string().max(255).optional().allow(''),
    subject: Joi.string().max(255).optional().allow(''),
    message: Joi.string().min(10).max(5000).required(),
    productId: Joi.string().uuid().optional().allow(''),
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('name', 'price', 'createdAt', 'updatedAt', 'views', 'created_at', 'updated_at', 'views_count', 'name_uz', 'name_en', 'price_per_m2').default('created_at'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    category: Joi.string().valid('marble', 'granite', 'other').optional().allow('', null),
    color: Joi.string().optional().allow('', null),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    search: Joi.string().max(255).optional().allow('', null),
  }),

  review: Joi.object({
    productId: Joi.string().uuid().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().max(255).optional().allow(''),
    comment: Joi.string().min(10).max(2000).optional().allow(''),
  }),

  // 1.12 — Cart item update validation
  updateCartItem: Joi.object({
    quantity: Joi.number().positive().precision(2).required(),
  }),
};

const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];

    if (!schema) {
      logger.error('Validation schema not found', { schemaName });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Validation schema not configured',
        },
      });
    }

    const source = req.method === 'GET' ? req.query : req.body;
    const { error, value } = schema.validate(source, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details,
        },
      });
    }

    if (req.method === 'GET') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

const validateParams = (schemaOrName) => {
  return (req, res, next) => {
    // Support both direct Joi schema objects and schema name strings
    const schema = (typeof schemaOrName === 'string') ? schemas[schemaOrName] : schemaOrName;
    if (!schema) return next();

    const { error, value } = schema.validate(req.params, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid URL parameters',
          details: error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
        },
      });
    }

    req.params = value;
    next();
  };
};

module.exports = {
  validate,
  validateParams,
  schemas,
};
