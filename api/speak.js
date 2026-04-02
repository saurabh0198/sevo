const axios = require('axios');

const ELEVENLABS_KEY = process.env.ELEVENLABS_KEY;
const ELEVENLABS_VOICE = '21m00Tcm4TlvDq8ikWAM';

module.exports = async (req, res) => {
  try {
    const { text } = req.body;
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`,
      { text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true } },
      { headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch(e) {
    res.status(500).json({ error: 'ElevenLabs failed' });
  }
};
