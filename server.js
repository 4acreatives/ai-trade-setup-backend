require('dotenv').config();
console.log('Loaded OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'FOUND' : 'NOT FOUND');



const express = require('express');
const axios = require('axios');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(express.json());
app.use(cors());

// Initialize OpenAI with your API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Utility: Fetch OHLCV for Forex from Alpha Vantage
async function fetchForexOHLCV(pair, interval = '60min') {
  const from = pair.substring(0, 3).toUpperCase();
  const to = pair.substring(3, 6).toUpperCase();
  const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${from}&to_symbol=${to}&interval=${interval}&apikey=${process.env.ALPHA_VANTAGE_KEY}&outputsize=compact`;
  const res = await axios.get(url);
  return res.data;
}

// Utility: Fetch OHLCV for Crypto from Twelve Data
async function fetchCryptoOHLCV(pair, interval = '1h') {
  const [symbol, base] = [pair.substring(0, 3).toUpperCase(), pair.substring(3, 6).toUpperCase()];
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}/${base}&interval=${interval}&apikey=${process.env.TWELVE_DATA_KEY}&outputsize=30`;
  const res = await axios.get(url);
  return res.data;
}

// Helper: Detect if pair is forex or crypto (very basic, can improve)
function isCrypto(pair) {
  const cryptoList = ['BTC', 'ETH', 'SOL', 'DOG', 'BNB', 'XRP', 'ADA', 'LTC', 'USDT', 'USDC'];
  return cryptoList.includes(pair.substring(0, 3).toUpperCase());
}

// MAIN ENDPOINT
app.post('/analyze', async (req, res) => {
  try {
    const { pair } = req.body;
    let ohlcvData = {};

    if (isCrypto(pair)) {
      // For crypto, get 1h and 15min data
      ohlcvData['1H'] = await fetchCryptoOHLCV(pair, '1h');
      ohlcvData['15M'] = await fetchCryptoOHLCV(pair, '15min');
    } else {
      // For forex, get 1h and 15min data
      ohlcvData['1H'] = await fetchForexOHLCV(pair, '60min');
      ohlcvData['15M'] = await fetchForexOHLCV(pair, '15min');
    }

    // Build your AI analysis prompt
    const prompt = `
Act as a highly experienced institutional-level Forex technical analyst specializing in multi-timeframe analysis, Smart Money Concepts (SMC), Inner Circle Trader (ICT) principles, liquidity analysis, volume interpretation, classical chart patterns, and mean reversion strategies. Your primary goal is to identify the highest probability trade setup for a given currency pair based on the current market data.

Here's the data for analysis (OHLCV): ${JSON.stringify(ohlcvData)}

[Now, use the rest of your detailed prompt here as previously constructed, including all the analysis points and requirements.]
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ setup: completion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'An error occurred. Please try again.' });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
