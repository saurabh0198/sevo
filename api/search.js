const axios = require('axios');
const TAVILY_KEY = process.env.TAVILY_KEY;
module.exports = async (req, res) => {
  try {
    const { query } = req.body;
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: TAVILY_KEY, query, search_depth: 'basic', max_results: 3
    });
    res.json(response.data);
  } catch(e) { res.status(500).json({ error: 'Search failed' }); }
};
