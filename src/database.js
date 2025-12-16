require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false,
  max: 20,
   idleTimeoutMillis: 60000,           // Увеличено до 60 сек
  connectionTimeoutMillis: 30000,     // Увеличено до 30 сек
  statement_timeout: 30000,           // Таймаут запроса 30 сек
  query_timeout: 30000,               // Таймаут запроса 30 сек
});

async function savePost(postData) {
  const query = `
    INSERT INTO posts (channel_username, message_id, text, date, views, is_ad, job_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (message_id) DO UPDATE 
    SET views = EXCLUDED.views, text = EXCLUDED.text
    RETURNING id
  `;
  
  try {
    const result = await pool.query(query, [
      postData.channel_username,
      postData.message_id,
      postData.text,
      postData.date,
      postData.views,
      postData.is_ad,
      postData.job_id
    ]);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving post:', error.message);
    throw error;
  }
}

async function saveMediaMetadata(mediaData, retries = 3) {
  // Безопасная конвертация file_id
  let fileId = null;
  
  if (mediaData.file_id !== null && mediaData.file_id !== undefined) {
    // Если это объект BigInt из Telegram
    if (typeof mediaData.file_id === 'object' && mediaData.file_id.toString) {
      fileId = mediaData.file_id.toString();
    }
    // Если это уже строка
    else if (typeof mediaData.file_id === 'string') {
      fileId = mediaData.file_id;
    }
    // Если это число
    else if (typeof mediaData.file_id === 'number' || typeof mediaData.file_id === 'bigint') {
      fileId = String(mediaData.file_id);
    }
    // Fallback
    else {
      fileId = String(mediaData.file_id);
    }
  }
  
  // Убедитесь что file_size это число или null
  const fileSize = mediaData.file_size ? parseInt(mediaData.file_size) : null;
  
  const query = `
    INSERT INTO media_files (
      post_id, media_type, file_id, file_url, direct_url, file_size, 
      mime_type, width, height, duration, thumbnail_url
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (post_id)
    DO UPDATE SET 
      media_type = EXCLUDED.media_type,
      file_id = EXCLUDED.file_id,
      file_url = EXCLUDED.file_url,
      direct_url = EXCLUDED.direct_url,
      file_size = EXCLUDED.file_size,
      mime_type = EXCLUDED.mime_type,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      duration = EXCLUDED.duration,
      thumbnail_url = EXCLUDED.thumbnail_url
    RETURNING id
  `;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await pool.query(query, [
        mediaData.post_id,
        mediaData.media_type || 'unknown',
        fileId,  // Правильно сконвертированный file_id
        mediaData.file_url,
        mediaData.direct_url,
        fileSize,  // Убедились что это число
        mediaData.mime_type,
        mediaData.width,
        mediaData.height,
        mediaData.duration,
        mediaData.thumbnail_url
      ]);
      
      return result.rows.length > 0 ? result.rows[0].id : null;
      
    } catch (error) {
      console.error(`Error saving media (attempt ${attempt}/${retries}):`, error.message);
      console.error(`Media data:`, {
        post_id: mediaData.post_id,
        file_id: fileId,
        file_id_type: typeof fileId,
        file_size: fileSize,
        file_size_type: typeof fileSize
      });
      
      if (
        error.message.includes('timeout') || 
        error.message.includes('Connection terminated')
      ) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      return null;
    }
  }
}

module.exports = { 
  pool, 
  savePost, 
  saveMediaMetadata 
};
