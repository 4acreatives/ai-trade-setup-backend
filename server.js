require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// ========== Twelve Data Fetch Function ==========
async function fetchOHLCV(pair, interval = '1h') {
  const from = pair.substring(0, 3).toUpperCase();
  const to = pair.substring(3, 6).toUpperCase();
  const symbol = `${from}/${to}`;
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&apikey=${process.env.TWELVE_DATA_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

// ========== Analyze Endpoint ==========
app.post('/analyze', async (req, res) => {
  try {
    const { pair } = req.body;
    if (!pair || pair.length < 6) {
      return res.status(400).json({ error: 'Invalid pair format.' });
    }

    // Fetch 1H and 15M data from Twelve Data
    let ohlcvData = {};
    ohlcvData['1H'] = await fetchOHLCV(pair, '1h');
    ohlcvData['15M'] = await fetchOHLCV(pair, '15min');

    console.log('Fetched OHLCV data:', ohlcvData);

    // Format the prompt for OpenAI
    const prompt = `
Act as a highly experienced institutional-level Forex technical analyst specializing in multi-timeframe analysis, Smart Money Concepts (SMC), Inner Circle Trader (ICT) principles, liquidity analysis, volume interpretation, classical chart patterns, and mean reversion strategies. Your primary goal is to identify the highest probability trade setup for a given currency pair based on the current market data.

Here's the data for analysis (OHLCV): ${JSON.stringify(ohlcvData)}

Your analysis and recommendation should cover the following points in detail:
Macro Market Structure & Higher Timeframe (HTF) Bias (1-Hour / 4-Hour):

What is the prevailing trend? (Bullish, Bearish, Ranging)
Identify key HTF support/resistance zones, supply/demand zones, and significant order blocks.
Are there any major Fair Value Gaps (FVGs) or Imbalances that price is likely to react to or target?
What is the overall directional bias you've established from the HTF?
Intermediate Timeframe (30-Minute) Refinement:

How does the 30-minute structure align with or deviate from the HTF bias?
Identify any recent internal market structure shifts.
Pinpoint closer-term liquidity pools (e.g., equal highs/lows, trendline liquidity).
Execution Timeframe (15-Minute) Setup Identification:

Liquidity Hunt/Sweep: Has there been a recent liquidity sweep (stop hunt) of a significant high or low? Describe the price action confirming this.
Market Structure Shift (MSS) / Change of Character (ChOC): After the liquidity sweep, has there been a clear break of the immediate market structure indicating a potential short-term reversal or continuation aligning with the HTF bias? Detail the specific high/low that was broken.
Order Block / Fair Value Gap (FVG) Identification: Based on the ChOC, identify the most recent and relevant order block (bullish or bearish) or a significant FVG that price is likely to retrace into for an optimal entry.
Confluence Factors: List all the confluences observed (e.g., FVG inside an order block, liquidity sweep confirming HTF bias, key Fibonacci level confluence).
Mean Reversion & Volume Confirmation:

How do the 20 or 50 Exponential Moving Averages (EMAs) or Bollinger Bands support the potential entry (e.g., price retesting the EMA within an OB/FVG)?
What does the recent volume data suggest? (e.g., increasing volume on breakouts, decreasing volume on pullbacks, volume spikes at key levels).
Trade Setup Recommendation (Provide a Single, Highest-Probability Setup):

Currency Pair: [e.g., EUR/USD]
Direction: [LONG / SHORT]
Entry Price: [Specific Price or narrow zone]
Stop Loss (SL): [Specific Price, explain logical placement based on structure/invalidation point]
Take Profit 1 (TP1): [Specific Price, explain why this is a logical first target (e.g., previous swing high, liquidity pool)]
Take Profit 2 (TP2): [Specific Price, explain why this is a logical second target (e.g., HTF FVG fill, major resistance)]
Risk-Reward Ratio (for TP1): [Calculated ratio]
Invalidation Point & Alternative Scenario:

At what price level would this trade setup be considered invalidated?
If the primary setup fails, what is the most likely alternative price action or next high-probability setup?
`;

    // ==== OpenAI API call ====
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-05-13',  // or 'gpt-4-turbo', 'gpt-3.5-turbo', etc.
      messages: [{ role: 'user', content: prompt }]
    });

    // Return only the AI's response
    res.json({ setup: completion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message, details: err });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
