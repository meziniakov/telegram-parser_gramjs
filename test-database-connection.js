require('dotenv').config();
const { Pool } = require('pg');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function header(text) {
  console.log('\n' + '═'.repeat(60));
  log(text, 'blue');
  console.log('═'.repeat(60));
}

function success(text) {
  log('✓ ' + text, 'green');
}

function error(text) {
  log('✗ ' + text, 'red');
}

function warning(text) {
  log('⚠ ' + text, 'yellow');
}

function info(text) {
  log('  ' + text, 'gray');
}

// Конфигурации для тестирования
const testConfigs = [
  {
    name: 'From .env file',
    config: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: false,
      connectionTimeoutMillis: 10000,
    }
  }
];

// Тест 1: Проверка переменных окружения
async function testEnvironmentVariables() {
  header('TEST 1: Environment Variables');
  
  const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  let allSet = true;
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      success(`${varName}: ${varName === 'DB_PASSWORD' ? '***SET***' : process.env[varName]}`);
    } else {
      error(`${varName}: NOT SET`);
      allSet = false;
    }
  }
  
  return allSet;
}

// Тест 2: Базовое подключение
async function testBasicConnection(name, config) {
  header(`TEST 2: Basic Connection - ${name}`);
  
  info(`Host: ${config.host}`);
  info(`Port: ${config.port}`);
  info(`Database: ${config.database}`);
  info(`User: ${config.user}`);
  info(`Password: ${config.password ? '***' : 'NOT SET'}`);
  
  const pool = new Pool(config);
  
  try {
    const startTime = Date.now();
    const client = await pool.connect();
    const duration = Date.now() - startTime;
    
    success(`Connected in ${duration}ms`);
    
    client.release();
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Connection failed: ${err.message}`);
    info(`Error code: ${err.code || 'N/A'}`);
    await pool.end();
    return false;
  }
}

// Тест 3: Версия PostgreSQL
async function testPostgresVersion(config) {
  header('TEST 3: PostgreSQL Version');
  
  const pool = new Pool(config);
  
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    
    success('PostgreSQL version:');
    info(result.rows[0].version);
    
    client.release();
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Failed to get version: ${err.message}`);
    await pool.end();
    return false;
  }
}

// Тест 4: Проверка таблиц
async function testTables(config) {
  header('TEST 4: Database Tables');
  
  const pool = new Pool(config);
  
  try {
    const client = await pool.connect();
    
    // Проверяем существующие таблицы
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    const result = await client.query(tablesQuery);
    
    if (result.rows.length === 0) {
      warning('No tables found in database');
    } else {
      success(`Found ${result.rows.length} tables:`);
      result.rows.forEach(row => {
        info(`  - ${row.table_name}`);
      });
    }
    
    // Проверяем нужные таблицы
    const requiredTables = ['posts', 'media_files'];
    const existingTables = result.rows.map(r => r.table_name);
    
    console.log('');
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        success(`Required table '${table}': EXISTS`);
      } else {
        error(`Required table '${table}': MISSING`);
      }
    }
    
    client.release();
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Failed to check tables: ${err.message}`);
    await pool.end();
    return false;
  }
}

// Тест 5: Производительность запросов
async function testQueryPerformance(config) {
  header('TEST 5: Query Performance');
  
  const pool = new Pool({
    ...config,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  try {
    const client = await pool.connect();
    
    // Простой SELECT
    let start = Date.now();
    await client.query('SELECT 1');
    let duration = Date.now() - start;
    success(`Simple SELECT: ${duration}ms`);
    
    // SELECT NOW()
    start = Date.now();
    await client.query('SELECT NOW()');
    duration = Date.now() - start;
    success(`SELECT NOW(): ${duration}ms`);
    
    // Проверка количества записей в posts (если таблица есть)
    try {
      start = Date.now();
      const result = await client.query('SELECT COUNT(*) FROM posts');
      duration = Date.now() - start;
      success(`COUNT(posts): ${result.rows[0].count} rows in ${duration}ms`);
    } catch (err) {
      warning(`Table 'posts' not accessible: ${err.message}`);
    }
    
    client.release();
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Performance test failed: ${err.message}`);
    await pool.end();
    return false;
  }
}

// Тест 6: Множественные подключения
async function testMultipleConnections(config) {
  header('TEST 6: Connection Pool (10 concurrent)');
  
  const pool = new Pool({
    ...config,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  try {
    const startTime = Date.now();
    const promises = [];
    
    // Создаем 10 одновременных запросов
    for (let i = 0; i < 10; i++) {
      promises.push(
        pool.query('SELECT $1::text as id, pg_sleep(0.1)', [`query_${i}`])
      );
    }
    
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    success(`10 concurrent queries completed in ${duration}ms`);
    info(`Average per query: ${Math.round(duration / 10)}ms`);
    info(`Active connections: ${pool.totalCount}`);
    info(`Idle connections: ${pool.idleCount}`);
    
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Concurrent test failed: ${err.message}`);
    await pool.end();
    return false;
  }
}

// Тест 7: Timeout тест
async function testConnectionTimeout(config) {
  header('TEST 7: Connection Timeout Handling');
  
  const pool = new Pool({
    ...config,
    connectionTimeoutMillis: 5000,
    statement_timeout: 3000,
  });
  
  try {
    const client = await pool.connect();
    
    info('Testing short query (1 second)...');
    await client.query('SELECT pg_sleep(1)');
    success('Short query completed');
    
    info('Testing long query (should timeout in 3s)...');
    try {
      await client.query('SELECT pg_sleep(10)');
      warning('Long query did not timeout (unexpected)');
    } catch (err) {
      if (err.message.includes('timeout') || err.message.includes('canceled')) {
        success('Query timeout handled correctly');
      } else {
        throw err;
      }
    }
    
    client.release();
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Timeout test failed: ${err.message}`);
    await pool.end();
    return false;
  }
}

// Тест 8: INSERT/UPDATE операции
async function testWriteOperations(config) {
  header('TEST 8: Write Operations');
  
  const pool = new Pool(config);
  
  try {
    const client = await pool.connect();
    
    // Проверяем, есть ли таблица posts
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'posts'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      warning('Table "posts" does not exist, skipping write test');
      client.release();
      await pool.end();
      return true;
    }
    
    // Тестовая вставка
    const testData = {
      channel_username: 'test_connection',
      message_id: Date.now(),
      text: 'Test connection message',
      date: new Date(),
      views: 0,
      is_ad: false,
      job_id: 'test-' + Date.now()
    };
    
    info('Inserting test record...');
    const insertResult = await client.query(`
      INSERT INTO posts (channel_username, message_id, text, date, views, is_ad, job_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      testData.channel_username,
      testData.message_id,
      testData.text,
      testData.date,
      testData.views,
      testData.is_ad,
      testData.job_id
    ]);
    
    const insertedId = insertResult.rows[0].id;
    success(`Test record inserted with ID: ${insertedId}`);
    
    // Удаляем тестовую запись
    info('Deleting test record...');
    await client.query('DELETE FROM posts WHERE id = $1', [insertedId]);
    success('Test record deleted');
    
    client.release();
    await pool.end();
    return true;
    
  } catch (err) {
    error(`Write operations test failed: ${err.message}`);
    await pool.end();
    return false;
  }
}

// Главная функция
async function runAllTests() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║       PostgreSQL Connection Diagnostic Tool                ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };
  
  // Тест 1: Environment variables
  const envOk = await testEnvironmentVariables();
  if (!envOk) {
    error('\n❌ Environment variables are not set properly!');
    error('Create a .env file in the project root with:');
    info('DB_HOST=your_host');
    info('DB_PORT=5432');
    info('DB_NAME=postgres');
    info('DB_USER=postgres');
    info('DB_PASSWORD=your_password');
    process.exit(1);
  }
  results.passed++;
  
  // Тест 2: Пробуем разные конфигурации
  let workingConfig = null;
  for (const { name, config } of testConfigs) {
    const success = await testBasicConnection(name, config);
    if (success) {
      workingConfig = config;
      results.passed++;
      break;
    } else {
      results.failed++;
    }
  }
  
  if (!workingConfig) {
    error('\n❌ Could not establish connection with any configuration!');
    process.exit(1);
  }
  
  // Остальные тесты с рабочей конфигурацией
  const tests = [
    { name: 'PostgreSQL Version', fn: testPostgresVersion },
    { name: 'Database Tables', fn: testTables },
    { name: 'Query Performance', fn: testQueryPerformance },
    { name: 'Connection Pool', fn: testMultipleConnections },
    { name: 'Timeout Handling', fn: testConnectionTimeout },
    { name: 'Write Operations', fn: testWriteOperations },
  ];
  
  for (const test of tests) {
    try {
      const passed = await test.fn(workingConfig);
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (err) {
      error(`Test "${test.name}" crashed: ${err.message}`);
      results.failed++;
    }
  }
  
  // Итоговый отчет
  header('SUMMARY');
  log(`Tests passed:  ${results.passed}`, 'green');
  log(`Tests failed:  ${results.failed}`, results.failed > 0 ? 'red' : 'gray');
  
  console.log('\n');
  if (results.failed === 0) {
    success('✓✓✓ All tests passed! Database connection is healthy.');
  } else {
    warning(`⚠ ${results.failed} test(s) failed. Check the output above.`);
  }
  
  console.log('\n');
  process.exit(results.failed === 0 ? 0 : 1);
}

// Обработка ошибок
process.on('unhandledRejection', (err) => {
  error('\nUnhandled error:');
  console.error(err);
  process.exit(1);
});

// Запуск
runAllTests().catch((err) => {
  error('\nFatal error:');
  console.error(err);
  process.exit(1);
});
