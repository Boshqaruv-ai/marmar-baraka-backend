const { httpRequestDuration, httpRequestTotal } = require('../routes/metrics.routes');

/**
 * Middleware to collect HTTP request metrics
 */
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  // Record response metrics when response finishes
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Record request duration
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );

    // Increment request counter
    httpRequestTotal.inc({ method, route, status_code: statusCode });
  });

  next();
};

module.exports = metricsMiddleware;
