#!/usr/bin/env node

const { SocksClient } = require('socks');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(style, message) {
  console.log(`${colors[style] || ''}${message}${colors.reset}`);
}

function parseProxyUrl(proxyString) {
  try {
    const parsed = new URL(proxyString);
    const socksType = parsed.protocol === 'socks4:' ? 4 : 5;

    return {
      type: socksType,
      host: parsed.hostname,
      port: parseInt(parsed.port),
      userId: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };
  } catch (error) {
    console.log({ error });
    throw new Error(`Invalid proxy URL: ${proxyString}`);
  }
}

async function testProxy(proxyString) {
  log('blue', `\n=== Testing SOCKS Proxy ===\n`);
  log('blue', `Proxy: ${proxyString}`);

  let proxyConfig;
  try {
    proxyConfig = parseProxyUrl(proxyString);
    log('green', `✓ Proxy parsed successfully`);
    console.log(`  Type: SOCKS${proxyConfig.type}`);
    console.log(`  Host: ${proxyConfig.host}`);
    console.log(`  Port: ${proxyConfig.port}`);
    if (proxyConfig.userId) {
      console.log(`  Username: ${proxyConfig.userId}`);
    }
  } catch (error) {
    log('red', `✗ ${error.message}`);
    return false;
  }

  // Тест подключения к Telegram серверу через прокси
  log('blue', `\nTesting connection to Telegram...\n`);

  try {
    const info = await SocksClient.createConnection({
      proxy: {
        type: proxyConfig.type,
        host: proxyConfig.host,
        port: proxyConfig.port,
        userId: proxyConfig.userId,
        password: proxyConfig.password,
      },
      command: 'connect',
      destination: {
        host: '149.154.167.50', // Telegram server
        port: 80,
      },
      timeout: 10000,
    });

    log('green', `✓ Successfully connected through proxy to Telegram!`);
    console.log(`  Socket: ${info.socket.remoteAddress}:${info.socket.remotePort}`);
    info.socket.destroy();
    return true;
  } catch (error) {
    log('red', `✗ Connection failed: ${error.message}`);

    if (error.code === 'ECONNREFUSED') {
      console.log(`\n💡 Possible causes:`);
      console.log(`  • Proxy server is down or unreachable`);
      console.log(`  • Wrong credentials (username/password)`);
      console.log(`  • Credentials have expired`);
      console.log(`  • Your IP is blocked by the proxy`);
      console.log(`  • Wrong host or port`);
    } else if (error instanceof Error && error.message.includes('rejected')) {
      console.log(`\n💡 Possible causes:`);
      console.log(`  • Authentication failed (invalid credentials)`);
      console.log(`  • Proxy rejected your connection`);
      console.log(`  • Wrong SOCKS version (try SOCKS4 instead of SOCKS5)`);
    } else if (error instanceof Error && error.message.includes('timeout')) {
      console.log(`\n💡 Proxy is too slow or unreachable (timeout)`);
    }

    return false;
  }
}

// Получаем прокси из аргумента или переменной окружения
const proxyArg = process.argv[2];

if (!proxyArg) {
  log('red', `\nUsage: node test-proxy.js <proxy-url>`);
  log('yellow', `\nExamples:`);
  console.log(`  node test-proxy.js socks5://user:pass@proxy.com:1080`);
  console.log(`  node test-proxy.js socks4://proxy.com:1080`);
  process.exit(1);
}

testProxy(proxyArg)
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log('red', `\nUnexpected error: ${error.message}`);
    process.exit(1);
  });
