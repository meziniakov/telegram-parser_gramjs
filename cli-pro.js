const { parseChannelResumable } = require('./src/parser');
const { createParsingJob, getPendingJob, getJobStats, getChannelJobs } = require('./jobManager');
const { loadProxiesFromFile, ProxyRotator } = require('./proxyManager');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  node src/cli.js <channel> [options]
  
Options:
  --limit <n>       Number of posts to parse (default: 100)
  --batch <n>       Batch size (default: 50)
  --media           Download media to S3
  --resume          Resume previous job
  --proxy <url>     Use proxy (socks5://host:port or http://host:port)
  --proxy-file <f>  Load proxies from file (one per line)
  --stats           Show job statistics
  --list            List all jobs for channel
  
Examples:
  node src/cli.js durov --limit 1000 --batch 100
  node src/cli.js channel --limit 500 --media --resume
  node src/cli.js channel --proxy socks5://user:pass@host:1080
  node src/cli.js channel --proxy-file proxies.txt
  node src/cli.js durov --stats
    `);
    process.exit(0);
  }

  const channelUsername = args[0];
  const options = parseArgs(args.slice(1));

  // Показать статистику
  if (options.stats) {
    const jobs = await getChannelJobs(channelUsername, 20);
    console.log(`\n📊 Jobs for @${channelUsername}:\n`);

    jobs.forEach((job) => {
      console.log(`Job: ${job.job_id}`);
      console.log(`  Status: ${job.status}`);
      console.log(
        `  Progress: ${job.processed_messages}/${job.total_messages} (${job.progress_percentage}%)`
      );
      console.log(`  Duration: ${Math.round(job.duration_seconds)}s`);
      console.log(`  Errors: ${job.error_count}`);
      if (job.last_error) {
        console.log(`  Last error: ${job.last_error}`);
      }
      console.log('');
    });

    process.exit(0);
  }

  // Показать список заданий
  if (options.list) {
    const jobs = await getChannelJobs(channelUsername, 50);
    console.table(
      jobs.map((j) => ({
        job_id: j.job_id,
        status: j.status,
        progress: `${j.processed_messages}/${j.total_messages}`,
        errors: j.error_count,
        started: new Date(j.started_at).toLocaleString(),
      }))
    );
    process.exit(0);
  }

  let job;
  let startFromMessageId = null;

  // Resume или новое задание
  if (options.resume) {
    job = await getPendingJob(channelUsername);

    if (job) {
      console.log(`\n🔄 Resuming job: ${job.job_id}`);
      console.log(`   Progress: ${job.processed_messages}/${job.total_messages}`);
      console.log(`   Resuming from message ID: ${job.next_offset_id}\n`);

      startFromMessageId = job.next_offset_id;
    } else {
      console.log(`\n⚠️  No pending job found for @${channelUsername}`);
      console.log(`   Starting new job...\n`);

      job = await createParsingJob(channelUsername, {
        batchSize: options.batchSize,
        downloadMedia: options.downloadMedia,
        metadata: { proxy: options.proxy },
      });
    }
  } else {
    // Создаем новое задание
    job = await createParsingJob(channelUsername, {
      batchSize: options.batchSize,
      downloadMedia: options.downloadMedia,
      startFromId: options.offset,
      metadata: { proxy: options.proxy },
    });
  }

  // Proxy setup
  let proxy = options.proxy;
  let proxyRotator = null;

  if (options.proxyFile) {
    const proxies = loadProxiesFromFile(options.proxyFile);
    console.log(`\n🔐 Loaded ${proxies.length} proxies from file`);
    proxyRotator = new ProxyRotator(proxies);
    proxy = proxyRotator.getNext();
  }

  try {
    await parseChannelResumable(channelUsername, {
      limit: options.limit,
      offset: options.offset,
      downloadMedia: options.downloadMedia,
      fetchDirectUrls: options.fetchDirectUrls,
      jobId: job.job_id,
      batchSize: options.batchSize,
      startFromMessageId,
      proxy,
    });

    console.log('\n✅ Parsing completed successfully!');

    // Показать финальную статистику
    const stats = await getJobStats(job.job_id);
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Posts parsed: ${stats.processed_messages}`);
    console.log(`   Duration: ${Math.round(stats.duration_seconds)}s`);
    console.log(`   Errors: ${stats.error_count}`);
  } catch (error) {
    console.error('\n❌ Parsing failed:', error.message);

    if (proxyRotator && options.proxyFile) {
      proxyRotator.markFailed(proxy);
      console.log(`\n💡 Tip: Try running with --resume to continue from where it stopped`);
    }

    process.exit(1);
  }
}

function parseArgs(args) {
  const options = {
    limit: 100,
    offset: 0,
    batchSize: 50,
    downloadMedia: false,
    fetchDirectUrls: false,
    resume: false,
    stats: false,
    list: false,
    proxy: null,
    proxyFile: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':
      case '-l':
        options.limit = parseInt(args[++i]);
        break;
      case '--batch':
      case '-b':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--offset':
      case '-o':
        options.offset = parseInt(args[++i]);
        break;
      case '--media':
      case '-m':
        options.downloadMedia = true;
        break;
      case '--direct':
      case '-d':
        options.fetchDirectUrls = true;
        break;
      case '--resume':
      case '-r':
        options.resume = true;
        break;
      case '--stats':
      case '-s':
        options.stats = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--proxy':
      case '-p':
        options.proxy = args[++i];
        break;
      case '--proxy-file':
      case '-pf':
        options.proxyFile = args[++i];
        break;
    }
  }

  return options;
}

main();
