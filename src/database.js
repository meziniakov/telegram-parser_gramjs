require('dotenv').config();
const { translit } = require('./lib/translit');

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false,
  max: 20,
  idleTimeoutMillis: 60000, // Увеличено до 60 сек
  connectionTimeoutMillis: 30000, // Увеличено до 30 сек
  statement_timeout: 30000, // Таймаут запроса 30 сек
  query_timeout: 30000, // Таймаут запроса 30 сек
});

async function savePost(postData) {
  const regionName = postData.hashtags[0].replace(/(?<!^)(?=[А-Я])/g, ' ').trim();
  const { regionId } = await getRegionIdByRegionName(regionName);

  const query = `
    INSERT INTO posts (channel_username, title, description, latitude, longitude, "regionId", author, "authorUrl", "mapUrl", status, "externalId", "message_id", text, date, views, is_ad, job_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (message_id) DO UPDATE 
    SET views = EXCLUDED.views, text = EXCLUDED.text
    RETURNING id
  `;

  try {
    const result = await pool.query(query, [
      postData.channel_username,
      postData.title,
      postData.description,
      postData.latitude,
      postData.longitude,
      regionId,
      postData.author,
      postData.author_url,
      postData.mapUrl,
      postData.status,
      postData.externalId,
      postData.message_id,
      postData.text,
      postData.date,
      postData.views,
      postData.is_ad,
      postData.job_id,
    ]);

    const postId = result.rows[0].id;

    // 2. Сохраняем теги
    if (postData.hashtags && postData.hashtags.length > 0) {
      await savePostTags(postId, postData.hashtags);
    }

    await pool.query('COMMIT');
    console.log(`💾 Сохранён пост ${postId} с ${postData.tags?.length || 0} тегами`);

    return postId;

    // return JSON.stringify({ postData }); // Заглушка для примера
  } catch (error) {
    console.error('Error saving post:', error.message);
    throw error;
  }
}

async function saveMediaMetadata(mediaData, retries = 3) {
  let fileId = null;

  if (mediaData.file_id !== null && mediaData.file_id !== undefined) {
    if (typeof mediaData.file_id === 'object' && mediaData.file_id.toString) {
      fileId = mediaData.file_id.toString();
    } else if (typeof mediaData.file_id === 'string') {
      fileId = mediaData.file_id;
    } else {
      fileId = String(mediaData.file_id);
    }
  }

  const fileSize = mediaData.file_size ? parseInt(mediaData.file_size) : null;
  const s3Url = mediaData.s3_url || null;

  // ПРОВЕРКА: если нет file_id, не пытаемся использовать ON CONFLICT
  if (!fileId) {
    console.warn('No file_id provided, using simple INSERT');

    const simpleQuery = `
      INSERT INTO media (
        post_id, type, file_url, direct_url, file_size,
        mime_type, width, height, duration, thumbnail_url, media_order, s3_url, image_author, image_author_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `;

    try {
      const result = await pool.query(simpleQuery, [
        mediaData.post_id,
        mediaData.type || 'unknown',
        mediaData.file_url,
        mediaData.direct_url,
        fileSize,
        mediaData.mime_type,
        mediaData.width,
        mediaData.height,
        mediaData.duration,
        mediaData.thumbnail_url,
        mediaData.media_order || 0,
        s3Url,
        mediaData.image_author,
        mediaData.image_author_url,
      ]);

      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error('Error saving media without file_id:', error.message);
      return null;
    }
  }

  // Основной query с ON CONFLICT
  const query = `
    INSERT INTO media (
      post_id, type, file_id, file_url, direct_url, file_size, 
      mime_type, width, height, duration, thumbnail_url, media_order, s3_url, image_author, image_author_url
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (post_id, file_id)
    DO UPDATE SET 
      type = EXCLUDED.type,
      file_url = EXCLUDED.file_url,
      direct_url = EXCLUDED.direct_url,
      file_size = EXCLUDED.file_size,
      mime_type = EXCLUDED.mime_type,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      duration = EXCLUDED.duration,
      thumbnail_url = EXCLUDED.thumbnail_url,
      media_order = EXCLUDED.media_order,
      s3_url = COALESCE(EXCLUDED.s3_url, media.s3_url),
      image_author = EXCLUDED.image_author,
      image_author_url = EXCLUDED.image_author_url
    RETURNING id
  `;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await pool.query(query, [
        mediaData.post_id,
        mediaData.type || 'unknown',
        fileId,
        mediaData.file_url,
        mediaData.direct_url,
        fileSize,
        mediaData.mime_type,
        mediaData.width,
        mediaData.height,
        mediaData.duration,
        mediaData.thumbnail_url,
        mediaData.media_order || 0,
        s3Url,
        mediaData.image_author,
        mediaData.image_author_url,
      ]);

      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error(`Error saving media (attempt ${attempt}/${retries}):`, error);
      console.error(`Media data:`, {
        post_id: mediaData.post_id,
        file_id: fileId,
        file_id_type: typeof fileId,
        file_size: fileSize,
        file_size_type: typeof fileSize,
        s3_url: s3Url,
      });

      // Если ошибка constraint - попробуем без ON CONFLICT
      if (error.message.includes('constraint') || error.message.includes('ON CONFLICT')) {
        console.warn(`Constraint issue detected, trying UPDATE/INSERT separately...`);

        try {
          // Сначала пробуем UPDATE
          const updateQuery = `
            UPDATE media 
            SET type = $2, file_url = $3, direct_url = $4,
                file_size = $5, mime_type = $6, width = $7, height = $8,
                duration = $9, thumbnail_url = $10, media_order = $11, 
                s3_url = COALESCE($12, media.s3_url)
            WHERE post_id = $1 AND file_id = $13
            RETURNING id
          `;

          const updateResult = await pool.query(updateQuery, [
            mediaData.post_id,
            mediaData.type || 'unknown',
            mediaData.file_url,
            mediaData.direct_url,
            fileSize,
            mediaData.mime_type,
            mediaData.width,
            mediaData.height,
            mediaData.duration,
            mediaData.thumbnail_url,
            mediaData.media_order || 0,
            s3Url,
            fileId,
          ]);

          if (updateResult.rows.length > 0) {
            console.log('Updated existing media record');
            return updateResult.rows[0].id;
          }

          // Если UPDATE не обновил ничего, делаем INSERT
          const insertQuery = `
            INSERT INTO media (
              post_id, type, file_id, file_url, direct_url, file_size, 
              mime_type, width, height, duration, thumbnail_url, media_order, s3_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
          `;

          const insertResult = await pool.query(insertQuery, [
            mediaData.post_id,
            mediaData.type || 'unknown',
            fileId,
            mediaData.file_url,
            mediaData.direct_url,
            fileSize,
            mediaData.mime_type,
            mediaData.width,
            mediaData.height,
            mediaData.duration,
            mediaData.thumbnail_url,
            mediaData.media_order || 0,
            s3Url,
          ]);

          console.log('Inserted new media record');
          return insertResult.rows.length > 0 ? insertResult.rows[0].id : null;
        } catch (fallbackError) {
          console.error('Fallback UPDATE/INSERT also failed:', fallbackError.message);
          return null;
        }
      }

      if (error.message.includes('timeout') || error.message.includes('Connection terminated')) {
        if (attempt < retries) {
          console.log(`Retrying in 2 seconds... (${attempt}/${retries})`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
      }

      return null;
    }
  }

  return null;
}

/**
 * Сохранить теги поста
 */
async function savePostTags(postId, tags) {
  try {
    await pool.query('BEGIN');

    const tagIds = [];

    // 1. Создаём/получаем теги
    for (const tagName of tags) {
      const result = await pool.query(
        `INSERT INTO tags (name, slug) 
         VALUES ($1, $2) 
         ON CONFLICT (slug) 
        //  DO UPDATE SET usage_count = tags.usage_count + 1, last_seen = NOW()
         RETURNING id`,
        [tagName, tagName]
      );
      tagIds.push(result.rows[0].id);
    }

    // 2. Связываем пост с тегами
    for (const tagId of tagIds) {
      await pool.query(
        `INSERT INTO _PostTags (A, B) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [postId, tagId]
      );
    }

    await pool.query('COMMIT');
    return tagIds.length;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    pool.release();
  }
}

async function getRegionIdByRegionName(regionName, coutryName = 'Россия') {
  if (!regionName) {
    return {
      error: 'Region name is required',
    };
  }
  try {
    const query = `SELECT id FROM regions WHERE name = $1 LIMIT 1`;
    const res = await pool.query(query, [regionName]);
    console.log('getRegionIdByRegionName', regionName, coutryName, 'found rows:', res.rows.length);
    if (res.rows.length > 0) {
      return { regionId: res.rows[0].id };
    }

    // Если региона нет, создаем новый
    const insertQuery = `
      INSERT INTO regions (name, slug, "countryId")
      VALUES ($1, $2, (SELECT id FROM countries WHERE name = $3 LIMIT 1))
      RETURNING id
    `;
    const slug = translit(regionName);

    const insertRes = await pool.query(insertQuery, [regionName, slug, coutryName]);
    console.log('Inserted new region:', regionName, 'with id:', insertRes.rows[0].id);

    return { regionId: insertRes.rows[0].id };
  } catch (e) {
    console.error('Error in getRegionIdByRegionName:', e.message);
    return { error: e };
  }
}

module.exports = {
  pool,
  savePost,
  saveMediaMetadata,
};
