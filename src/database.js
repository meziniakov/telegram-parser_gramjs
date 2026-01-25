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

// async function savePostOld(postData) {
//   const regionName = postData.hashtags[0].replace(/(?<!^)(?=[А-Я])/g, ' ').trim();
//   const { regionId } = await getRegionIdByRegionName(regionName);

//   const query = `
//     INSERT INTO posts (
//   id,
//   channel_username,
//   title,
//   description,
//   latitude,
//   longitude,
//   region_id,
//   author,
//   author_url,
//   map_url,
//   status,
//   external_id,
//   message_id,
//   text,
//   date,
//   views,
//   is_ad,
//   job_id,
//   created_at,
//   updated_at,
//   user_id
// )
// VALUES (
//   'c' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 24),
//   $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
//   NOW(),
//   NOW(),
//   (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
// )
// ON CONFLICT ON CONSTRAINT post_channel_message_unique DO UPDATE
// SET
//   views = EXCLUDED.views,
//   text = EXCLUDED.text,
//   updated_at = NOW()
// RETURNING id
//   `;

//   try {
//     const result = await pool.query(query, [
//       postData.channel_username,
//       postData.title,
//       postData.description,
//       postData.latitude,
//       postData.longitude,
//       regionId,
//       postData.author,
//       postData.author_url,
//       postData.map_url,
//       postData.status,
//       postData.external_id,
//       postData.message_id,
//       postData.text,
//       postData.date,
//       postData.views,
//       postData.is_ad,
//       postData.job_id,
//     ]);

//     const postId = result.rows[0].id;

//     // 2. Сохраняем теги
//     if (postData.hashtags && postData.hashtags.length > 0) {
//       await savePostTags(postId, postData.hashtags);
//     }

//     await pool.query('COMMIT');
//     console.log(`💾 Сохранён пост ${postId} с ${postData.tags?.length || 0} тегами`);

//     return postId;

//     // return JSON.stringify({ postData }); // Заглушка для примера
//   } catch (error) {
//     console.error('Error saving post:', error.message);
//     throw error;
//   }
// }

async function savePost(postData) {
  const regionName = postData.hashtags[0].replace(/(?<!^)(?=[А-Я])/g, ' ').trim();
  const { regionId } = await getRegionIdByRegionName(regionName);

  // console.log({ postData });

  try {
    // 1. Сначала проверяем, есть ли уже такой пост
    const checkQuery = `
      SELECT id FROM posts 
      WHERE channel_username = $1 AND message_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [
      postData.channel_username,
      postData.message_id,
    ]);

    let postId;

    if (checkResult.rows.length > 0) {
      // Обновляем существующий пост
      postId = checkResult.rows[0].id;

      const updateQuery = `
        UPDATE posts 
        SET 
          title = $1,
          description = $2,
          text = $3,
          views = $4,
          updated_at = NOW()
        WHERE id = $5
      `;

      await pool.query(updateQuery, [
        postData.title,
        postData.description,
        postData.text,
        postData.views,
        postId,
      ]);

      console.log(`🔄 Обновлён пост ${postId}`);
    } else {
      // Создаем новый пост - БЕЗ RETURNING
      // Генерируем ID заранее на стороне Node.js
      postId = 'c' + require('crypto').randomBytes(12).toString('hex').slice(0, 24);

      const insertQuery = `
        INSERT INTO posts (
          id, 
          channel_username, 
          title, 
          description, 
          latitude, 
          longitude, 
          region_id, 
          author, 
          author_url, 
          map_url, 
          status, 
          external_id, 
          message_id, 
          text, 
          date, 
          views, 
          is_ad, 
          job_id, 
          created_at, 
          updated_at, 
          user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 
          NOW(), 
          NOW(), 
          (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
        )
      `;

      await pool.query(insertQuery, [
        postId, // Передаем сгенерированный ID
        postData.channel_username,
        postData.title,
        postData.description,
        postData.latitude,
        postData.longitude,
        regionId,
        postData.author,
        postData.author_url,
        postData.map_url,
        postData.status,
        postData.external_id,
        postData.message_id,
        postData.text,
        postData.date,
        postData.views,
        postData.is_ad,
        postData.job_id,
      ]);

      console.log(`💾 Создан пост ${postId}`);
    }

    // 2. Сохраняем теги
    if (postData.hashtags && postData.hashtags.length > 0) {
      await savePostTags(postId, postData.hashtags);
    }

    await pool.query('COMMIT');
    return postId;
  } catch (error) {
    console.error('Error saving post:', error.message);
    console.error('Full error:', error);
    await pool.query('ROLLBACK');
    throw error;
  }
}

// async function saveMediaMetadataOld(mediaData, retries = 3) {
//   let fileId = null;

//   if (mediaData.file_id !== null && mediaData.file_id !== undefined) {
//     if (typeof mediaData.file_id === 'object' && mediaData.file_id.toString) {
//       fileId = mediaData.file_id.toString();
//     } else if (typeof mediaData.file_id === 'string') {
//       fileId = mediaData.file_id;
//     } else {
//       fileId = String(mediaData.file_id);
//     }
//   }

//   const fileSize = mediaData.file_size ? parseInt(mediaData.file_size) : null;
//   const s3Url = mediaData.s3_url || null;

//   // ПРОВЕРКА: если нет file_id, не пытаемся использовать ON CONFLICT
//   if (!fileId) {
//     console.warn('No file_id provided, using simple INSERT');

//     const simpleQuery = `
//       INSERT INTO media (
//         post_id, type, file_url, direct_url, file_size,
//         mime_type, width, height, duration, thumbnail_url, media_order, s3_url, image_author, image_author_url
//       )
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
//       RETURNING id
//     `;

//     try {
//       const result = await pool.query(simpleQuery, [
//         mediaData.post_id,
//         mediaData.type || 'unknown',
//         mediaData.file_url,
//         mediaData.direct_url,
//         fileSize,
//         mediaData.mime_type,
//         mediaData.width,
//         mediaData.height,
//         mediaData.duration,
//         mediaData.thumbnail_url,
//         mediaData.media_order || 0,
//         s3Url,
//         mediaData.image_author,
//         mediaData.image_author_url,
//       ]);

//       return result.rows.length > 0 ? result.rows[0].id : null;
//     } catch (error) {
//       console.error('Error saving media without file_id:', error.message);
//       return null;
//     }
//   }

//   // Основной query с ON CONFLICT
//   const query = `
//     INSERT INTO media (
//       post_id, type, file_id, file_url, direct_url, file_size,
//       mime_type, width, height, duration, thumbnail_url, media_order, s3_url, image_author, image_author_url
//     )
//     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
//     ON CONFLICT (post_id, file_id)
//     DO UPDATE SET
//       type = EXCLUDED.type,
//       file_url = EXCLUDED.file_url,
//       direct_url = EXCLUDED.direct_url,
//       file_size = EXCLUDED.file_size,
//       mime_type = EXCLUDED.mime_type,
//       width = EXCLUDED.width,
//       height = EXCLUDED.height,
//       duration = EXCLUDED.duration,
//       thumbnail_url = EXCLUDED.thumbnail_url,
//       media_order = EXCLUDED.media_order,
//       s3_url = COALESCE(EXCLUDED.s3_url, media.s3_url),
//       image_author = EXCLUDED.image_author,
//       image_author_url = EXCLUDED.image_author_url
//     RETURNING id
//   `;

//   for (let attempt = 1; attempt <= retries; attempt++) {
//     try {
//       const result = await pool.query(query, [
//         mediaData.post_id,
//         mediaData.type || 'unknown',
//         fileId,
//         mediaData.file_url,
//         mediaData.direct_url,
//         fileSize,
//         mediaData.mime_type,
//         mediaData.width,
//         mediaData.height,
//         mediaData.duration,
//         mediaData.thumbnail_url,
//         mediaData.media_order || 0,
//         s3Url,
//         mediaData.image_author,
//         mediaData.image_author_url,
//       ]);

//       return result.rows.length > 0 ? result.rows[0].id : null;
//     } catch (error) {
//       console.error(`Error saving media (attempt ${attempt}/${retries}):`, error);
//       console.error(`Media data:`, {
//         post_id: mediaData.post_id,
//         file_id: fileId,
//         file_id_type: typeof fileId,
//         file_size: fileSize,
//         file_size_type: typeof fileSize,
//         s3_url: s3Url,
//       });

//       // Если ошибка constraint - попробуем без ON CONFLICT
//       if (error.message.includes('constraint') || error.message.includes('ON CONFLICT')) {
//         console.warn(`Constraint issue detected, trying UPDATE/INSERT separately...`);

//         try {
//           // Сначала пробуем UPDATE
//           const updateQuery = `
//             UPDATE media
//             SET type = $2, file_url = $3, direct_url = $4,
//                 file_size = $5, mime_type = $6, width = $7, height = $8,
//                 duration = $9, thumbnail_url = $10, media_order = $11,
//                 s3_url = COALESCE($12, media.s3_url)
//             WHERE post_id = $1 AND file_id = $13
//             RETURNING id
//           `;

//           const updateResult = await pool.query(updateQuery, [
//             mediaData.post_id,
//             mediaData.type || 'unknown',
//             mediaData.file_url,
//             mediaData.direct_url,
//             fileSize,
//             mediaData.mime_type,
//             mediaData.width,
//             mediaData.height,
//             mediaData.duration,
//             mediaData.thumbnail_url,
//             mediaData.media_order || 0,
//             s3Url,
//             fileId,
//           ]);

//           if (updateResult.rows.length > 0) {
//             console.log('Updated existing media record');
//             return updateResult.rows[0].id;
//           }

//           // Если UPDATE не обновил ничего, делаем INSERT
//           const insertQuery = `
//             INSERT INTO media (
//               post_id, type, file_id, file_url, direct_url, file_size,
//               mime_type, width, height, duration, thumbnail_url, media_order, s3_url
//             )
//             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
//             RETURNING id
//           `;

//           const insertResult = await pool.query(insertQuery, [
//             mediaData.post_id,
//             mediaData.type || 'unknown',
//             fileId,
//             mediaData.file_url,
//             mediaData.direct_url,
//             fileSize,
//             mediaData.mime_type,
//             mediaData.width,
//             mediaData.height,
//             mediaData.duration,
//             mediaData.thumbnail_url,
//             mediaData.media_order || 0,
//             s3Url,
//           ]);

//           console.log('Inserted new media record');
//           return insertResult.rows.length > 0 ? insertResult.rows[0].id : null;
//         } catch (fallbackError) {
//           console.error('Fallback UPDATE/INSERT also failed:', fallbackError.message);
//           return null;
//         }
//       }

//       if (error.message.includes('timeout') || error.message.includes('Connection terminated')) {
//         if (attempt < retries) {
//           console.log(`Retrying in 2 seconds... (${attempt}/${retries})`);
//           await new Promise((resolve) => setTimeout(resolve, 2000));
//           continue;
//         }
//       }

//       return null;
//     }
//   }

//   return null;
// }

async function saveMediaMetadata(mediaData) {
  console.log('💾 Сохраняем медиа:');

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Генерируем ID для медиа
      const mediaId = 'c' + require('crypto').randomBytes(12).toString('hex').slice(0, 24);

      // Проверяем существует ли уже такое медиа
      const checkQuery = `
        SELECT id FROM media 
        WHERE post_id = $1 AND file_id = $2 
        LIMIT 1
      `;

      const checkResult = await pool.query(checkQuery, [mediaData.post_id, mediaData.file_id]);

      if (checkResult.rows.length > 0) {
        // Обновляем существующее медиа
        const updateQuery = `
          UPDATE media 
          SET 
            s3_url = $1,
            file_size = $2,
            file_url = $3,
            direct_url = $4,
            thumbnail_url = $5,
            mime_type = $6,
            width = $7,
            height = $8,
            duration = $9,
            media_order = $10,
            updated_at = NOW()
          WHERE id = $11
        `;

        await pool.query(updateQuery, [
          mediaData.s3_url,
          mediaData.file_size,
          mediaData.file_url,
          mediaData.direct_url,
          mediaData.thumbnail_url,
          mediaData.mime_type,
          mediaData.width,
          mediaData.height,
          mediaData.duration,
          mediaData.media_order || 0,
          checkResult.rows[0].id,
        ]);

        console.log(`✓ Обновлено медиа: ${checkResult.rows[0].id}`);
        return checkResult.rows[0].id;
      } else {
        // Создаем новое медиа
        const insertQuery = `
          INSERT INTO media (
            id,
            post_id,
            file_id,
            s3_url,
            file_size,
            file_url,
            direct_url,
            thumbnail_url,
            mime_type,
            width,
            height,
            duration,
            media_order,
            type,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        `;

        await pool.query(insertQuery, [
          mediaId, // Указываем ID
          mediaData.post_id,
          mediaData.file_id,
          mediaData.s3_url,
          mediaData.file_size,
          mediaData.file_url,
          mediaData.direct_url,
          mediaData.thumbnail_url,
          mediaData.mime_type,
          mediaData.width,
          mediaData.height,
          mediaData.duration,
          mediaData.media_order || 0,
          mediaData.type || 'PHOTO',
        ]);

        console.log(`✓ Создано медиа: ${mediaId}`);
        return mediaId;
      }
    } catch (error) {
      lastError = error;
      console.error(`Error saving media (attempt ${attempt}/${maxRetries}):`, error.message);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Экспоненциальная задержка
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Все попытки провалились
  console.error('Failed to save media after all retries:', lastError.message);
  console.error('Media data:', mediaData);
  throw lastError;
}

/**
 * Сохранить теги поста
 */
// async function savePostTagsOld(postId, tags) {
//   try {
//     await pool.query('BEGIN');

//     const tagIds = [];

//     // 1. Создаём/получаем теги
//     for (const tagName of tags) {
//       const result = await pool.query(
//         `INSERT INTO tags (id, name, slug)
//          VALUES ('c' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 24), $1, $2)
//          ON CONFLICT (name) DO NOTHING
//          RETURNING id`,
//         [tagName, tagName]
//       );
//       tagIds.push(result.rows[0].id);
//     }

//     // 2. Связываем пост с тегами
//     for (const tagId of tagIds) {
//       await pool.query(
//         `INSERT INTO _PostTags (A, B)
//          VALUES ($1, $2)
//          ON CONFLICT DO NOTHING`,
//         [postId, tagId]
//       );
//     }

//     await pool.query('COMMIT');
//     return tagIds.length;
//   } catch (error) {
//     await pool.query('ROLLBACK');
//     throw error;
//   }
// }

async function savePostTags(postId, tags) {
  console.log(`💾 Сохраняем ${tags.length} тегов для поста ${postId}`);

  if (!tags || tags.length === 0) {
    console.log('⚠️ Нет тегов для сохранения');
    return 0;
  }

  try {
    await pool.query('BEGIN');

    const tagIds = [];

    // 1. Создаём/получаем теги
    for (const tagName of tags) {
      const cleanTagName = tagName.replace('#', '').trim();
      if (!cleanTagName) continue;

      // Генерируем slug из имени тега
      const slug = translit(cleanTagName);

      // Сначала проверяем, существует ли тег
      const existingTag = await pool.query('SELECT id FROM tags WHERE name = $1 LIMIT 1', [
        cleanTagName,
      ]);

      let tagId;

      if (existingTag.rows.length > 0) {
        // Тег уже существует
        tagId = existingTag.rows[0].id;
        console.log(`✓ Тег найден: "${cleanTagName}" → ID: ${tagId}`);
      } else {
        // Создаем новый тег
        // Prisma сама сгенерирует CUID, но мы можем передать свой
        tagId = 'c' + require('crypto').randomBytes(12).toString('hex').slice(0, 24);

        // Вставляем тег в таблицу tags
        await pool.query('INSERT INTO tags (id, name, slug) VALUES ($1, $2, $3)', [
          tagId,
          cleanTagName,
          slug || null,
        ]);

        console.log(`✓ Тег создан: "${cleanTagName}" → ID: ${tagId}`);
      }

      tagIds.push(tagId);
    }

    // 2. Связываем пост с тегами через таблицу _PostTags
    if (tagIds.length > 0) {
      console.log(`📊 Создаем связи в таблице _PostTags`);

      for (const tagId of tagIds) {
        try {
          // Используем правильное имя таблицы: "_PostTags" (с большой P)
          await pool.query(
            `INSERT INTO "_PostTags" ("A", "B")
             VALUES ($1, $2)
             ON CONFLICT ("A", "B") DO NOTHING`,
            [postId, tagId]
          );

          console.log(`✓ Связь создана: пост ${postId} ↔ тег ${tagId}`);
        } catch (linkError) {
          console.error(`❌ Ошибка создания связи:`, linkError.message);
          // Можно продолжить с другими тегами
        }
      }
    }

    await pool.query('COMMIT');
    console.log(`✅ Сохранено ${tagIds.length} тегов для поста ${postId}`);
    return tagIds.length;
  } catch (error) {
    console.error('❌ Критическая ошибка в savePostTags:', error.message);
    console.error('Stack trace:', error.stack);
    await pool.query('ROLLBACK');
    throw error;
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
      INSERT INTO regions (id, name, slug, country_id)
      VALUES ('c' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 24), $1, $2, (SELECT id FROM countries WHERE name = $3 LIMIT 1))
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
