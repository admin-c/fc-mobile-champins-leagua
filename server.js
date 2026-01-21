const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Анти-кеш заголовки
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Хранение данных в памяти (работает на Render.com)
let database = {
  teams: [],
  confirmedTeams: [],
  adminPassword: "Ali"
};

let news = [];
let matches = {
  upcoming: [],
  live: [],
  completed: []
};

// API для получения команд
app.get('/api/teams', (req, res) => {
  try {
    res.json(database.confirmedTeams);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения данных' });
  }
});

// API для регистрации команды
app.post('/api/register', (req, res) => {
  try {
    const { teamName, ownerName } = req.body;
    
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
    
    database.teams.push(newTeam);
    
    // Логируем в консоль Render.com
    console.log(`✅ Новая заявка: ${teamName} (${ownerName})`);
    console.log(`📊 Всего заявок: ${database.teams.length}`);
    
    res.json({ success: true, message: 'Заявка отправлена на подтверждение' });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// API для админ-панели
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === database.adminPassword) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.get('/api/admin/pending', (req, res) => {
  try {
    res.json(database.teams.filter(team => team.status === 'pending'));
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения' });
  }
});

app.post('/api/admin/confirm', (req, res) => {
  try {
    const { teamId } = req.body;
    
    const teamIndex = database.teams.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
      database.teams[teamIndex].status = 'confirmed';
      database.confirmedTeams.push(database.teams[teamIndex]);
      console.log(`✅ Команда подтверждена: ${database.teams[teamIndex].teamName}`);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/api/admin/reject', (req, res) => {
  try {
    const { teamId } = req.body;
    
    const teamIndex = database.teams.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
      console.log(`❌ Заявка отклонена: ${database.teams[teamIndex].teamName}`);
      database.teams[teamIndex].status = 'rejected';
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// API для обновления результатов команды
app.post('/api/admin/update-results', (req, res) => {
  try {
    const { teamId, points, wins, draws, losses, goalsFor, goalsAgainst } = req.body;
    
    const teamIndex = database.confirmedTeams.findIndex(t => t.id === teamId);
    if (teamIndex !== -1) {
      const team = database.confirmedTeams[teamIndex];
      
      team.points = points !== undefined ? parseInt(points) : team.points;
      team.wins = wins !== undefined ? parseInt(wins) : team.wins;
      team.draws = draws !== undefined ? parseInt(draws) : team.draws;
      team.losses = losses !== undefined ? parseInt(losses) : team.losses;
      team.goalsFor = goalsFor !== undefined ? parseInt(goalsFor) : team.goalsFor;
      team.goalsAgainst = goalsAgainst !== undefined ? parseInt(goalsAgainst) : team.goalsAgainst;
      
      team.played = team.wins + team.draws + team.losses;
      team.goalDifference = team.goalsFor - team.goalsAgainst;
      
      console.log(`📊 Обновлена статистика: ${team.teamName}`);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Команда не найдена' });
    }
  } catch (error) {
    console.error('Ошибка обновления результатов:', error);
    res.status(500).json({ error: 'Ошибка обновления результатов' });
  }
});

// API для обновления матча
app.post('/api/admin/update-match', (req, res) => {
  try {
    const { matchId, score1, score2, status } = req.body;
    
    let matchFound = false;
    let matchToUpdate = null;
    let originalCategory = null;
    
    // Ищем матч
    ['upcoming', 'live', 'completed'].forEach(category => {
      const matchIndex = matches[category].findIndex(m => m.id === matchId);
      if (matchIndex !== -1) {
        matchFound = true;
        matchToUpdate = matches[category][matchIndex];
        originalCategory = category;
      }
    });
    
    if (!matchFound) {
      res.json({ success: false, error: 'Матч не найден' });
      return;
    }
    
    // Обновляем счет
    if (score1 !== undefined) matchToUpdate.score1 = parseInt(score1) || 0;
    if (score2 !== undefined) matchToUpdate.score2 = parseInt(score2) || 0;
    
    // Если статус изменен
    if (status && status !== matchToUpdate.status) {
      // Удаляем из старой категории
      ['upcoming', 'live', 'completed'].forEach(category => {
        const matchIndex = matches[category].findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          matches[category].splice(matchIndex, 1);
        }
      });
      
      // Добавляем в новую
      matchToUpdate.status = status;
      matches[status].push(matchToUpdate);
      
      // Если матч завершен - обновляем статистику
      if (status === 'completed') {
        updateTeamStats(matchToUpdate.team1Id, matchToUpdate.team2Id, 
          matchToUpdate.score1, matchToUpdate.score2);
      }
    }
    
    console.log(`⚽ Обновлен матч: ${matchToUpdate.team1Name} vs ${matchToUpdate.team2Name}`);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Ошибка обновления матча:', error);
    res.status(500).json({ error: 'Ошибка обновления матча' });
  }
});

// Функция обновления статистики команд
function updateTeamStats(team1Id, team2Id, score1, score2) {
  const team1Index = database.confirmedTeams.findIndex(t => t.id === team1Id);
  const team2Index = database.confirmedTeams.findIndex(t => t.id === team2Id);
  
  if (team1Index === -1 || team2Index === -1) return;
  
  const team1 = database.confirmedTeams[team1Index];
  const team2 = database.confirmedTeams[team2Index];
  
  const s1 = parseInt(score1) || 0;
  const s2 = parseInt(score2) || 0;
  
  console.log(`📈 Обновление статистики: ${team1.teamName} ${s1}:${s2} ${team2.teamName}`);
  
  // Обновляем голы
  team1.goalsFor += s1;
  team1.goalsAgainst += s2;
  team2.goalsFor += s2;
  team2.goalsAgainst += s1;
  
  // Результат
  if (s1 > s2) {
    team1.wins += 1;
    team1.points += 3;
    team2.losses += 1;
  } else if (s1 < s2) {
    team2.wins += 1;
    team2.points += 3;
    team1.losses += 1;
  } else {
    team1.draws += 1;
    team2.draws += 1;
    team1.points += 1;
    team2.points += 1;
  }
  
  team1.played = team1.wins + team1.draws + team1.losses;
  team2.played = team2.wins + team2.draws + team2.losses;
  
  team1.goalDifference = team1.goalsFor - team1.goalsAgainst;
  team2.goalDifference = team2.goalsFor - team2.goalsAgainst;
}

// API для жеребьевки
app.post('/api/admin/draw-tournament', (req, res) => {
  try {
    const teams = [...database.confirmedTeams];
    if (teams.length < 2) {
      res.json({ success: false, error: 'Нужно минимум 2 команды для жеребьевки' });
      return;
    }
    
    // Перемешиваем
    const shuffledTeams = [...teams];
    for (let i = shuffledTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
    }
    
    // Создаем матчи
    const newMatches = [];
    const matchDate = new Date();
    
    for (let i = 0; i < shuffledTeams.length; i += 2) {
      if (i + 1 < shuffledTeams.length) {
        const team1 = shuffledTeams[i];
        const team2 = shuffledTeams[i + 1];
        
        const match = {
          id: Date.now() + i,
          team1Id: team1.id,
          team1Name: team1.teamName,
          team2Id: team2.id,
          team2Name: team2.teamName,
          date: matchDate.toLocaleDateString('ru-RU'),
          time: '20:00',
          score1: 0,
          score2: 0,
          status: 'upcoming',
          round: 'Тур 1'
        };
        
        newMatches.push(match);
      }
    }
    
    // Заменяем upcoming матчи
    matches.upcoming = newMatches;
    
    console.log(`🎲 Жеребьевка проведена! Создано ${newMatches.length} матчей`);
    res.json({ 
      success: true, 
      message: `Жеребьевка проведена! Создано ${newMatches.length} матчей.`,
      matches: newMatches 
    });
    
  } catch (error) {
    console.error('Ошибка жеребьевки:', error);
    res.status(500).json({ error: 'Ошибка жеребьевки' });
  }
});

// API для матчей
app.get('/api/matches', (req, res) => {
  try {
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения матчей' });
  }
});

app.post('/api/admin/create-match', (req, res) => {
  try {
    const { team1Id, team2Id, date, time, round } = req.body;
    
    const team1 = database.confirmedTeams.find(t => t.id === team1Id);
    const team2 = database.confirmedTeams.find(t => t.id === team2Id);
    
    if (!team1 || !team2) {
      res.json({ success: false, error: 'Команды не найдены' });
      return;
    }
    
    const newMatch = {
      id: Date.now(),
      team1Id,
      team1Name: team1.teamName,
      team2Id,
      team2Name: team2.teamName,
      date: date || new Date().toLocaleDateString('ru-RU'),
      time: time || '20:00',
      score1: 0,
      score2: 0,
      status: 'upcoming',
      round: round || 'Тур 1'
    };
    
    matches.upcoming.push(newMatch);
    console.log(`➕ Создан матч: ${team1.teamName} vs ${team2.teamName}`);
    res.json({ success: true, match: newMatch });
  } catch (error) {
    console.error('Ошибка создания матча:', error);
    res.status(500).json({ error: 'Ошибка создания матча' });
  }
});

app.post('/api/admin/delete-match', (req, res) => {
  try {
    const { matchId } = req.body;
    
    let deleted = false;
    ['upcoming', 'live', 'completed'].forEach(category => {
      const matchIndex = matches[category].findIndex(m => m.id === matchId);
      if (matchIndex !== -1) {
        const match = matches[category][matchIndex];
        console.log(`🗑️ Удален матч: ${match.team1Name} vs ${match.team2Name}`);
        matches[category].splice(matchIndex, 1);
        deleted = true;
      }
    });
    
    if (deleted) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Матч не найден' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления матча' });
  }
});

// API для новостей
app.get('/api/news', (req, res) => {
  try {
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка чтения новостей' });
  }
});

app.post('/api/admin/add-news', (req, res) => {
  try {
    const { title, content, imageUrl } = req.body;
    
    if (!title || !content) {
      res.json({ success: false, error: 'Заполните заголовок и текст' });
      return;
    }
    
    const newNews = {
      id: Date.now(),
      title,
      content,
      imageUrl: imageUrl || null,
      date: new Date().toLocaleDateString('ru-RU'),
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
    
    news.unshift(newNews); // Добавляем в начало
    
    console.log(`📰 Добавлена новость: "${title}"`);
    console.log(`📊 Всего новостей: ${news.length}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка добавления новости:', error);
    res.status(500).json({ error: 'Ошибка добавления новости' });
  }
});

app.post('/api/admin/edit-news', (req, res) => {
  try {
    const { id, title, content, imageUrl } = req.body;
    
    const newsIndex = news.findIndex(n => n.id === id);
    if (newsIndex !== -1) {
      news[newsIndex] = {
        ...news[newsIndex],
        title: title || news[newsIndex].title,
        content: content || news[newsIndex].content,
        imageUrl: imageUrl !== undefined ? imageUrl : news[newsIndex].imageUrl
      };
      
      console.log(`✏️ Обновлена новость ID ${id}`);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Новость не найдена' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка редактирования новости' });
  }
});

app.post('/api/admin/delete-news', (req, res) => {
  try {
    const { id } = req.body;
    
    const newsIndex = news.findIndex(n => n.id === id);
    if (newsIndex !== -1) {
      console.log(`🗑️ Удалена новость: "${news[newsIndex].title}"`);
      news.splice(newsIndex, 1);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Новость не найдена' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления новости' });
  }
});

// Инициализация начальных данных
function initData() {
  // Добавляем тестовые данные если пусто
  if (database.confirmedTeams.length === 0) {
    database.confirmedTeams.push({
      id: 1,
      teamName: "Пример команды",
      ownerName: "Админ",
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      status: 'confirmed',
      registrationDate: new Date().toISOString()
    });
  }
  
  if (news.length === 0) {
    news.push({
      id: 1,
      title: "Добро пожаловать в ЛЪибилскую Лигу!",
      content: "Турнир по FC Mobile начинается 24 января 2026 года. Регистрируйте свои команды!",
      imageUrl: null,
      date: new Date().toLocaleDateString('ru-RU'),
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    });
  }
  
  console.log('📊 Инициализированы начальные данные');
  console.log(`👥 Команд: ${database.confirmedTeams.length}`);
  console.log(`📰 Новостей: ${news.length}`);
  console.log(`⚽ Матчей: ${matches.upcoming.length + matches.live.length + matches.completed.length}`);
}

// Все остальные маршруты
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
initData();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Сайт: https://fc-mobile-dido-league.onrender.com`);
  console.log(`🔐 Админка: https://fc-mobile-dido-league.onrender.com/admin.html (пароль: Ali)`);
  console.log(`📊 API команд: https://fc-mobile-dido-league.onrender.com/api/teams`);
  console.log(`📰 API новостей: https://fc-mobile-dido-league.onrender.com/api/news`);
});
