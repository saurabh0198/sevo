const axios = require('axios');
const YOUTUBE_KEY = process.env.YOUTUBE_KEY;
module.exports = async (req, res) => {
  try {
    const { q } = req.query;
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&key=${YOUTUBE_KEY}&type=video&maxResults=1`);
    res.json(response.data);
  } catch(e) { res.status(500).json({ error: 'YouTube failed' }); }
};
