const express = require('express');
const router = express.Router();
const client = require('prom-client');

// Create a Registry to register the metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'marmar_baraka_',
});

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'marmar_baraka_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

const httpRequestTotal = new client.Counter({
  name: 'marmar_baraka_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeUsers = new client.Gauge({
  name: 'marmar_baraka_active_users',
  help: 'Number of active users',
});

const databaseConnections = new client.Gauge({
  name: 'marmar_baraka_database_connections',
  help: 'Number of active database connections',
});

const redisConnections = new client.Gauge({
  name: 'marmar_baraka_redis_connections',
  help: 'Number of active Redis connections',
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeUsers);
register.registerMetric(databaseConnections);
register.registerMetric(redisConnections);

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error.message);
  }
});

// Export metrics for use in middleware
module.exports = {
  router,
  httpRequestDuration,
  httpRequestTotal,
  activeUsers,
  databaseConnections,
  redisConnections,
};
