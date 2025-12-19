Описание процесса запуска парсинга канала ТГ

# Парсинг большого канала (1000+ постов):
### Первый запуск

```
node cli-pro.js bigchannel --limit 1000 --batch 100 --media
```

### Если прервалось - продолжить
```
node cli-pro.js bigchannel --resume
```

### С загрузкой медиа
```
node cli-pro.js bigchannel --limit 1000 --media --resume
```

# С прокси:
### Один прокси
```
node cli-pro.js channel --proxy socks5://user:pass@host:1080 --limit 500
```

### Ротация прокси из файла
```
node cli-pro.js channel --proxy-file proxies.txt --limit 1000 --resume
```

# Статистика
### Показать статистику
```
node cli-pro.js channel --stats
```

### Список всех заданий
```
node cli-pro.js channel --list
```