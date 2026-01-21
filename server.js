const express = require('express');
const pg = require('pg');
const redis = require('redis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL подключение
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/libil_league',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Redis подключение
let redisClient;
(async () => {
    redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    
    await redisClient.connect();
    console.log('Connected to Redis');
})();

// Создание таблиц при запуске
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                captain_name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                login VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO admins (login, password_hash) 
            SELECT 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq6L.8OUh5Zr1fzLd2WOQqCfB.wL36'
            WHERE NOT EXISTS (SELECT 1 FROM admins WHERE login = 'admin');
        `);
        console.log('Database initialized');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Генерация JWT токена
function generateToken(payload, expiresIn = '24h') {
    return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', { expiresIn });
}

// Middleware проверки JWT
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Неверный токен' });
    }
}

// API маршруты

// Получить список всех команд (публичный)
app.get('/api/teams', async (req, res) => {
    try {
        const cachedTeams = await redisClient.get('teams:all');
        
        if (cachedTeams) {
            return res.json(JSON.parse(cachedTeams));
        }
        
        const result = await pool.query(
            'SELECT id, name, captain_name, email, phone, created_at FROM teams ORDER BY created_at DESC'
        );
        
        await redisClient.setEx('teams:all', 60, JSON.stringify(result.rows));
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создание новой команды
app.post('/api/teams', async (req, res) => {
    const { name, captain_name, email, phone, password } = req.body;
    
    if (!name || !captain_name || !email) {
        return res.status(400).json({ error: 'Заполните обязательные поля' });
    }
    
    try {
        // Проверка существующей команды с таким именем
        const existingTeam = await pool.query(
            'SELECT id FROM teams WHERE name = $1',
            [name]
        );
        
        if (existingTeam.rows.length > 0) {
            return res.status(400).json({ error: 'Команда с таким названием уже существует' });
        }
        
        // Генерация пароля
        const plainPassword = password || Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        
        // Сохранение в базу данных
        const result = await pool.query(
            `INSERT INTO teams (name, captain_name, email, phone, password_hash) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, name, captain_name, email, phone, created_at`,
            [name, captain_name, email, phone, passwordHash]
        );
        
        // Инвалидация кеша
        await redisClient.del('teams:all');
        
        res.status(201).json({
            id: result.rows[0].id,
            password: plainPassword,
            message: 'Команда успешно создана'
        });
    } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ error: 'Ошибка создания команды' });
    }
});

// Вход команды
app.post('/api/login', async (req, res) => {
    const { teamId, password } = req.body;
    
    if (!teamId || !password) {
        return res.status(400).json({ error: 'Введите ID команды и пароль' });
    }
    
    try {
        const result = await pool.query(
            `SELECT id, name, captain_name, email, password_hash 
             FROM teams WHERE id = $1`,
            [teamId]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Команда не найдена' });
        }
        
        const team = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, team.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
        
        // Создание сессии в Redis
        const sessionId = `session:${Date.now()}:${team.id}`;
        await redisClient.setEx(sessionId, 86400, JSON.stringify({
            teamId: team.id,
            teamName: team.name
        }));
        
        res.json({
            success: true,
            team: {
                id: team.id,
                name: team.name,
                captain_name: team.captain_name,
                email: team.email
            },
            sessionId
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

// Административные маршруты

// Вход администратора
app.post('/api/admin/login', async (req, res) => {
    const { login, password } = req.body;
    
    if (!login || !password) {
        return res.status(400).json({ error: 'Введите логин и пароль' });
    }
    
    try {
        const result = await pool.query(
            'SELECT id, login, password_hash FROM admins WHERE login = $1',
            [login]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        const admin = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        const token = generateToken({ id: admin.id, login: admin.login }, '8h');
        
        res.json({
            success: true,
            token,
            admin: { id: admin.id, login: admin.login }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

// Проверка токена администратора
app.get('/api/admin/verify', verifyToken, (req, res) => {
    res.json({ valid: true, admin: req.user });
});

// Получить все команды (админ)
app.get('/api/admin/teams', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, captain_name, email, phone, created_at FROM teams ORDER BY created_at DESC'
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching teams for admin:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление команды (админ)
app.delete('/api/admin/teams/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM teams WHERE id = $1', [id]);
        
        // Инвалидация кеша
        await redisClient.del('teams:all');
        
        res.json({ success: true, message: 'Команда удалена' });
    } catch (error) {
        console.error('Error deleting team:', error);
        res.status(500).json({ error: 'Ошибка удаления команды' });
    }
});

// Статистика (админ)
app.get('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const totalTeams = await pool.query('SELECT COUNT(*) FROM teams');
        const todayTeams = await pool.query(
            'SELECT COUNT(*) FROM teams WHERE DATE(created_at) = $1',
            [today]
        );
        const lastTeam = await pool.query(
            'SELECT name, created_at FROM teams ORDER BY created_at DESC LIMIT 1'
        );
        
        res.json({
            total: parseInt(totalTeams.rows[0].count),
            today: parseInt(todayTeams.rows[0].count),
            last_registration: lastTeam.rows[0] || null
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Запуск сервера
app.listen(PORT, async () => {
    await initDatabase();
    console.log(`Server running on port ${PORT}`);
});
