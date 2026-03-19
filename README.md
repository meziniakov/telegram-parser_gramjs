Описание процесса запуска парсинга канала ТГ

# Парсинг большого канала (1000+ постов):

```
node cli-pro.js viewrussia --limit 100 --media --minId 28599 --proxy socks5://login:passCgHwY@163.198.111.174:8111
```

### Первый запуск

```
node cli-pro.js viewrussia --limit 1000 --media --batch 100
```

### Если прервалось - продолжить

```
node cli-pro.js viewrussia --resume --m
```

### С загрузкой медиа

```
node cli-pro.js viewrussia --limit 1000 --media --resume
```

# С прокси:

### Один прокси

```
node cli-pro.js channel --proxy socks5://Fb1DPE:N8mQCD@45.148.246.231:8000 --limit 500
node cli-pro.js viewrussia --limit 10 --media --minId 28599 --proxy socks5://195.190.121.154:1080
node cli-pro.js viewrussia --limit 10 --media --minId 28599 --proxy-file proxies.txt
```

minId

### Ротация прокси из файла

```
node cli-pro.js channel --proxy-file proxies.txt --limit 1000 --resume
```

# Статистика

### Показать статистику

```
node cli-pro.js viewrussia --stats
```

### Список всех заданий

```
node cli-pro.js viewrussia --list
```
