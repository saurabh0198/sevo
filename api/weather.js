const axios = require('axios');
const WEATHER_KEY = process.env.WEATHER_KEY;
module.exports = async (req, res) => {
  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=Siliguri&appid=${WEATHER_KEY}&units=metric`);
    res.json(response.data);
  } catch(e) { res.status(500).json({ error: 'Weather failed' }); }
};
