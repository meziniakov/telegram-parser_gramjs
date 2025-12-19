const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

/**
 * Создание proxy agent
 * Поддержка форматов:
 * - socks5://user:pass@host:port
 * - socks4://host:port
 * - http://user:pass@host:port
 * - https://host:port
 */
function createProxyAgent(proxyUrl) {
  if (!proxyUrl) {
    return null;
  }

  try {
    const url = new URL(proxyUrl);

    if (url.protocol === 'socks5:' || url.protocol === 'socks4:' || url.protocol === 'socks:') {
      return new SocksProxyAgent(proxyUrl);
    } else if (url.protocol === 'http:' || url.protocol === 'https:') {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      throw new Error(`Unsupported proxy protocol: ${url.protocol}`);
    }
  } catch (error) {
    console.error('Failed to create proxy agent:', error.message);
    throw error;
  }
}

/**
 * Тест прокси
 */
async function testProxy(proxyUrl) {
  const axios = require('axios');
  const agent = createProxyAgent(proxyUrl);

  try {
    const response = await axios.get('https://api.telegram.org', {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: 10000,
    });

    return { success: true, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Получение списка прокси из файла
 */
function loadProxiesFromFile(filePath) {
  const fs = require('fs');

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const proxies = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  return proxies;
}

/**
 * Ротация прокси
 */
class ProxyRotator {
  constructor(proxies) {
    this.proxies = Array.isArray(proxies) ? proxies : [proxies];
    this.currentIndex = 0;
    this.failedProxies = new Set();
  }

  getNext() {
    if (this.proxies.length === 0) {
      return null;
    }

    // Если все прокси failed, сбрасываем
    if (this.failedProxies.size === this.proxies.length) {
      console.warn('All proxies failed, resetting...');
      this.failedProxies.clear();
    }

    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

      if (!this.failedProxies.has(proxy)) {
        return proxy;
      }

      attempts++;
    }

    return this.proxies[0]; // Fallback
  }

  markFailed(proxy) {
    this.failedProxies.add(proxy);
    console.warn(`Proxy marked as failed: ${proxy}`);
  }

  markSuccess(proxy) {
    this.failedProxies.delete(proxy);
  }

  getStats() {
    return {
      total: this.proxies.length,
      failed: this.failedProxies.size,
      active: this.proxies.length - this.failedProxies.size,
    };
  }
}

module.exports = {
  createProxyAgent,
  testProxy,
  loadProxiesFromFile,
  ProxyRotator,
};
