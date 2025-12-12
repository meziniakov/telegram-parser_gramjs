const express = require('express');
const { parseChannel } = require('./parser');

const app = express();
app.use(express.json());

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'telegram-parser' });
});

// Основной endpoint для парсинга
app.post('/api/parse', async (req, res) => {
  try {
    const { 
      channel_username, 
      limit = 100, 
      offset = 0,
      download_media = true 
    } = req.body;

    if (!channel_username) {
      return res.status(400).json({ error: 'channel_username required' });
    }

    // Запускаем парсинг (асинхронно)
    const jobId = Date.now().toString();
    
    // Отвечаем сразу с job_id
    res.json({ 
      status: 'processing', 
      job_id: jobId,
      message: 'Parsing started'
    });

    // Парсинг выполняется в фоне
    parseChannel(channel_username, limit, offset, download_media, jobId)
      .catch(err => console.error('Parse error:', err));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint для проверки статуса парсинга
app.get('/api/status/:job_id', async (req, res) => {
  const { job_id } = req.params;
  // Проверка статуса из БД или Redis
  res.json({ job_id, status: 'completed', posts_parsed: 150 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Parser service running on port ${PORT}`);
});
