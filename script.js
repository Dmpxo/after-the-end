const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const inputSection = document.getElementById('input-section');
const finalWordsInput = document.getElementById('final-words');
const resultSection = document.getElementById('result-section');
const resetBtn = document.getElementById('reset-btn');

let width, height;
const stars = [];
const particles = [];
const ripples = []; 
let animationId;

// Configuration
const STAR_COUNT = 200;
const PARTICLE_SAMPLE_STEP = 2; // Pixel sampling frequency
const SOUL_COLORS = ['#9370db', '#8a2be2', '#4b0082', '#6a5acd']; // Blue-purple palette

class Star {
    constructor(isNew = false) {
        this.init(isNew);
        this.phase = Math.random() * Math.PI * 2; // Unique phase for individual twinkling
    }

    init(isNew) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 1.2 + 0.5;
        this.baseOpacity = Math.random() * 0.5 + 0.2;
        this.opacity = isNew ? 0 : this.baseOpacity;
        this.driftX = (Math.random() - 0.5) * 0.15;
        this.driftY = (Math.random() - 0.5) * 0.15;
        this.pulseSpeed = Math.random() * 0.02 + 0.005;
    }

    update(globalPulse) {
        this.x += this.driftX;
        this.y += this.driftY;

        // Individual twinkle synced with global pulse for "breathing" feel
        this.phase += this.pulseSpeed;
        this.opacity = this.baseOpacity * (0.7 + 0.3 * Math.sin(this.phase + globalPulse));

        // Wrap around screen
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
    }

    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, this.opacity)})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

class TextParticle {
    constructor(x, y) {
        this.originX = x;
        this.originY = y;
        this.x = x;
        this.y = y;

        // Random soul color
        this.color = SOUL_COLORS[Math.floor(Math.random() * SOUL_COLORS.length)];
        this.size = Math.random() * 2 + 1;

        // Dispersal physics
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4 - 2; // Drift upward more
        this.friction = 0.98;
        this.gravity = -0.01; // Slight smoke rise

        this.opacity = 1;
        this.state = 'text'; // 'text' or 'dispersing'
        this.life = 1;
    }

    disperse() {
        this.state = 'dispersing';
    }

    update() {
        if (this.state === 'dispersing') {
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.vy += this.gravity;

            this.x += this.vx;
            this.y += this.vy;

            // Wobble
            this.x += Math.sin(Date.now() * 0.01 + this.originX) * 0.5;

            this.life -= 0.002;
            this.opacity = Math.max(0, this.life);

            // If almost vanished, settle as a star
            if (this.life < 0.1 && Math.random() < 0.01) {
                this.convertToStar();
            }
        }
    }

    convertToStar() {
        // 硬上限：防止多次提交后 stars 无限膨胀导致帧率下降
        if (stars.length < STAR_COUNT * 2) {
            const star = new Star(true);
            star.x = this.x;
            star.y = this.y;
            star.size = Math.random() * 1.2;
            stars.push(star);
        }
        this.dead = true;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class Ripple {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = 0;
        this.maxR = Math.max(width, height) * 0.8;
        this.opacity = 0.5;
        this.dead = false;
    }

    update() {
        this.r += 12;
        this.opacity -= 0.008;
        if (this.opacity <= 0 || this.r >= this.maxR) this.dead = true;
    }

    draw() {
        ctx.strokeStyle = `rgba(0, 255, 255, ${Math.max(0, this.opacity)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// ── 音频引擎 ──
class ResonanceAudio {
    constructor() {
        this.ctx = null;
        this.suspended = true;
        this.isMuted = true;
        this.ambientOscs = [];
        this.masterGain = null;
        
        // 利底亚五声音阶 (Hz)
        this.scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;
        this.masterGain.connect(this.ctx.destination);
    }

    async unlock() {
        this.init();
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    toggleMute(forceState) {
        this.isMuted = (forceState !== undefined) ? forceState : !this.isMuted;
        const target = this.isMuted ? 0 : 0.6;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
        }
        
        // 同步 UI 图标
        const icon = document.getElementById('audio-icon');
        if (icon) icon.textContent = this.isMuted ? '🔇' : '🔊';
        
        return this.isMuted;
    }

    // 空灵背景音 (低频呼吸)
    startAmbient() {
        if (!this.ctx || this.ambientOscs.length > 0) return;
        
        const createDrone = (freq, vol) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.value = vol;
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start();
            return { osc, g };
        };

        this.ambientOscs.push(createDrone(65.41, 0.1)); // C2
        this.ambientOscs.push(createDrone(98.00, 0.05)); // G2
    }

    // 水晶敲击声 (星点共鸣)
    playPing(rank = 10) {
        if (!this.ctx || this.isMuted) return;
        
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        
        // 排名越高，音调越高
        const freqIdx = Math.max(0, Math.min(this.scale.length - 1, 9 - Math.floor(rank / 2)));
        osc.frequency.value = this.scale[freqIdx];
        osc.type = 'sine';

        g.gain.setValueAtTime(0, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

        osc.connect(g);
        g.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 1.6);
    }

    // 提交时的能量绽放音
    playBloom() {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.frequency.setValueAtTime(110, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 1);
        g.gain.setValueAtTime(0.2, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 2);
    }
}

const audio = new ResonanceAudio();

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}

function initStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push(new Star());
    }
}

function spawnTextParticles(text) {
    particles.length = 0;

    // Create offscreen canvas for text measurement
    const offscreen = document.createElement('canvas');
    const octx = offscreen.getContext('2d');
    offscreen.width = width;
    offscreen.height = height;

    octx.font = `900 ${width > 600 ? 120 : 80}px 'PingFang SC', serif`;
    octx.fillStyle = 'white';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(text, width / 2, height / 2);

    const data = octx.getImageData(0, 0, width, height).data;

    for (let y = 0; y < height; y += PARTICLE_SAMPLE_STEP) {
        for (let x = 0; x < width; x += PARTICLE_SAMPLE_STEP) {
            const index = (y * width + x) * 4;
            if (data[index + 3] > 128) { // If pixel is opaque
                particles.push(new TextParticle(x, y));
            }
        }
    }
}

let globalPulse = 0;
function update() {
    // Clear with trail effect
    ctx.fillStyle = 'rgba(5, 5, 5, 0.15)';
    ctx.fillRect(0, 0, width, height);

    globalPulse += 0.005; // Slow global breathing rhythm

    stars.forEach(star => {
        star.update(globalPulse);
        star.draw();
    });

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw();
        if (p.dead || (p.state === 'dispersing' && p.opacity <= 0)) {
            particles.splice(i, 1);
        }
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.update();
        r.draw();
        if (r.dead) ripples.splice(i, 1);
    }

    animationId = requestAnimationFrame(update);
}

// Handlers
finalWordsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && appState === 'IDLE') {
        const text = finalWordsInput.value.trim();
        if (text.length === 2) handleSubmit(text);
    }
});

function handleSubmit(text) {
    appState = 'DISPERSING';
    submitWord(text);
    spawnTextParticles(text);
    inputSection.classList.add('hidden');
    
    // 激活并开启音频
    audio.unlock().then(() => {
        audio.toggleMute(false); // 强制开启声音
        audio.playBloom();
    });

    // 触发画布涟漪
    ripples.push(new Ripple(width / 2, height / 2));

    setTimeout(() => particles.forEach(p => p.disperse()), 100);
    setTimeout(() => triggerGalaxyTransition(text), 3200);
}

// ── Supabase ──────────────────────────────────────────
// 所需表：CREATE TABLE words (word text primary key, count int default 1, updated_at timestamptz default now());
const _sb = supabase.createClient(
    'https://wteonbwjjnvewriwcbmn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZW9uYndqam52ZXdyaXdjYm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMTk1NjQsImV4cCI6MjA5MTU5NTU2NH0.3jnOBq2-CQQromGMcoLiLG73UviD8XTLmGFiah1oWZ4'
);

// 提交词汇：本地存档 + 云端 upsert（count +1）+ 更新本地缓存
async function submitWord(word) {
    storeWord(word);
    try {
        const { data } = await _sb.from('words').select('count').eq('word', word).maybeSingle();
        if (data) {
            const newCount = data.count + 1;
            await _sb.from('words').update({ count: newCount, updated_at: new Date() }).eq('word', word);
            wordCounts.set(word, newCount);
        } else {
            await _sb.from('words').insert({ word, count: 1 });
            wordCounts.set(word, 1);
        }
    } catch (_) {}
}

// 构建星系词池：云端 Top 100 + 本地存档 + SEED_WORDS，同步填充 wordCounts 缓存
// 构建星系词池：云端 Top 100（完全去伪存真，无 Seed Words）
async function initGalaxy(targetWord) {
    let cloudWords = [];
    try {
        const { data } = await _sb.from('words').select('word,count').order('count', { ascending: false }).limit(100);
        if (data) {
            data.forEach(r => wordCounts.set(r.word, r.count));
            cloudWords = data.map(r => r.word);
        }
    } catch (_) {}

    // 池中仅包含数据库真实存在的词汇
    const pool = [...new Set([...cloudWords])];
    
    // 如果没有任何数据，返回空池
    if (pool.length === 0) return targetWord ? [targetWord] : [];

    if (!targetWord) return pool.sort(() => Math.random() - 0.5).slice(0, 40);
    const others = pool.filter(w => w !== targetWord).sort(() => Math.random() - 0.5).slice(0, 39);
    others.push(targetWord);
    return others.sort(() => Math.random() - 0.5);
}

// ── 星系图 ──────────────────────────────────────────
const galaxyOverlay = document.getElementById('galaxy-overlay');
const galaxySvg = document.getElementById('galaxy-svg');
const galaxyClose = document.getElementById('galaxy-close');
const resonanceToast = document.getElementById('resonance-toast');
const leaderboard = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboard-list');
const planetTooltip = document.getElementById('planet-tooltip');
const btnResetView = document.getElementById('btn-reset-view');
const btnPanorama = document.getElementById('btn-panorama');

// 全局状态锁：IDLE | DISPERSING | ZOOMING | RESONATING
let appState = 'IDLE';

// word → { x, y }（SVG 用户坐标空间）
const planetPositions = {};

// ── 镜头状态 ──
const camera = { x: -400, y: -400, w: 800, h: 800 };

function applyCamera() {
    galaxySvg.setAttribute('viewBox',
        `${camera.x.toFixed(1)} ${camera.y.toFixed(1)} ${camera.w.toFixed(1)} ${camera.h.toFixed(1)}`);
}

function resetCamera() {
    camera.x = -400; camera.y = -400; camera.w = 800; camera.h = 800;
    applyCamera();
}

// ── SoulArchive：灵魂轨迹本地持久化 ──
// 结构：{ word: { count, firstSeen, lastSeen } }
function getArchive() {
    try { return JSON.parse(localStorage.getItem('soul_archive') || '{}'); }
    catch { return {}; }
}

function getStoredWords() {
    return Object.keys(getArchive());
}

function storeWord(word) {
    const archive = getArchive();
    const now = Date.now();
    if (archive[word]) {
        archive[word].count++;
        archive[word].lastSeen = now;
    } else {
        archive[word] = { count: 1, firstSeen: now, lastSeen: now };
    }
    // 超过 100 条时淘汰最旧的
    const entries = Object.entries(archive);
    if (entries.length > 100) {
        entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
        delete archive[entries[0][0]];
    }
    localStorage.setItem('soul_archive', JSON.stringify(archive));
}

// targetWord 始终被包含在结果中
function buildGalaxyWords(targetWord) {
    const stored = getStoredWords();
    const pool = [...new Set([...stored, ...SEED_WORDS])];
    if (!targetWord) return pool.sort(() => Math.random() - 0.5).slice(0, 40);
    const others = pool.filter(w => w !== targetWord).sort(() => Math.random() - 0.5).slice(0, 39);
    others.push(targetWord);
    return others.sort(() => Math.random() - 0.5);
}

// 全局 DB 计数缓存：word → 真实 count（由 initGalaxy 填充，submitWord 更新）
const wordCounts = new Map();

function getWordCount(word) {
    return wordCounts.get(word) ?? 1;
}

// 从 Supabase 拉取全球灵魂总行数（精确 Row Count）
async function fetchGlobalSoulCount() {
    try {
        // 使用 head: true, count: 'exact' 获取真实记录总条数
        const { count, error } = await _sb.from('words').select('*', { count: 'exact', head: true });
        if (error) return 0;
        return count || 0;
    } catch (_) { return 0; }
}

// 由 getGlobalRankings() 驱动，每项可点击定位
async function updateLeaderboard() {
    leaderboardList.innerHTML = '';
    const rankings = getGlobalRankings();

    // 全球真实计数：从 Supabase SUM(count)
    const soulCountEl = document.getElementById('global-soul-count');
    if (soulCountEl) {
        const globalTotal = await fetchGlobalSoulCount();
        soulCountEl.textContent = (globalTotal ?? 0).toLocaleString();
    }

    rankings.forEach(({ word, count }, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.style.cursor = 'pointer';
        // 交错入场延迟
        item.style.animationDelay = `${0.1 + index * 0.08}s`;
        item.innerHTML =
            `<span class="leaderboard-word">${word}</span>` +
            `<span class="leaderboard-count">${count} 灵</span>`;
        item.addEventListener('click', () => focusOnStar(word));
        leaderboardList.appendChild(item);
    });
}

// ── 空间哈希坐标预索引（O(1) Tooltip 触发）──────────────
const CELL_SIZE = 60;  // SVG 用户单位
const spatialGrid = new Map();
const planetElements = {};  // word → { circle, origR, isTarget }
let hoveredWord = null;

function spatialClear() {
    spatialGrid.clear();
    Object.keys(planetElements).forEach(k => delete planetElements[k]);
    hoveredWord = null;
}

function spatialInsert(word, x, y, r) {
    const minCX = Math.floor((x - r) / CELL_SIZE);
    const maxCX = Math.floor((x + r) / CELL_SIZE);
    const minCY = Math.floor((y - r) / CELL_SIZE);
    const maxCY = Math.floor((y + r) / CELL_SIZE);
    for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
            const key = `${cx},${cy}`;
            if (!spatialGrid.has(key)) spatialGrid.set(key, []);
            spatialGrid.get(key).push({ word, x, y, r });
        }
    }
}

// 查询 (sx, sy) 处命中的最近星球
function spatialQuery(sx, sy) {
    const cx = Math.floor(sx / CELL_SIZE);
    const cy = Math.floor(sy / CELL_SIZE);
    let best = null, bestDist = Infinity;
    for (let dcx = -1; dcx <= 1; dcx++) {
        for (let dcy = -1; dcy <= 1; dcy++) {
            const entries = spatialGrid.get(`${cx + dcx},${cy + dcy}`);
            if (!entries) continue;
            for (const en of entries) {
                const d2 = (sx - en.x) ** 2 + (sy - en.y) ** 2;
                if (d2 <= en.r * en.r && d2 < bestDist) {
                    bestDist = d2;
                    best = en.word;
                }
            }
        }
    }
    return best;
}

// 屏幕坐标 → SVG 用户坐标
function screenToSVG(screenX, screenY) {
    const rect = galaxySvg.getBoundingClientRect();
    return {
        x: camera.x + (screenX - rect.left) / rect.width * camera.w,
        y: camera.y + (screenY - rect.top) / rect.height * camera.h,
    };
}

function renderGalaxy(words, targetWord) {
    galaxySvg.innerHTML = '';
    Object.keys(planetPositions).forEach(k => delete planetPositions[k]);
    spatialClear();

    const ns = 'http://www.w3.org/2000/svg';

    // 中心
    const sun = document.createElementNS(ns, 'circle');
    sun.setAttribute('cx', 0); sun.setAttribute('cy', 0); sun.setAttribute('r', 28);
    sun.setAttribute('fill', 'rgba(147,112,219,0.18)');
    sun.setAttribute('stroke', '#9370db'); sun.setAttribute('stroke-width', '1.2');
    galaxySvg.appendChild(sun);

    const sunLabel = document.createElementNS(ns, 'text');
    sunLabel.setAttribute('x', 0); sunLabel.setAttribute('y', 6);
    sunLabel.setAttribute('text-anchor', 'middle');
    sunLabel.setAttribute('font-size', '13');
    sunLabel.setAttribute('fill', '#00ffff');
    sunLabel.textContent = '众生';
    galaxySvg.appendChild(sunLabel);

    const orbits = [80, 140, 200, 270, 340];
    const maxPerOrbit = [4, 6, 8, 10, 12];
    let wordIdx = 0;

    // 获取当前词群中的 Top 5（Heatmap 热力标识）
    const topWords = words
        .map(w => ({ word: w, count: getWordCount(w) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(x => x.word);
    const topSet = new Set(topWords);

    orbits.forEach((r, oi) => {
        if (wordIdx >= words.length) return;
        const count = Math.min(maxPerOrbit[oi], words.length - wordIdx);

        const ring = document.createElementNS(ns, 'circle');
        ring.setAttribute('cx', 0); ring.setAttribute('cy', 0); ring.setAttribute('r', r);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', 'rgba(147,112,219,0.12)');
        ring.setAttribute('stroke-width', '0.8');
        galaxySvg.appendChild(ring);

        const step = (Math.PI * 2) / count;
        const offset = Math.random() * Math.PI * 2;

        for (let i = 0; i < count; i++) {
            const angle = offset + i * step;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            const word = words[wordIdx++];
            const isTarget = targetWord && word === targetWord;
            const isTop = topSet.has(word);

            planetPositions[word] = { x, y };

            const hue = isTarget ? 180 : 260 + Math.random() * 60;
            // Top 星球半径翻倍
            let planetR = isTarget ? 20 : 14 + Math.random() * 5;
            if (isTop && !isTarget) planetR *= 1.8;

            // 连线
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', 0); line.setAttribute('y1', 0);
            line.setAttribute('x2', x); line.setAttribute('y2', y);
            line.setAttribute('stroke', `hsla(${hue},50%,50%,${isTarget ? 0.25 : 0.08})`);
            line.setAttribute('stroke-width', isTarget ? '1' : '0.5');
            galaxySvg.insertBefore(line, galaxySvg.firstChild);

            // 星球
            const planet = document.createElementNS(ns, 'circle');
            planet.setAttribute('cx', x); planet.setAttribute('cy', y);
            planet.setAttribute('r', planetR);
            planet.dataset.randR = planetR - (isTarget ? 20 : (isTop ? 14 * 1.8 : 14));
            planet.setAttribute('fill', `hsla(${hue},60%,55%,${isTarget ? 0.3 : 0.15})`);
            planet.setAttribute('stroke', `hsla(${hue},70%,65%,${isTarget ? 0.95 : 0.7})`);
            planet.setAttribute('stroke-width', isTarget ? '1.8' : '1');
            planet.style.cursor = 'pointer';
            planet.style.transition = 'r 0.25s ease, filter 0.25s ease';

            if (isTarget) planet.id = 'target-planet';
            if (isTop) planet.classList.add('top-planet');

            // 注册到空间哈希（hit zone 扩大 8 单位提升易触发性）
            planetElements[word] = { circle: planet, origR: planetR, isTarget, isTop };
            spatialInsert(word, x, y, planetR + 8);


            // 词
            const label = document.createElementNS(ns, 'text');
            label.setAttribute('x', x); label.setAttribute('y', y + 5);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', isTarget ? '13' : '12');
            label.setAttribute('fill', `hsla(${hue},80%,${isTarget ? 95 : 80}%,0.9)`);
            label.textContent = word;
            galaxySvg.appendChild(label);
        }
    });
}

// ── 动画工具 ──────────────────────────────────────────

// ExpoInOut：前段爆发加速，中段极速，末段平稳切入
function easeExpoInOut(t) {
    if (t === 0 || t === 1) return t;
    return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
}

// 俯冲：从当前 camera 位置指数缓动到目标星球
function zoomToViewBox(tx, ty, onComplete) {
    const startVB = { ...camera };   // 从实际当前镜头出发
    const m = 55;
    const endVB = { x: tx - m, y: ty - m, w: m * 2, h: m * 2 };
    const duration = 1800;
    const t0 = performance.now();

    galaxySvg.classList.add('zoom-locked');
    setTimeout(() => galaxyOverlay.classList.add('dive-mode'), 400);
    setTimeout(() => galaxyOverlay.classList.remove('dive-mode'), 1400);

    function step(now) {
        const t = Math.min((now - t0) / duration, 1);
        const e = easeExpoInOut(t);
        camera.x = startVB.x + (endVB.x - startVB.x) * e;
        camera.y = startVB.y + (endVB.y - startVB.y) * e;
        camera.w = startVB.w + (endVB.w - startVB.w) * e;
        camera.h = startVB.h + (endVB.h - startVB.h) * e;
        applyCamera();
        if (t < 1) requestAnimationFrame(step);
        else if (onComplete) onComplete();
    }
    requestAnimationFrame(step);
}

// 星球爆发强光 (精修版：转由 CSS 驱动色差与能量感)
function burstPlanet(x, y) {
    const ns = 'http://www.w3.org/2000/svg';

    const ring1 = document.createElementNS(ns, 'circle');
    ring1.setAttribute('cx', x); ring1.setAttribute('cy', y);
    ring1.setAttribute('r', 22); ring1.setAttribute('fill', 'rgba(0,255,255,0.15)');
    ring1.setAttribute('stroke', '#00ffff'); ring1.setAttribute('stroke-width', '1');
    ring1.classList.add('burst-ring');
    galaxySvg.appendChild(ring1);

    const ring2 = document.createElementNS(ns, 'circle');
    ring2.setAttribute('cx', x); ring2.setAttribute('cy', y);
    ring2.setAttribute('r', 25); ring2.setAttribute('fill', 'none');
    ring2.setAttribute('stroke', 'rgba(147,112,219,0.8)'); ring2.setAttribute('stroke-width', '1');
    ring2.style.animationDelay = '0.1s';
    ring2.classList.add('burst-ring');
    galaxySvg.appendChild(ring2);

    // 动画完成后移除元素
    setTimeout(() => {
        ring1.remove();
        ring2.remove();
    }, 1200);

    // 目标星球亮起
    const tp = document.getElementById('target-planet');
    if (tp) {
        tp.setAttribute('fill', 'rgba(0,255,255,0.42)');
        tp.setAttribute('stroke', '#00ffff');
        tp.setAttribute('stroke-width', '2.5');
    }
}

// 共振提示
function showResonanceToast(word) {
    const count = getWordCount(word);
    resonanceToast.innerHTML =
        `<span class="toast-line">你的思念已入星海</span>` +
        `<span class="toast-count">${count}</span>` +
        `<span class="toast-line">位灵魂与你共振</span>`;
    resonanceToast.offsetHeight; // 触发 reflow
    resonanceToast.classList.add('visible');
}

// ── 排行榜 ────────────────────────────────────────────
// 根据 DB 真实加载的数据进行排序，展示 Top 10 条
function getGlobalRankings() {
    // 直接基于由 initGalaxy 或 submitWord 填充的 wordCounts Map
    return Array.from(wordCounts.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

// ── 星球定位 ──────────────────────────────────────────
function focusOnStar(word) {
    const pos = planetPositions[word];
    if (!pos) return;
    const from = { ...camera };
    const m = 60;
    const to = { x: pos.x - m, y: pos.y - m, w: m * 2, h: m * 2 };
    const duration = 1000;
    const t0 = performance.now();

    function step(now) {
        const t = Math.min((now - t0) / duration, 1);
        const e = easeExpoInOut(t);
        camera.x = from.x + (to.x - from.x) * e;
        camera.y = from.y + (to.y - from.y) * e;
        camera.w = from.w + (to.w - from.w) * e;
        camera.h = from.h + (to.h - from.h) * e;
        applyCamera();
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ── Pan & Zoom（仅 RESONATING 解锁后可用）─────────────
const BOUNDS = 1000; // SVG 用户坐标弹性边界（±1000 之外增阻力）
let isDragging = false;
let dragLast = { x: 0, y: 0 };
let springRafId = null;

// 弹性回弹：镜头中心超出 ±BOUNDS 时动画回弹到最近有效区域
function springBackCamera() {
    if (springRafId) cancelAnimationFrame(springRafId);

    const cx = camera.x + camera.w / 2;
    const cy = camera.y + camera.h / 2;
    const clampedCx = Math.max(-BOUNDS, Math.min(BOUNDS, cx));
    const clampedCy = Math.max(-BOUNDS, Math.min(BOUNDS, cy));

    if (Math.abs(cx - clampedCx) < 0.5 && Math.abs(cy - clampedCy) < 0.5) return;

    const startX = camera.x, startY = camera.y;
    const targetX = clampedCx - camera.w / 2;
    const targetY = clampedCy - camera.h / 2;
    const t0 = performance.now();
    const duration = 600;

    function step(now) {
        const t = Math.min((now - t0) / duration, 1);
        // easeOutElastic 感：先过冲再缓回
        const e = 1 - Math.pow(1 - t, 3);
        camera.x = startX + (targetX - startX) * e;
        camera.y = startY + (targetY - startY) * e;
        applyCamera();
        if (t < 1) springRafId = requestAnimationFrame(step);
        else springRafId = null;
    }
    springRafId = requestAnimationFrame(step);
}

galaxyOverlay.addEventListener('mousedown', (e) => {
    if (appState !== 'RESONATING') return;
    // 排行榜、关闭按钮、toast 内部点击不触发拖拽
    if (e.target.closest('#rankings-panel, #leaderboard, #controls-group, #galaxy-close, #resonance-toast')) return;
    if (springRafId) { cancelAnimationFrame(springRafId); springRafId = null; }
    isDragging = true;
    isClick = true; // 记录是否为点击
    dragLast = { x: e.clientX, y: e.clientY };
    galaxyOverlay.classList.add('dragging');
});

let isClick = false;

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    // 如果移动距离超过阈值，则判定为拖拽而非点击
    if (Math.abs(e.clientX - dragLast.x) > 5 || Math.abs(e.clientY - dragLast.y) > 5) {
        isClick = false;
    }

    const rect = galaxySvg.getBoundingClientRect();
    let dx = (e.clientX - dragLast.x) * camera.w / rect.width;
    let dy = (e.clientY - dragLast.y) * camera.h / rect.height;

    // 弹性阻力：超出边界时拖拽距离衰减为 30%
    const cx = camera.x + camera.w / 2;
    const cy = camera.y + camera.h / 2;
    if ((cx - dx > BOUNDS && dx < 0) || (cx - dx < -BOUNDS && dx > 0)) dx *= 0.3;
    if ((cy - dy > BOUNDS && dy < 0) || (cy - dy < -BOUNDS && dy > 0)) dy *= 0.3;

    camera.x -= dx;
    camera.y -= dy;
    dragLast = { x: e.clientX, y: e.clientY };
    applyCamera();
});

window.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    
    // 激活音频系统
    audio.unlock();

    if (isClick) {
        // 处理点击星球逻辑
        const coords = screenToSVG(e.clientX, e.clientY);
        const word = spatialQuery(coords.x, coords.y);
        if (word) {
            focusOnStar(word);
        }
    }

    isDragging = false;
    isClick = false;
    galaxyOverlay.classList.remove('dragging');
    springBackCamera();
});

// ── 统一 Tooltip 处理器（O(1) 空间哈希驱动）────────────
galaxyOverlay.addEventListener('mousemove', (e) => {
    if (appState !== 'RESONATING') return;
    // 拖拽中不显示 tooltip
    if (isDragging) {
        if (hoveredWord) {
            const prev = planetElements[hoveredWord];
            if (prev) { prev.circle.setAttribute('r', prev.origR); prev.circle.style.filter = ''; }
            hoveredWord = null;
            planetTooltip.classList.remove('visible');
        }
        return;
    }

    // tooltip 跟随鼠标
    planetTooltip.style.left = (e.clientX + 15) + 'px';
    planetTooltip.style.top = (e.clientY + 15) + 'px';

    const svg = screenToSVG(e.clientX, e.clientY);
    const word = spatialQuery(svg.x, svg.y);

    if (word === hoveredWord) return; // 没变，跳过重绘

    // 还原上一个悬停星球
    if (hoveredWord) {
        const prev = planetElements[hoveredWord];
        if (prev) { prev.circle.setAttribute('r', prev.origR); prev.circle.style.filter = ''; }
    }

    hoveredWord = word;

    if (word) {
        const el = planetElements[word];
        if (el) {
            el.circle.setAttribute('r', el.origR + 6);
            el.circle.style.filter = (el.isTarget || el.isTop)
                ? 'drop-shadow(0 0 12px #00ffff) brightness(1.6)'
                : 'drop-shadow(0 0 8px #9370db) brightness(1.4)';
        }
        const count = getWordCount(word);
        planetTooltip.innerHTML =
            `<span class="tooltip-word">${word}</span>` +
            `<span class="tooltip-stats">共鸣深度：${count} 位灵魂</span>`;
        planetTooltip.classList.add('visible');
    } else {
        planetTooltip.classList.remove('visible');
    }
});

galaxyOverlay.addEventListener('mouseleave', () => {
    if (hoveredWord) {
        const prev = planetElements[hoveredWord];
        if (prev) { prev.circle.setAttribute('r', prev.origR); prev.circle.style.filter = ''; }
        hoveredWord = null;
    }
    planetTooltip.classList.remove('visible');
});

galaxyOverlay.addEventListener('wheel', (e) => {
    if (appState !== 'RESONATING') return;
    e.preventDefault();
    const rect = galaxySvg.getBoundingClientRect();
    // 鼠标在 SVG 坐标系中的锚点
    const mx = camera.x + (e.clientX - rect.left) / rect.width * camera.w;
    const my = camera.y + (e.clientY - rect.top) / rect.height * camera.h;
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    const nw = Math.max(80, Math.min(900, camera.w * factor));
    const nh = Math.max(80, Math.min(900, camera.h * factor));
    // 缩放后保持锚点不动
    camera.x = mx - (e.clientX - rect.left) / rect.width * nw;
    camera.y = my - (e.clientY - rect.top) / rect.height * nh;
    camera.w = nw;
    camera.h = nh;
    applyCamera();
}, { passive: false });

// ── 主流程 ──────────────────────────────────────────

// 自动俯冲进入（提交后触发）
async function triggerGalaxyTransition(word) {
    appState = 'ZOOMING';
    const words = await initGalaxy(word);
    renderGalaxy(words, word);

    galaxyOverlay.classList.add('active');
    galaxyClose.style.opacity = '0';
    galaxyClose.style.pointerEvents = 'none';
    resonanceToast.classList.remove('visible');

    setTimeout(() => {
        const pos = planetPositions[word];
        if (!pos) return;
        zoomToViewBox(pos.x, pos.y, () => {
            burstPlanet(pos.x, pos.y);
            setTimeout(() => {
                showResonanceToast(word);
                setTimeout(() => {
                    appState = 'RESONATING';
                    galaxyClose.style.opacity = '1';
                    galaxyClose.style.pointerEvents = 'auto';

                    galaxyOverlay.classList.add('explorable');
                    
                    // 侧边栏及音效处理
                    audio.startAmbient();
                    setTimeout(() => {
                        leaderboard.classList.add('show');
                        updateLeaderboard();
                        
                        // 手机端自动收起逻辑：显示 2.5s 后折叠
                        if (window.innerWidth <= 768) {
                            setTimeout(() => {
                                if (appState === 'RESONATING') {
                                    leaderboard.classList.add('collapsed');
                                }
                            }, 2500);
                        }
                    }, 800);
                }, 900);
            }, 500);
        });
    }, 300);
}

// 手动进入星系（无俯冲动画）
async function showGalaxy() {
    if (appState !== 'IDLE') return;
    appState = 'RESONATING';
    
    // 激活并开启音频
    audio.unlock().then(() => {
        audio.toggleMute(false);
        audio.startAmbient();
    });

    const words = await initGalaxy(null);
    renderGalaxy(words, null);
    resetCamera();
    galaxySvg.classList.remove('zoom-locked');
    resonanceToast.classList.remove('visible');
    galaxyOverlay.classList.add('active', 'explorable');
    galaxyClose.style.opacity = '1';
    galaxyClose.style.pointerEvents = 'auto';
    leaderboard.classList.add('show');
    updateLeaderboard();
}

function hideGalaxy() {
    if (appState !== 'RESONATING' && appState !== 'IDLE') return;
    appState = 'IDLE';
    leaderboard.classList.remove('show');
    galaxyOverlay.classList.remove('explorable');
    resetCamera();
    galaxySvg.classList.remove('zoom-locked');
    resonanceToast.classList.remove('visible');
    galaxyOverlay.classList.remove('active');
    inputSection.classList.remove('hidden');
    finalWordsInput.value = '';
    finalWordsInput.focus();
}

// 视角控制逻辑
const btnShare = document.getElementById('btn-share');
const shareOverlay = document.getElementById('share-overlay');
const closeShare = document.getElementById('close-share');
const shareN = document.getElementById('share-n');

btnShare.addEventListener('click', async () => {
    const globalTotal = await fetchGlobalSoulCount();
    shareN.textContent = (globalTotal ?? 0).toLocaleString();
    shareOverlay.classList.remove('hidden');
});

closeShare.addEventListener('click', () => {
    shareOverlay.classList.add('hidden');
});

// 排行榜抽屉及音频控制逻辑
const leaderboardHandle = document.getElementById('leaderboard-handle');
leaderboardHandle.addEventListener('click', () => {
    leaderboard.classList.toggle('collapsed');
    audio.playPing(10); // 交互音
});

const audioControl = document.getElementById('audio-control');
const audioIcon = document.getElementById('audio-icon');
audioControl.addEventListener('click', () => {
    audio.unlock();
    const isMuted = audio.toggleMute();
    audioIcon.textContent = isMuted ? '🔇' : '🔊';
});

// 重载 focusOnStar 以包含音效
const originalFocusOnStar = focusOnStar;
focusOnStar = (word) => {
    originalFocusOnStar(word);
    
    // 获取排名并触发音效
    const rankings = getGlobalRankings();
    const rank = rankings.findIndex(r => r.word === word);
    audio.playPing(rank === -1 ? 15 : rank);
};

btnResetView.addEventListener('click', () => {
    const target = document.getElementById('target-planet');
    if (target) {
        // 触发引力波视觉闪烁
        galaxyOverlay.classList.remove('wave-active');
        void galaxyOverlay.offsetWidth; // 触发回流
        galaxyOverlay.classList.add('wave-active');

        const tx = parseFloat(target.getAttribute('cx'));
        const ty = parseFloat(target.getAttribute('cy'));
        zoomToViewBox(tx, ty);

        // 动画结束后移除类名
        setTimeout(() => galaxyOverlay.classList.remove('wave-active'), 800);
    }
});

btnPanorama.addEventListener('click', () => {
    const from = { ...camera };
    const to = { x: -400, y: -400, w: 800, h: 800 };
    const duration = 1200;
    const t0 = performance.now();

    function animate(now) {
        const t = Math.min((now - t0) / duration, 1);
        const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
        camera.x = from.x + (to.x - from.x) * e;
        camera.y = from.y + (to.y - from.y) * e;
        camera.w = from.w + (to.w - from.w) * e;
        camera.h = from.h + (to.h - from.h) * e;
        applyCamera();
        if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
});

resetBtn.addEventListener('click', showGalaxy);
galaxyClose.addEventListener('click', hideGalaxy);

// Start
window.addEventListener('resize', () => {
    resize();
    if (galaxyOverlay.classList.contains('active')) applyCamera();
});
resize();
initStars();
update();
finalWordsInput.focus();

// 禁止星系层触发浏览器原生拉动回弹
galaxyOverlay.addEventListener('touchmove', (e) => {
    if (appState !== 'IDLE' && !e.target.closest('button') && !e.target.closest('#leaderboard')) {
        e.preventDefault();
    }
}, { passive: false });
