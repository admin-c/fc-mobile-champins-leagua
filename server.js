const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// 🔐 БЕЗОПАСНОЕ ПОЛУЧЕНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER || 'admin-c'; // ваш username
const REPO_NAME = process.env.REPO_NAME || 'libil-league-data';
const BRANCH = 'main';

// Проверяем наличие токена
if (!GITHUB_TOKEN) {
  console.error('❌ ОШИБКА: GITHUB_TOKEN не установлен!');
  console.log('На Render.com добавьте переменную окружения GITHUB_TOKEN');
}

const githubAPI = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Libil-League-App'
  }
});

// 📁 Локальное кэширование для работы без интернета
let cache = {
  teams: { teams: [], confirmedTeams: [] },
  news: { news: [] },
  matches: { upcoming: [], live: [], completed: [] },
  lastUpdated: {}
};

// 🔄 Синхронизация с GitHub
async function syncWithGitHub(fileName, initialData = {}) {
  try {
    if (!GITHUB_TOKEN) {
      console.log(`⚠️ GitHub токен не настроен, использую локальный кэш для ${fileName}`);
      return cache[fileName] || initialData;
    }

    const response = await githubAPI.get(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileName}`
    );
    
    const content = Buffer.from(response.data.content, 'base64').toString();
    const data = JSON.parse(content);
    
    // Сохраняем в кэш
    cache[fileName] = data;
    cache.lastUpdated[fileName] = Date.now();
    
    console.log(`✅ Данные ${fileName} загружены из GitHub`);
    return data;
    
  } catch (error) {
    if (error.response?.status === 404) {
      // Файл не существует, создаем его
      console.log(`📝 Файл ${fileName} не найден, создаем...`);
      await saveToGitHub(fileName, initialData);
      return initialData;
    }
    
    console.log(`⚠️ Ошибка загрузки ${fileName}: ${error.message}, использую кэш`);
    return cache[fileName] || initialData;
  }
}

// 💾 Сохранение в GitHub
async function saveToGitHub(fileName, data) {
  try {
    if (!GITHUB_TOKEN) {
      console.log(`⚠️ GitHub токен не настроен, сохраняю в локальный кэш: ${fileName}`);
      cache[fileName] = data;
      return { success: true, local: true };
    }

    let sha = null;
    try {
      const currentFile = await githubAPI.get(
        `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileName}`
      );
      sha = currentFile.data.sha;
    } catch (error) {
      // Файла нет, создаем новый
    }
    
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    await githubAPI.put(
      `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileName}`,
      {
        message: `Auto-update ${fileName} at ${new Date().toISOString()}`,
        content: content,
        sha: sha,
        branch: BRANCH
      }
    );
    
    cache[fileName] = data;
    console.log(`✅ Данные ${fileName} сохранены в GitHub`);
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Ошибка сохранения ${fileName}:`, error.message);
    
    // Сохраняем в локальный кэш как fallback
    cache[fileName] = data;
    return { success: false, error: error.message, local: true };
  }
}

// 📊 API endpoints
app.get('/api/teams', async (req, res) => {
  try {
    const data = await syncWithGitHub('teams.json', { teams: [], confirmedTeams: [] });
    res.json(data.confirmedTeams || []);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения команд' });
  }
});

app.get('/api/admin/pending', async (req, res) => {
  try {
    const data = await syncWithGitHub('teams.json', { teams: [], confirmedTeams: [] });
    res.json((data.teams || []).filter(team => team.status === 'pending'));
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения заявок' });
  }
});

// 📝 Регистрация команды
app.post('/api/register', async (req, res) => {
  try {
    const { teamName, ownerName } = req.body;
    
    if (!teamName || !ownerName) {
      return res.json({ success: false, error: 'Заполните все поля' });
    }
    
    const data = await syncWithGitHub('teams.json', { teams: [], confirmedTeams: [] });
    
    const newTeam = {
      id: Date.now(),
      teamName,
      ownerName,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      status: 'pending',
      registrationDate: new Date().toISOString()
    };
    
    data.teams = data.teams || [];
    data.teams.push(newTeam);
    
    const saveResult = await saveToGitHub('teams.json', data);
    
    res.json({ 
      success: true, 
      message: 'Заявка отправлена на подтверждение',
      local: saveResult.local
    });
    
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// ✅ Подтверждение команды
app.post('/api/admin/confirm', async (req, res) => {
  try {
    const { teamId } = req.body;
    const data = await syncWithGitHub('teams.json', { teams: [], confirmedTeams: [] });
    
    const teamIndex = data.teams.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
      data.teams[teamIndex].status = 'confirmed';
      data.confirmedTeams = data.confirmedTeams || [];
      data.confirmedTeams.push(data.teams[teamIndex]);
      
      await saveToGitHub('teams.json', data);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Команда не найдена' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка подтверждения' });
  }
});

// 📰 Новости
app.get('/api/news', async (req, res) => {
  try {
    const data = await syncWithGitHub('news.json', { news: [] });
    res.json(data.news || []);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения новостей' });
  }
});

app.post('/api/admin/add-news', async (req, res) => {
  try {
    const { title, content, imageUrl } = req.body;
    const data = await syncWithGitHub('news.json', { news: [] });
    
    const newNews = {
      id: Date.now(),
      title,
      content,
      imageUrl: imageUrl || null,
      date: new Date().toLocaleDateString('ru-RU'),
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
    
    data.news = data.news || [];
    data.news.unshift(newNews);
    
    await saveToGitHub('news.json', data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка добавления новости' });
  }
});

// ⚽ Матчи
app.get('/api/matches', async (req, res) => {
  try {
    const data = await syncWithGitHub('matches.json', { 
      upcoming: [], 
      live: [], 
      completed: [] 
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения матчей' });
  }
});

// 📊 Информация о состоянии
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    githubConnected: !!GITHUB_TOKEN,
    cacheSize: Object.keys(cache).length,
    lastUpdated: cache.lastUpdated,
    timestamp: new Date().toISOString()
  });
});

// Все остальные маршруты
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 🚀 Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🌐 GitHub подключение: ${GITHUB_TOKEN ? '✅ Настроено' : '❌ Не настроено'}`);
  console.log(`💾 Кэш: ${Object.keys(cache).length} файлов готово`);
  console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
});
