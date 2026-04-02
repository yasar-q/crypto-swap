require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.SIMPLE_SWAP_API_KEY;
const BASE_URL = 'https://api.simpleswap.io/v3';

// Middleware
app.use(helmet());
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/', limiter);

// Cache system (simple in-memory cache)
const cache = new Map();
const CACHE_DURATION = {
  CURRENCIES: 5 * 60 * 1000, // 5 minutes
  PAIRS: 60 * 1000, // 1 minute
  RANGE: 30 * 1000 // 30 seconds
};

// Helper function for GET API calls
// FIX: API key must be sent as 'x-api-key' header, NOT as a query param
// FIX: API wraps all responses in { result: ..., traceId: ... } — extract .result
const callSimpleSwapAPI = async (endpoint, params = {}) => {
  try {
    const response = await axios.get(`${BASE_URL}/${endpoint}`, {
      headers: { 'x-api-key': API_KEY },
      params
    });
    console.log(`API call to ${BASE_URL}/${endpoint} successful`);
    return response.data.result;
  } catch (error) {
    console.error(`API Error (${BASE_URL}/${endpoint}):`, error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'API request failed');
  }
};

// Get cached data or fetch fresh
const getCachedOrFetch = async (key, fetchFn, duration) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < duration) {
    return cached.data;
  }

  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
};

// Routes

// 1. Get all currencies
// FIX: route was '/currencies', frontend calls '/api/currencies' — added /api prefix
// FIX: endpoint was 'get_currencies', correct endpoint is 'currencies'
// FIX: map isAvailableFloat/isAvailableFixed to is_active (new API has no is_active field)
app.get('/api/currencies', async (req, res) => {
  try {
    const data = await getCachedOrFetch(
      'currencies',
      () => callSimpleSwapAPI('currencies'),
      CACHE_DURATION.CURRENCIES
    );

    const formattedCurrencies = data.map(currency => ({
      ticker: currency.ticker,
      network: currency.network,
      name: currency.name,
      image: currency.image,
      is_active: currency.isAvailableFloat || currency.isAvailableFixed,
      hasExtraId: currency.hasExtraId,
      extraId: currency.extraId,
      contractAddress: currency.contractAddress || null,
      precision: currency.precision || 18
    }));

    res.json(formattedCurrencies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get available trading pairs
// FIX: endpoint was 'get_pairs', correct endpoint is 'pairs'
// FIX: 'fixed' query param is required by the API
app.get('/api/pairs', async (req, res) => {
  const { fixed } = req.query;
  const cacheKey = `pairs_${fixed}`;
  try {
    const data = await getCachedOrFetch(
      cacheKey,
      () => callSimpleSwapAPI('pairs', { fixed: fixed === 'true' }),
      CACHE_DURATION.PAIRS
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get exchange range (min/max limits)
// FIX: endpoint was 'get_range', correct endpoint is 'ranges'
// FIX: param names changed — from_currency→tickerFrom, to_currency→tickerTo,
//      from_network→networkFrom, to_network→networkTo
app.get('/api/range', async (req, res) => {
  const { from_currency, to_currency, from_network, to_network, fixed } = req.query;

  const cacheKey = `range_${from_currency}_${to_currency}_${from_network}_${to_network}_${fixed}`;

  try {
    const data = await getCachedOrFetch(
      cacheKey,
      () => callSimpleSwapAPI('ranges', {
        tickerFrom: from_currency,
        networkFrom: from_network,
        tickerTo: to_currency,
        networkTo: to_network,
        fixed: fixed === 'true'
      }),
      CACHE_DURATION.RANGE
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Get exchange estimate
// FIX: endpoint was 'get_estimate', correct endpoint is 'estimates'
// FIX: param names changed — from_currency→tickerFrom, to_currency→tickerTo,
//      from_network→networkFrom, to_network→networkTo
// FIX: API returns estimatedAmount (camelCase), old code read estimated_amount (snake_case)
// FIX: commission subtraction was string - number (NaN bug), now both are parsed as float
app.get('/api/estimate', async (req, res) => {
  const { from_currency, to_currency, from_network, to_network, amount, fixed, reverse } = req.query;

  try {
    const data = await callSimpleSwapAPI('estimates', {
      tickerFrom: from_currency,
      networkFrom: from_network,
      tickerTo: to_currency,
      networkTo: to_network,
      amount,
      fixed: fixed === 'true',
      reverse: reverse === 'true'
    });

    const commission = parseFloat(process.env.COMMISSION_PERCENTAGE || 0.5);
    const estimated = parseFloat(data.estimatedAmount);
    data.commission_rate = commission;
    data.commission_amount = (estimated * commission / 100).toFixed(8);
    data.final_amount = (estimated - parseFloat(data.commission_amount)).toFixed(8);

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Create exchange
// FIX: endpoint was '/create_exchange', correct endpoint is '/exchanges' (POST)
// FIX: API key was in request body, must be in 'x-api-key' header
// FIX: param names changed — from_currency→tickerFrom, to_currency→tickerTo,
//      from_network→networkFrom, to_network→networkTo,
//      address→addressTo, refund_address→userRefundAddress, extra_id→extraIdTo
// FIX: rateId must be passed for fixed-rate exchanges
// FIX: response.data.result extraction
app.post('/api/create-exchange', async (req, res) => {
  const {
    from_currency, to_currency, from_network, to_network,
    amount, fixed, address, refund_address, extra_id, rateId
  } = req.body;

  try {
    const response = await axios.post(`${BASE_URL}/exchanges`, {
      tickerFrom: from_currency,
      networkFrom: from_network,
      tickerTo: to_currency,
      networkTo: to_network,
      amount,
      fixed,
      addressTo: address,
      userRefundAddress: refund_address || null,
      extraIdTo: extra_id || null,
      rateId: rateId || null
    }, {
      headers: { 'x-api-key': API_KEY }
    });

    res.json(response.data.result);
  } catch (error) {
    console.error('Create exchange error:', error.response?.data);
    res.status(500).json({
      error: error.response?.data?.message || 'Failed to create exchange'
    });
  }
});

// 6. Get exchange status
// FIX: was callSimpleSwapAPI('get_exchange', { id }) — wrong endpoint name and wrong param style
// FIX: correct endpoint is 'exchanges/:publicId' (path param, not query param)
app.get('/api/exchange-status/:id', async (req, res) => {
  try {
    const data = await callSimpleSwapAPI(`exchanges/${req.params.id}`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get exchange history (by email or wallet)
app.get('/api/exchange-history', async (_req, res) => {
  // Note: SimpleSwap doesn't have a built-in history endpoint per address.
  // You would need to store exchanges in your own database.
  res.json({ message: 'Store exchanges in your database' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
});
