// ⚠️ ВСТАВЬТЕ ВАШ API СЮДА
const API_BASE = 'https://ваше-приложение.onrender.com/api';

let deferredPrompt;

// Обработчик для PWA установки
window.addEventListener('beforeinstallprompt', (e) => {
    // Предотвращаем автоматический показ баннера
    e.preventDefault();
    deferredPrompt = e;
    
    // Показываем нашу кнопку установки
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.style.display = 'flex';
        installBtn.addEventListener('click', installPWA);
    }
    
    // Также показываем на других страницах
    setTimeout(() => {
        document.querySelectorAll('.install-btn').forEach(btn => {
            if (btn.id !== 'installBtn') {
                btn.style.display = 'flex';
                btn.addEventListener('click', installPWA);
            }
        });
    }, 1000);
});

// Функция установки PWA
async function installPWA() {
    if (!deferredPrompt) {
        alert('Установка уже доступна через меню браузера');
        return;
    }
    
    deferredPrompt.prompt();
    
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        console.log('Пользователь принял установку PWA');
        // Скрываем все кнопки установки
        document.querySelectorAll('.install-btn').forEach(btn => {
            btn.style.display = 'none';
        });
    } else {
        console.log('Пользователь отклонил установку PWA');
    }
    
    deferredPrompt = null;
}

// Проверка, если PWA уже установлено
window.addEventListener('appinstalled', () => {
    console.log('PWA успешно установлено');
    deferredPrompt = null;
    document.querySelectorAll('.install-btn').forEach(btn => {
        btn.style.display = 'none';
    });
});

// Частицы для фона
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        particle.style.width = Math.random() * 4 + 1 + 'px';
        particle.style.height = particle.style.width;
        particle.style.background = 'rgba(255, 215, 0, 0.3)';
        particle.style.borderRadius = '50%';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animation = `float ${Math.random() * 10 + 10}s linear infinite`;
        
        container.appendChild(particle);
    }
}

// CSS для анимации частиц
if (!document.querySelector('#particles-style')) {
    const style = document.createElement('style');
    style.id = 'particles-style';
    style.textContent = `
        @keyframes float {
            0% { transform: translateY(0) rotate(0deg); opacity: 0.3; }
            100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Регистрация команды
document.addEventListener('DOMContentLoaded', function() {
    createParticles();
    
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', registerTeam);
    }
    
    // Загрузка новостей на главной странице
    if (document.getElementById('newsContainer')) {
        loadNews();
    }
    
    // Загрузка таблицы
    if (document.getElementById('tableBody')) {
        loadTable();
        setupTableSorting();
    }
    
    // Загрузка пользователя в main.html
    if (window.location.pathname.includes('main.html')) {
        loadUserInfo();
    }
});

// Регистрация команды
async function registerTeam() {
    const teamName = document.getElementById('teamName').value.trim();
    const ownerName = document.getElementById('ownerName').value.trim();
    
    if (!teamName || !ownerName) {
        showAlert('Заполните все поля!', 'error');
        return;
    }
    
    if (teamName.length < 3 || ownerName.length < 2) {
        showAlert('Название команды минимум 3 символа, никнейм минимум 2 символа!', 'error');
        return;
    }
    
    const registerBtn = document.getElementById('registerBtn');
    const originalText = registerBtn.innerHTML;
    registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Отправка...</span>';
    registerBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ teamName, ownerName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('✅ Заявка успешно отправлена! Ожидайте подтверждения админом.', 'success');
            
            // Сохраняем информацию о команде в localStorage
            localStorage.setItem('userTeam', teamName);
            localStorage.setItem('ownerName', ownerName);
            
            // Очищаем поля
            document.getElementById('teamName').value = '';
            document.getElementById('ownerName').value = '';
            
            // Фокус на первое поле
            document.getElementById('teamName').focus();
            
            // Показываем кнопку перехода в меню через 2 секунды
            setTimeout(() => {
                const alreadyBtn = document.querySelector('.already-btn');
                if (alreadyBtn) {
                    alreadyBtn.style.display = 'flex';
                }
            }, 2000);
            
        } else {
            showAlert('❌ Ошибка регистрации: ' + (data.error || 'Неизвестная ошибка'), 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showAlert('❌ Ошибка соединения с сервером. Проверьте интернет.', 'error');
    } finally {
        registerBtn.innerHTML = originalText;
        registerBtn.disabled = false;
    }
}

// Загрузка новостей
async function loadNews() {
    try {
        const response = await fetch(`${API_BASE}/news`);
        const news = await response.json();
        
        const container = document.getElementById('newsContainer');
        if (!container) return;
        
        if (news.length === 0) {
            container.innerHTML = `
                <div class="glass-effect" style="text-align: center; padding: 40px;">
                    <i class="fas fa-newspaper" style="font-size: 48px; color: var(--accent); margin-bottom: 20px;"></i>
                    <h3>Новостей пока нет</h3>
                    <p>Следите за обновлениями!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = news.slice(0, 5).map(item => `
            <div class="news-item glass-effect">
                ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}" class="news-image" loading="lazy">` : ''}
                <h3>${item.title}</h3>
                <p>${item.content}</p>
                <div class="news-meta">
                    <span><i class="far fa-calendar"></i> ${item.date}</span>
                    <span><i class="far fa-clock"></i> ${item.time}</span>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
        const container = document.getElementById('newsContainer');
        if (container) {
            container.innerHTML = `
                <div class="glass-effect" style="text-align: center; padding: 40px; color: #ff6b6b;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <h3>Ошибка загрузки новостей</h3>
                    <p>Попробуйте обновить страницу</p>
                </div>
            `;
        }
    }
}

// Загрузка таблицы
async function loadTable() {
    try {
        const response = await fetch(`${API_BASE}/teams`);
        const teams = await response.json();
        
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        if (teams.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 40px;">
                        <i class="fas fa-users" style="font-size: 48px; color: var(--accent); margin-bottom: 20px; display: block;"></i>
                        <h3>Команд пока нет</h3>
                        <p>Будьте первыми!</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Сортируем по очкам, разнице мячей, забитым мячам
        teams.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
            return b.goalsFor - a.goalsFor;
        });
        
        tbody.innerHTML = teams.map((team, index) => {
            const goalDifference = team.goalsFor - team.goalsAgainst;
            
            return `
                <tr>
                    <td class="position-cell">
                        <strong>${index + 1}</strong>
                    </td>
                    <td class="team-name-cell">
                        <strong>${team.teamName}</strong>
                        <br>
                        <small>${team.ownerName}</small>
                    </td>
                    <td>${team.played}</td>
                    <td>${team.wins}</td>
                    <td>${team.draws}</td>
                    <td>${team.losses}</td>
                    <td>${team.goalsFor}</td>
                    <td>${team.goalsAgainst}</td>
                    <td class="${goalDifference >= 0 ? 'positive' : 'negative'}">
                        ${goalDifference > 0 ? '+' : ''}${goalDifference}
                    </td>
                    <td><strong class="points">${team.points}</strong></td>
                </tr>
            `;
        }).join('');
        
        // Добавляем стили для позиций
        if (!document.querySelector('#table-styles')) {
            const style = document.createElement('style');
            style.id = 'table-styles';
            style.textContent = `
                .team-name-cell { text-align: left; padding-left: 20px; }
                .positive { color: #27ae60; font-weight: 700; }
                .negative { color: #e74c3c; font-weight: 700; }
                .points { color: var(--secondary); }
            `;
            document.head.appendChild(style);
        }
        
    } catch (error) {
        console.error('Ошибка загрузки таблицы:', error);
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 40px; color: #ff6b6b;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
                        <h3>Ошибка загрузки таблицы</h3>
                        <p>Попробуйте обновить страницу</p>
                    </td>
                </tr>
            `;
        }
    }
}

function setupTableSorting() {
    const sortButtons = document.querySelectorAll('.sort-btn');
    sortButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            sortButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // В этом упрощенном варианте просто перезагружаем таблицу
            loadTable();
        });
    });
    
    // Поиск команд
    const searchInput = document.getElementById('searchTeam');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#tableBody tr');
            
            rows.forEach(row => {
                const teamName = row.querySelector('.team-name-cell')?.textContent.toLowerCase() || '';
                if (teamName.includes(searchTerm) || searchTerm === '') {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
}

// Загрузка информации пользователя
function loadUserInfo() {
    const userTeam = localStorage.getItem('userTeam') || 'Не зарегистрирован';
    const userElement = document.getElementById('userTeam');
    
    if (userElement) {
        userElement.textContent = userTeam;
        
        // Если пользователь зарегистрирован, показываем приветствие
        if (userTeam !== 'Не зарегистрирован') {
            const ownerName = localStorage.getItem('ownerName') || '';
            setTimeout(() => {
                showAlert(`👋 Добро пожаловать, ${ownerName}! Ваша команда: ${userTeam}`, 'info', 5000);
            }, 1000);
        }
    }
}

// Универсальная функция показа уведомлений
function showAlert(message, type = 'info', duration = 4000) {
    // Удаляем старые уведомления
    const oldAlert = document.querySelector('.custom-alert');
    if (oldAlert) oldAlert.remove();
    
    // Создаем новое уведомление
    const alert = document.createElement('div');
    alert.className = `custom-alert alert-${type}`;
    alert.innerHTML = `
        <div class="alert-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'exclamation-circle' : 
                              type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="alert-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Добавляем стили если их нет
    if (!document.querySelector('#alert-styles')) {
        const style = document.createElement('style');
        style.id = 'alert-styles';
        style.textContent = `
            .custom-alert {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                min-width: 300px;
                max-width: 90%;
                background: var(--dark);
                border-radius: var(--radius-sm);
                padding: 16px;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
                border-left: 4px solid;
                animation: slideIn 0.3s ease;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .alert-success { border-left-color: #27ae60; }
            .alert-error { border-left-color: #e74c3c; }
            .alert-warning { border-left-color: #f39c12; }
            .alert-info { border-left-color: var(--accent); }
            
            .alert-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .alert-content i {
                font-size: 1.2rem;
            }
            
            .alert-success .alert-content i { color: #27ae60; }
            .alert-error .alert-content i { color: #e74c3c; }
            .alert-warning .alert-content i { color: #f39c12; }
            .alert-info .alert-content i { color: var(--accent); }
            
            .alert-content span {
                flex: 1;
                font-size: 0.95rem;
            }
            
            .alert-close {
                background: transparent;
                border: none;
                color: rgba(255, 255, 255, 0.7);
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s ease;
            }
            
            .alert-close:hover {
                color: white;
                background: rgba(255, 255, 255, 0.1);
            }
            
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            @media (max-width: 768px) {
                .custom-alert {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(alert);
    
    // Автоматическое скрытие
    if (duration > 0) {
        setTimeout(() => {
            if (alert.parentElement) {
                alert.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => {
                    if (alert.parentElement) {
                        alert.remove();
                    }
                }, 300);
            }
        }, duration);
    }
}

// Функция для проверки подключения
function checkConnection() {
    if (!navigator.onLine) {
        showAlert('📶 Нет подключения к интернету. Некоторые функции могут не работать.', 'warning', 0);
    }
}

// Инициализация проверки соединения
window.addEventListener('online', () => {
    showAlert('✅ Подключение восстановлено!', 'success');
    // Перезагружаем данные
    if (document.getElementById('tableBody')) loadTable();
    if (document.getElementById('newsContainer')) loadNews();
});

window.addEventListener('offline', () => {
    showAlert('📶 Потеряно подключение к интернету', 'error', 0);
});

// Проверяем при загрузке
document.addEventListener('DOMContentLoaded', checkConnection);

// Функция для обновления данных каждые 30 секунд
function startAutoRefresh() {
    setInterval(() => {
        if (document.getElementById('tableBody') && navigator.onLine) {
            loadTable();
        }
    }, 30000);
}

// Запускаем автообновление на страницах где нужно
if (document.getElementById('tableBody') || document.getElementById('newsContainer')) {
    startAutoRefresh();
}

// Service Worker регистрация
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker зарегистрирован:', registration.scope);
            })
            .catch(error => {
                console.log('Ошибка регистрации Service Worker:', error);
            });
    });
}
