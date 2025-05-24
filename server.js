require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ========== Helper: Limit candle count ==========
function sliceRecentCandles(ohlcv, count = 25) {
  if (!ohlcv?.values) return ohlcv;
  return { ...ohlcv, values: ohlcv.values.slice(0, count) };
}

// ========== Twelve Data Fetch ==========
async function fetchOHLCV(pair, interval = '1h') {
  const from = pair.substring(0, 3).toUpperCase();
  const to = pair.substring(3, 6).toUpperCase();
  const symbol = `${from}/${to}`;
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&apikey=${process.env.TWELVE_DATA_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

function aggregateTo4H(oneHourData) {
  const values = oneHourData.values;
  if (!values || values.length === 0) return { status: "error", values: [] };
  const sorted = [...values].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  let fourHourCandles = [];
  for (let i = 0; i < sorted.length; i += 4) {
    const group = sorted.slice(i, i + 4);
    if (group.length < 4) continue;
    fourHourCandles.push({
      datetime: group[3].datetime,
      open: group[0].open,
      high: Math.max(...group.map(c => parseFloat(c.high))),
      low: Math.min(...group.map(c => parseFloat(c.low))),
      close: group[3].close,
      volume: group.reduce((sum, c) => sum + parseFloat(c.volume || 0), 0),
    });
  }
  return { status: "ok", values: fourHourCandles };
}

// ========== Analyze Endpoint ==========
app.post('/analyze', async (req, res) => {
  try {
    const { pair, model } = req.body;
    if (!pair || pair.length < 6) {
      return res.status(400).json({ error: 'Invalid pair format.' });
    }
    const aiModel = model || 'gpt-3.5-turbo';

    let ohlcvData = {};
    ohlcvData['1D'] = await fetchOHLCV(pair, '1day');
    const oneHourData = await fetchOHLCV(pair, '1h');
    ohlcvData['1H'] = oneHourData;
    ohlcvData['4H'] = aggregateTo4H(oneHourData);
    ohlcvData['15M'] = await fetchOHLCV(pair, '15min');
    ohlcvData['5M'] = await fetchOHLCV(pair, '5min');

    // Limit to most recent 20–30 candles per timeframe
    ohlcvData['1D'] = sliceRecentCandles(ohlcvData['1D'], 20);
    ohlcvData['4H'] = sliceRecentCandles(ohlcvData['4H'], 25);
    ohlcvData['1H'] = sliceRecentCandles(ohlcvData['1H'], 25);
    ohlcvData['15M'] = sliceRecentCandles(ohlcvData['15M'], 30);
    ohlcvData['5M'] = sliceRecentCandles(ohlcvData['5M'], 30);

    console.log('Fetched OHLCV data:', ohlcvData);

    // Prompt (unchanged except new timeframes listed)
    const prompt = `
Act as a highly experienced institutional-level Forex technical analyst specializing in multi-timeframe analysis, Smart Money Concepts (SMC), Inner Circle Trader (ICT) principles, liquidity analysis, volume interpretation, classical chart patterns, and mean reversion strategies. Your primary goal is to identify the highest probability trade setup for a given currency pair based on the current market data.

Here's the data for analysis (OHLCV): ${JSON.stringify(ohlcvData)}

Analyze using: 1D, 4H, 1H, 15M, and 5M for true confluence.

[Follow the rest of your prompt as before...]
`;

    // ==== OpenAI API call ====
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ setup: completion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, details: err });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
