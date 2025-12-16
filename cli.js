const { parseChannel } = require('./src/parser');
require('dotenv').config();

// Парсинг аргументов командной строки
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    channel: null,
    limit: 100,
    offset: 0,
    downloadMedia: false,
    fetchDirectUrls: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-c':
      case '--channel':
        options.channel = args[++i];
        break;
      case '-l':
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '-o':
      case '--offset':
        options.offset = parseInt(args[++i]);
        break;
      case '-m':
      case '--media':
        options.downloadMedia = true;
        break;
      case '-d':
      case '--direct-urls':
        options.fetchDirectUrls = true;
        break;
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;
      default:
        if (!options.channel && !args[i].startsWith('-')) {
          options.channel = args[i];
        }
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Telegram Channel Parser CLI

Usage:
  node src/cli.js <channel> [options]
  npm run parse -- <channel> [options]

Arguments:
  channel                Channel username (without @)

Options:
  -c, --channel <name>   Channel username
  -l, --limit <number>   Number of messages to parse (default: 100)
  -o, --offset <id>      Start from message ID (default: 0)
  -m, --media           Download media files (default: false)
  -d, --direct-urls     Fetch direct URLs via web scraping (default: false)
  -h, --help            Show this help message

Examples:
  node src/cli.js durov
  node src/cli.js durov --limit 50
  node src/cli.js --channel durov --limit 200 --direct-urls
  npm run parse -- durov --limit 50

Environment Variables:
  TELEGRAM_API_ID       Your Telegram API ID
  TELEGRAM_API_HASH     Your Telegram API hash
  TELEGRAM_SESSION      Your session string
  DB_HOST               Database host
  DB_PORT               Database port
  DB_NAME               Database name
  DB_USER               Database user
  DB_PASSWORD           Database password
  `);
}

async function main() {
  const options = parseArgs();

  if (!options.channel) {
    console.error('❌ Error: Channel username is required\n');
    showHelp();
    process.exit(1);
  }

  // Проверка переменных окружения
  const requiredEnvVars = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_SESSION'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.error(`❌ Error: Missing environment variables: ${missingVars.join(', ')}`);
    console.error('Create a .env file or set these variables\n');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Telegram Channel Parser CLI                  ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  console.log('Configuration:');
  console.log(`  Channel:       @${options.channel}`);
  console.log(`  Limit:         ${options.limit} messages`);
  console.log(`  Offset:        ${options.offset}`);
  console.log(`  Download media: ${options.downloadMedia ? 'Yes' : 'No'}`);
  console.log(`  Direct URLs:   ${options.fetchDirectUrls ? 'Yes' : 'No'}`);
  console.log('');

  const jobId = `cli-${Date.now()}`;

  try {
    console.log('🚀 Starting parser...\n');
    
    const result = await parseChannel(
      options.channel,
      options.limit,
      options.offset,
      options.downloadMedia,
      jobId,
      options.fetchDirectUrls
    );

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   ✓ Parsing completed successfully!           ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    console.log('Results:');
    console.log(`  Posts saved:      ${result.parsed}`);
    console.log(`  Media metadata:   ${result.media_metadata || 0}`);
    console.log(`  Job ID:           ${result.job_id}`);
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════╗');
    console.error('║   ❌ Parsing failed!                           ║');
    console.error('╚════════════════════════════════════════════════╝\n');
    
    console.error('Error:', error.message);
    
    if (error.errorMessage) {
      console.error('Telegram Error:', error.errorMessage);
    }
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Обработка Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted by user. Exiting...');
  process.exit(130);
});

// Запуск
main();
