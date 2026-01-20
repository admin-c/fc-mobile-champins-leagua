const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// НАСТРОЙКА CORS - разрешаем все домены
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Разрешаем preflight запросы
app.options('*', cors());

app.use(bodyParser.json());
app.use(express.static(__dirname));

// Анти-кеш заголовки для API
app.use('/api/*', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Файлы базы данных
const DB_FILE = 'db.json';
const NEWS_FILE = 'news.json';
const MATCHES_FILE = 'matches.json';

// Инициализация базы данных
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            teams: [],
            confirmedTeams: [],
            adminPassword: "Ali"
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
    
    if (!fs.existsSync(NEWS_FILE)) {
        const initialNews = {
            news: []
        };
        fs.writeFileSync(NEWS_FILE, JSON.stringify(initialNews, null, 2));
    }
    
    if (!fs.existsSync(MATCHES_FILE)) {
        const initialMatches = {
            upcoming: [],
            live: [],
            completed: []
        };
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(initialMatches, null, 2));
    }
}

// API для получения команд
app.get('/api/teams', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        res.json(data.confirmedTeams);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка чтения данных' });
    }
});

// API для регистрации команды
app.post('/api/register', (req, res) => {
    try {
        const { teamName, ownerName } = req.body;
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        
        // Проверяем, не зарегистрирована ли уже команда
        const existingTeam = data.teams.find(t => 
            t.teamName === teamName || t.ownerName === ownerName
        );
        
        if (existingTeam) {
            res.json({ 
                success: false, 
                error: 'Команда или игрок уже зарегистрированы' 
            });
            return;
        }
        
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
        
        data.teams.push(newTeam);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, message: 'Заявка отправлена на подтверждение' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

// API для админ-панели
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        
        if (password === data.adminPassword) {
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

app.get('/api/admin/pending', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        res.json(data.teams.filter(team => team.status === 'pending'));
    } catch (error) {
        res.status(500).json({ error: 'Ошибка чтения' });
    }
});

app.post('/api/admin/confirm', (req, res) => {
    try {
        const { teamId } = req.body;
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        
        const teamIndex = data.teams.findIndex(t => t.id === teamId);
        if (teamIndex !== -1) {
            data.teams[teamIndex].status = 'confirmed';
            data.confirmedTeams.push(data.teams[teamIndex]);
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
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
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        
        const teamIndex = data.teams.findIndex(t => t.id === teamId);
        if (teamIndex !== -1) {
            data.teams[teamIndex].status = 'rejected';
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// API для обновления счета матча
app.post('/api/admin/update-match', (req, res) => {
    try {
        const { matchId, score1, score2, status } = req.body;
        const matchesData = JSON.parse(fs.readFileSync(MATCHES_FILE));
        const teamsData = JSON.parse(fs.readFileSync(DB_FILE));
        
        let matchFound = false;
        ['upcoming', 'live', 'completed'].forEach(category => {
            const matchIndex = matchesData[category].findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
                matchFound = true;
                const match = matchesData[category][matchIndex];
                
                if (score1 !== undefined) match.score1 = parseInt(score1) || 0;
                if (score2 !== undefined) match.score2 = parseInt(score2) || 0;
                
                if (status && status !== match.status) {
                    match.status = status;
                    
                    if (status === 'completed' && score1 !== undefined && score2 !== undefined) {
                        updateTeamStats(teamsData, match.team1Id, match.team2Id, score1, score2);
                    }
                }
            }
        });
        
        if (matchFound) {
            fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
            fs.writeFileSync(DB_FILE, JSON.stringify(teamsData, null, 2));
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Матч не найден' });
        }
    } catch (error) {
        console.error('Ошибка обновления матча:', error);
        res.status(500).json({ error: 'Ошибка обновления матча' });
    }
});

function updateTeamStats(teamsData, team1Id, team2Id, score1, score2) {
    const team1Index = teamsData.confirmedTeams.findIndex(t => t.id === team1Id);
    const team2Index = teamsData.confirmedTeams.findIndex(t => t.id === team2Id);
    
    if (team1Index === -1 || team2Index === -1) return;
    
    const team1 = teamsData.confirmedTeams[team1Index];
    const team2 = teamsData.confirmedTeams[team2Index];
    
    const s1 = parseInt(score1) || 0;
    const s2 = parseInt(score2) || 0;
    
    // Сбрасываем предыдущие результаты (упрощенная логика)
    // В реальном приложении нужна история матчей
    
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
    
    team1.goalsFor += s1;
    team1.goalsAgainst += s2;
    team2.goalsFor += s2;
    team2.goalsAgainst += s1;
    
    team1.goalDifference = team1.goalsFor - team1.goalsAgainst;
    team2.goalDifference = team2.goalsFor - team2.goalsAgainst;
}

// API для жеребьевки
app.post('/api/admin/draw-tournament', (req, res) => {
    try {
        const teamsData = JSON.parse(fs.readFileSync(DB_FILE));
        const matchesData = JSON.parse(fs.readFileSync(MATCHES_FILE));
        
        const teams = [...teamsData.confirmedTeams];
        if (teams.length < 2) {
            res.json({ success: false, error: 'Нужно минимум 2 команды' });
            return;
        }
        
        const shuffledTeams = [...teams];
        for (let i = shuffledTeams.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
        }
        
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
                    round: 'Тур 1',
                    originalCategory: 'upcoming'
                };
                
                newMatches.push(match);
            }
        }
        
        matchesData.upcoming = newMatches;
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
        
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
        const data = JSON.parse(fs.readFileSync(MATCHES_FILE));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка чтения матчей' });
    }
});

app.post('/api/admin/create-match', (req, res) => {
    try {
        const { team1Id, team2Id, date, time, round } = req.body;
        const matchesData = JSON.parse(fs.readFileSync(MATCHES_FILE));
        const teamsData = JSON.parse(fs.readFileSync(DB_FILE));
        
        const team1 = teamsData.confirmedTeams.find(t => t.id === team1Id);
        const team2 = teamsData.confirmedTeams.find(t => t.id === team2Id);
        
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
            round: round || 'Тур 1',
            originalCategory: 'upcoming'
        };
        
        matchesData.upcoming.push(newMatch);
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
        
        res.json({ success: true, match: newMatch });
    } catch (error) {
        console.error('Ошибка создания матча:', error);
        res.status(500).json({ error: 'Ошибка создания матча' });
    }
});

app.post('/api/admin/delete-match', (req, res) => {
    try {
        const { matchId } = req.body;
        const matchesData = JSON.parse(fs.readFileSync(MATCHES_FILE));
        
        let deleted = false;
        ['upcoming', 'live', 'completed'].forEach(category => {
            const matchIndex = matchesData[category].findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
                matchesData[category].splice(matchIndex, 1);
                deleted = true;
            }
        });
        
        if (deleted) {
            fs.writeFileSync(MATCHES_FILE, JSON.stringify(matchesData, null, 2));
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления матча' });
    }
});

// API для новостей
app.get('/api/news', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(NEWS_FILE));
        res.json(data.news);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка чтения новостей' });
    }
});

app.post('/api/admin/add-news', (req, res) => {
    try {
        const { title, content, imageUrl } = req.body;
        const data = JSON.parse(fs.readFileSync(NEWS_FILE));
        
        const newNews = {
            id: Date.now(),
            title,
            content,
            imageUrl: imageUrl || null,
            date: new Date().toLocaleDateString('ru-RU'),
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        };
        
        data.news.unshift(newNews);
        fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка добавления новости' });
    }
});

app.post('/api/admin/edit-news', (req, res) => {
    try {
        const { id, title, content, imageUrl } = req.body;
        const data = JSON.parse(fs.readFileSync(NEWS_FILE));
        
        const newsIndex = data.news.findIndex(n => n.id === id);
        if (newsIndex !== -1) {
            data.news[newsIndex] = {
                ...data.news[newsIndex],
                title: title || data.news[newsIndex].title,
                content: content || data.news[newsIndex].content,
                imageUrl: imageUrl !== undefined ? imageUrl : data.news[newsIndex].imageUrl
            };
            fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2));
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка редактирования новости' });
    }
});

app.post('/api/admin/delete-news', (req, res) => {
    try {
        const { id } = req.body;
        const data = JSON.parse(fs.readFileSync(NEWS_FILE));
        
        const newsIndex = data.news.findIndex(n => n.id === id);
        if (newsIndex !== -1) {
            data.news.splice(newsIndex, 1);
            fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2));
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления новости' });
    }
});

// ВАЖНО: Отдельный маршрут для админки
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Все остальные маршруты
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// Инициализация и запуск
initDB();
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Доступ по: http://localhost:${PORT}`);
    console.log(`🔧 Админка: http://localhost:${PORT}/admin.html`);
    console.log(`🔑 Пароль админа: Ali`);
});
