// В endpoint /api/parse установите download_media = false по умолчанию
app.post('/api/parse', async (req, res) => {
  try {
    const { 
      channel_username, 
      limit = 100, 
      offset = 0,
      download_media = false  // По умолчанию НЕ скачиваем
    } = req.body;

    if (!channel_username) {
      return res.status(400).json({ 
        status: 'error',
        error: 'channel_username required' 
      });
    }

    const jobId = Date.now().toString();
    
    res.json({ 
      status: 'processing', 
      job_id: jobId,
      channel: channel_username,
      limit: limit,
      download_media: download_media,
      message: 'Safe parsing started'
    });

    parseChannel(channel_username, limit, offset, download_media, jobId)
      .then(result => {
        console.log(`✓ Parsing completed:`, result);
      })
      .catch(err => {
        console.error(`✗ Parsing failed:`, err.message);
      });

  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});
