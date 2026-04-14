const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const inputSection = document.getElementById('input-section');
const finalWordsInput = document.getElementById('final-words');

let width, height;
const stars = [];
const particles = [];
const ripples = []; 
let animationId;

// ==========================================
// Phase 2: 全球共鸣引擎 (Shooting Star & Queue)
// ==========================================

// 全局流星队列与节流控制
const globalStarQueue = [];
const shootingStars = []; // 当前屏幕上活跃的流星
let lastStarSpawnTime = 0;
const STAR_SPAWN_INTERVAL = 800; // 每隔800ms最多划过一颗，防卡死

class ShootingStar {
    constructor(word) {
        this.word = word;
        this.reset();
    }

    reset() {
        // 从屏幕右侧或上侧随机生成
        this.x = Math.random() * window.innerWidth + window.innerWidth * 0.2;
        this.y = Math.random() * window.innerHeight * 0.5 - window.innerHeight * 0.2;
        
        this.length = Math.random() * 80 + 100; // 尾巴长度
        this.speed = Math.random() * 15 + 20;   // 飞行速度
        this.angle = Math.PI * 0.75 + (Math.random() * 0.1 - 0.05); // 大致从右上到左下 (约135度)
        
        this.opacity = 0; // 初始透明度
        this.life = 0;
        this.maxLife = 100; // 存活周期
        this.dead = false;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.life++;

        // 淡入淡出逻辑
        if (this.life < 10) {
            this.opacity = this.life / 10;
        } else if (this.life > this.maxLife - 20) {
            this.opacity = Math.max(0, (this.maxLife - this.life) / 20);
        } else {
            this.opacity = 1;
        }

        if (this.life >= this.maxLife || this.x < -200 || this.y > window.innerHeight + 200) {
            this.dead = true;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;

        // 1. 绘制流星拖尾 (线性渐变)
        const tailX = this.x - Math.cos(this.angle) * this.length;
        const tailY = this.y - Math.sin(this.angle) * this.length;
        
        const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)'); // 头部高亮青色
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');   // 尾部透明

        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(0, 255, 255, 1)';
        ctx.stroke();

        // 2. 绘制流星头部 (高亮光点)
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // 3. 核心创意：绘制低透明度的文字跟在头部后面
        ctx.shadowBlur = 0;
        ctx.font = '14px -apple-system, "PingFang SC", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // 极低透明度
        ctx.textAlign = 'right';
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // 让文字顺着流星的方向旋转
        ctx.fillText(this.word, -15, 4); // 偏移一点，跟在头部后方

        ctx.restore();
    }
}

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

// ── 爆款级治愈音频引擎 ──
class ResonanceAudio {
    constructor() {
        this.ctx = null;
        this.isMuted = true;
        this.ambientNodes = [];
        this.masterGain = null;
        this.lfo = null;
        
        // F 利底亚 (F Lydian) 调式 - 充满希望与奇迹的光之调式
        // F3, G3, A3, B3(H), C4, D4, E4, F4...
        this.scale = [174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 523.25, 659.25, 783.99, 1046.50];
        this.maj7Chord = [174.61, 220.00, 261.63, 329.63]; // F-maj7 (F, A, C, E)
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0;
        this.masterGain.connect(this.ctx.destination);
        
        // 增加环绕立体声混响效果 (模拟)
        this.convolver = this.ctx.createConvolver();
        // 此处略过真实脉冲响应加载，改用低通滤波器模拟空间感
        this.lpFilter = this.ctx.createBiquadFilter();
        this.lpFilter.type = 'lowpass';
        this.lpFilter.frequency.value = 2200;
        this.lpFilter.connect(this.masterGain);
    }

    async unlock() {
        this.init();
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    toggleMute(forceState) {
        this.isMuted = (forceState !== undefined) ? forceState : !this.isMuted;
        const target = this.isMuted ? 0 : 0.45;
        if (this.masterGain && this.ctx) {
            // 先清除之前的渐变，防止冲突
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
        }
        
        // 同步 UI 图标
        const icon = document.getElementById('audio-icon');
        if (icon) icon.textContent = this.isMuted ? '🔇' : '🔊';
        
        return this.isMuted;
    }

    // “星光呼吸”环境音 (F Lydian 和弦底噪)
    startAmbient() {
        if (!this.ctx || this.ambientNodes.length > 0 || this.isMuted) return;
        
        const createDrone = (freq, vol) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.value = 0;
            osc.connect(g);
            g.connect(this.lpFilter);
            osc.start();
            g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 3);
            return { osc, g, baseVol: vol };
        };

        const nodes = [
            createDrone(174.61, 0.12), // F3
            createDrone(261.63, 0.08), // C4
            createDrone(329.63, 0.05), // E4
        ];
        this.ambientNodes = nodes;

        // 引入 LFO 呼吸
        this.lfo = this.ctx.createOscillator();
        this.lfo.frequency.value = 0.08; // 12秒一个周期
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.03; 
        this.lfo.connect(lfoGain);
        
        nodes.forEach(n => {
            lfoGain.connect(n.g.gain);
        });
        this.lfo.start();
    }

    // 治愈系水晶共鸣 (带高频谐波)
    playPing(rank = 10) {
        if (!this.ctx || this.isMuted) return;
        
        // 核心音
        const freqIdx = Math.max(0, Math.min(this.scale.length - 1, 10 - Math.floor(rank * 1.2)));
        const baseFreq = this.scale[freqIdx];
        
        this.createCrystalTone(baseFreq, 0.25, 1.8);
        
        // 手机震动反馈
        if (navigator.vibrate) navigator.vibrate(12);
    }

    createCrystalTone(freq, vol, duration) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        // 增加一个超高频闪烁泛音 (Shimmer)
        const shimmer = this.ctx.createOscillator();
        const shimGain = this.ctx.createGain();
        shimmer.frequency.value = freq * 4.02; // 微弱失谐更有真实感
        shimmer.type = 'sine';
        shimGain.gain.setValueAtTime(0, now);
        shimGain.gain.linearRampToValueAtTime(vol * 0.3, now + 0.01);
        shimGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);

        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(vol, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(g);
        g.connect(this.lpFilter);
        shimmer.connect(shimGain);
        shimGain.connect(this.lpFilter);
        
        osc.start(now);
        shimmer.start(now);
        osc.stop(now + duration);
        shimmer.stop(now + duration);
    }

    // “能量绽放” - 宏大的和弦入场
    playBloom() {
        if (!this.ctx || this.isMuted) return;
        this.maj7Chord.forEach((f, i) => {
            setTimeout(() => {
                this.createCrystalTone(f * 2, 0.15, 2.5);
            }, i * 150);
        });
        if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
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

    // swap-and-pop 移除 (O(1) vs splice O(n))
    let pi = 0;
    while (pi < particles.length) {
        const p = particles[pi];
        p.update();
        p.draw();
        if (p.dead || (p.state === 'dispersing' && p.opacity <= 0)) {
            particles[pi] = particles[particles.length - 1];
            particles.pop();
        } else {
            pi++;
        }
    }

    let ri = 0;
    while (ri < ripples.length) {
        const r = ripples[ri];
        r.update();
        r.draw();
        if (r.dead) {
            ripples[ri] = ripples[ripples.length - 1];
            ripples.pop();
        } else {
            ri++;
        }
    }

    // 更新流星队列（800ms 节拍消费）
    const now = Date.now();
    if (globalStarQueue.length > 0 && now - lastStarSpawnTime > STAR_SPAWN_INTERVAL) {
        const word = globalStarQueue.shift();
        shootingStars.push(new ShootingStar(word));
        lastStarSpawnTime = now;
        // 右上角通知，不占用主 toast
        showStarNotify(word);
    }

    // 绘制流星
    let si = 0;
    while (si < shootingStars.length) {
        const s = shootingStars[si];
        s.update();
        s.draw(ctx);
        if (s.dead) {
            shootingStars[si] = shootingStars[shootingStars.length - 1];
            shootingStars.pop();
        } else {
            si++;
        }
    }

    animationId = requestAnimationFrame(update);
}

function showGlobalResonanceToast(word, count = null) {
    const toast = document.getElementById('resonance-toast');
    const textEl = toast.querySelector('.resonance-text');
    if (!toast || !textEl) return;
    
    if (count !== null) {
        if (count <= 1) {
            textEl.innerText = `你是宇宙中第一个留下「${word}」的灵魂。`;
        } else if (count <= 10) {
            textEl.innerText = `你是宇宙中第 ${count} 个写下「${word}」的灵魂。`;
        } else {
            textEl.innerText = `此时此刻，已有 ${count} 个灵魂与你写下了同样的字。`;
        }
    } else {
        // 全球观察的情况
        textEl.innerText = `远方传来共鸣：${word}`;
    }
    
    toast.classList.add('show');
    
    // 3秒后自动淡出
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ── Task B：内容过滤 + 前端节流 ──────────────────────────

// ── 统一内容过滤（单一数据源）────────────────────────────
// 合并侮辱词 + 敏感政治/暴力词，供输入校验和 Realtime 双端复用
const BAD_WORDS = [
    // 侮辱/色情
    '操','艹','草','妈','屌','傻','逼','鸡','奸','屁','滚',
    'fuck','shit','ass','bitch','cunt','dick','sex','porn',
    // 危险/政治（保护平台氛围）
    '大选','暴力','色情','杀人','自杀','炸弹','恐怖'
];

/**
 * badWordsFilter(word) → boolean
 * true = 违规应拦截；false = 可通过
 */
function badWordsFilter(word) {
    const lower = word.toLowerCase();
    return BAD_WORDS.some(w => lower.includes(w));
}

/**
 * isRateLimited() → boolean
 * 基于 localStorage 时间戳，10 秒内只允许提交一次
 */
function isRateLimited() {
    const LIMIT_MS = 10_000;
    const last = parseInt(localStorage.getItem('_submit_ts') || '0', 10);
    return Date.now() - last < LIMIT_MS;
}

function _recordSubmitTs() {
    localStorage.setItem('_submit_ts', Date.now().toString());
}

/** 输入框短暂变色提示，不弹窗打断沉浸感 */
function _flashInput(color) {
    finalWordsInput.style.borderBottomColor = color;
    finalWordsInput.style.transition = 'border-bottom-color 0.3s ease';
    setTimeout(() => {
        finalWordsInput.style.borderBottomColor = '';
    }, 1200);
}

// Handlers
finalWordsInput.addEventListener('keypress', (e) => {
    if (e.key !== 'Enter' || appState !== 'IDLE') return;
    const text = finalWordsInput.value.trim();
    if (text.length !== 2) {
        // 字数不足：抖动提示
        finalWordsInput.classList.remove('input-shake');
        void finalWordsInput.offsetWidth; // reflow 重置动画
        finalWordsInput.classList.add('input-shake');
        setTimeout(() => finalWordsInput.classList.remove('input-shake'), 500);
        return;
    }

    if (badWordsFilter(text)) {
        _flashInput('rgba(255, 80, 80, 0.7)');   // 红色：违规
        return;
    }
    if (isRateLimited()) {
        _flashInput('rgba(255, 200, 60, 0.7)');  // 黄色：冷却中
        return;
    }

    _recordSubmitTs();
    handleSubmit(text);
});

async function handleSubmit(text) {
    appState = 'DISPERSING';
    _selfWord = text;                         // 标记本机词，过滤 Realtime 回声
    const finalCount = await submitWord(text);
    spawnTextParticles(text);
    inputSection.classList.add('hidden');

    // 情感引导：粒子消散期显示过渡文字
    const hint = document.getElementById('transition-hint');
    if (hint) {
        hint.textContent = `「${text}」正在化为星尘，寻找共鸣的灵魂…`;
        hint.classList.remove('hidden');
        setTimeout(() => hint.classList.add('hidden'), 3200);
    }

    // 激活并开启音频
    audio.unlock().then(() => {
        audio.toggleMute(false); // 强制开启声音
        audio.playBloom();
    });

    // 触发画布涟漪
    ripples.push(new Ripple(width / 2, height / 2));

    setTimeout(() => particles.forEach(p => p.disperse()), 100);
    setTimeout(() => triggerGalaxyTransition(text, finalCount), 3200);
}


// ── Supabase ──────────────────────────────────────────
// 所需表：CREATE TABLE words (word text primary key, count int default 1, updated_at timestamptz default now());
const _sb = supabase.createClient(
    'https://wteonbwjjnvewriwcbmn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZW9uYndqam52ZXdyaXdjYm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMTk1NjQsImV4cCI6MjA5MTU5NTU2NH0.3jnOBq2-CQQromGMcoLiLG73UviD8XTLmGFiah1oWZ4'
);

// ── Task 2：Realtime 全球共鸣监听 ─────────────────────
// 记录本机最近一次提交的词，避免把自己的 INSERT 变成流星
let _selfWord = null;

/**
 * initRealtimeListener()
 * 监听 words 表的 INSERT & UPDATE 事件。
 * 新词入队 → update() 循环以 800ms 节拍消费，优雅避免暴涌卡顿。
 * 队列上限 20 条：超出丢弃，防御突发洪流。
 */
function initRealtimeListener() {
    _sb.channel('global-resonance')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'words' },
            (payload) => {
                const word  = payload.new?.word;
                const count = payload.new?.count;
                const fs    = payload.new?.first_seen;
                if (!word) return;
                // 无论是否自己，实时更新本地缓存，防止排行榜漂移
                if (count != null) wordCounts.set(word, count);
                if (fs    != null) wordFirstSeen.set(word, fs);
                if (word === _selfWord) return;        // 过滤自己（流星 + 通知）
                if (badWordsFilter(word)) return;
                if (globalStarQueue.length >= 20) return;
                globalStarQueue.push(word);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('[Realtime] 全球共鸣频道已连接');
            }
        });
}

/**
 * submitWord(word) → finalCount
 *
 * 原子自增策略（需在 Supabase 执行以下 SQL 创建 RPC）：
 *   CREATE OR REPLACE FUNCTION increment_word(p_word text)
 *   RETURNS int LANGUAGE sql AS $$
 *     INSERT INTO words (word, count, updated_at)
 *     VALUES (p_word, 1, now())
 *     ON CONFLICT (word)
 *     DO UPDATE SET count = words.count + 1, updated_at = now()
 *     RETURNING count;
 *   $$;
 *
 * 未部署 RPC 时降级为 select→update（非原子，低流量可接受）。
 */
async function submitWord(word) {
    storeWord(word);
    let finalCount = 1;
    try {
        // 优先走原子 RPC
        const { data: rpcData, error: rpcErr } = await _sb.rpc('increment_word', { p_word: word });
        if (!rpcErr && rpcData !== null) {
            finalCount = rpcData;
            wordCounts.set(word, finalCount);
            return finalCount;
        }
        // 降级：select → update（TOCTOU 竞态，可接受于低并发）
        const { data } = await _sb.from('words').select('count').eq('word', word).maybeSingle();
        if (data) {
            finalCount = data.count + 1;
            await _sb.from('words').update({ count: finalCount, updated_at: new Date() }).eq('word', word);
        } else {
            // first_seen 记录首次出现时间，需在 Supabase 执行：
            // ALTER TABLE words ADD COLUMN IF NOT EXISTS first_seen timestamptz DEFAULT now();
            await _sb.from('words').insert({ word, count: 1, first_seen: new Date() });
            finalCount = 1;
        }
        wordCounts.set(word, finalCount);
    } catch (err) {
        console.warn('[submitWord] Supabase error, local count used:', err);
    }
    return finalCount;
}

// 构建星系词池：云端 Top 100，完全基于真实数据
async function initGalaxy(targetWord) {
    let cloudWords = [];
    try {
        const { data } = await _sb
            .from('words')
            .select('word,count,first_seen')
            .order('count', { ascending: false })
            .limit(100);
        if (data) {
            data.forEach(r => {
                wordCounts.set(r.word, r.count);
                // first_seen 字段若不存在，r.first_seen 为 undefined，安全降级
                if (r.first_seen != null) wordFirstSeen.set(r.word, r.first_seen);
            });
            cloudWords = data.map(r => r.word);
        }
    } catch (err) {
        console.warn('[initGalaxy] fetch failed:', err);
    }

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
    try { return JSON.parse(localStorage.getItem('aftertheend_archive') || '{}'); }
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
    localStorage.setItem('aftertheend_archive', JSON.stringify(archive));
}

// 全局 DB 计数缓存：word → 真实 count
const wordCounts = new Map();
// 全局首现时间缓存：word → first_seen ISO 字符串（字段不存在时为 null）
const wordFirstSeen = new Map();

function getWordCount(word) {
    return wordCounts.get(word) ?? 1;
}

/** 判断该词是否在过去 24 小时内首次出现 */
function isNewToday(word) {
    const fs = wordFirstSeen.get(word);
    if (!fs) return false;
    return Date.now() - new Date(fs).getTime() < 86_400_000;
}

/** 将 first_seen ISO 转为可读短日期，如 "4月14日" */
function formatFirstSeen(isoStr) {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
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
        const newTag = isNewToday(word)
            ? '<span class="badge-new">NEW</span>'
            : '';
        item.innerHTML =
            `<span class="leaderboard-word">${word}${newTag}</span>` +
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
            const isNew = isNewToday(word);

            planetPositions[word] = { x, y };

            // 新词用偏绿青色（hue≈160），其余蓝紫（260-320），目标星青色（180）
            const hue = isTarget ? 180 : isNew ? 155 + Math.random() * 15 : 260 + Math.random() * 60;
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
            if (isNew && !isTarget) planet.classList.add('new-planet');

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
        const fsLabel = formatFirstSeen(wordFirstSeen.get(word));
        const newBadge = isNewToday(word) ? '<span class="tooltip-new">今日新星</span>' : '';
        planetTooltip.innerHTML =
            `<span class="tooltip-word">${word}${newBadge}</span>` +
            `<span class="tooltip-stats">共鸣深度：${count} 位灵魂</span>` +
            (fsLabel ? `<span class="tooltip-date">首现于 ${fsLabel}</span>` : '');
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
async function triggerGalaxyTransition(word, echoCount = 1) {
    appState = 'ZOOMING';
    const words = await initGalaxy(word);
    renderGalaxy(words, word);

    galaxyOverlay.classList.add('active');
    galaxyClose.style.opacity = '0';
    galaxyClose.style.pointerEvents = 'none';
    const toast = document.getElementById('resonance-toast');
    if (toast) toast.classList.remove('show');

    setTimeout(() => {
        const pos = planetPositions[word];
        if (!pos) return;
        zoomToViewBox(pos.x, pos.y, () => {
            burstPlanet(pos.x, pos.y);
        
            // 触发仪式感闪屏
            const flash = document.getElementById('ritual-flash');
            if (flash) {
                flash.classList.remove('active');
                void flash.offsetWidth; // Force reflow
                flash.classList.add('active');
            }
        
            setTimeout(() => {
                showGlobalResonanceToast(word, echoCount);
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

                    // 解锁"生成星际档案"按钮（用户主动索取，不自动打断余韵）
                    _unlockArchiveBtn(word, echoCount);
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

galaxyClose.addEventListener('click', hideGalaxy);

// ── 海报生成 ──────────────────────────────────────────

// 随机治愈文案池
const HEALING_QUOTES = [
    '在 10 亿光年外，有人与你感同身受',
    '宇宙在聆听，你的思念从未消散',
    '星辰记录每一个灵魂的回响',
    '终点不是结束，是另一段旅途的起点',
    '有些声音，穿越黑暗依然在共鸣',
    '你不是孤独的星尘，而是被看见的光',
    '在最深的静默里，共鸣无声发生',
    '每一个字，都是宇宙的一次低语',
];

// 生成随机宇宙坐标字符串（返回 HTML，含 nbsp）
function _randomPosterCoords() {
    const glyphs = ['α','β','γ','δ','ε','ζ','η','θ'];
    const g   = glyphs[Math.floor(Math.random() * glyphs.length)];
    const n   = Math.floor(Math.random() * 26).toString(36).toUpperCase();
    const idx = Math.floor(Math.random() * 9000 + 1000);
    return `Sector: ${g}${n} &nbsp;|&nbsp; Index: ${idx}`;
}

// QR 码只在首次调用时生成（同会话内复用）
let _posterQRBuilt = false;
function _ensurePosterQR() {
    if (_posterQRBuilt) return;
    const container = document.getElementById('ptpl-qr');
    if (!container) return;
    container.innerHTML = '';
    try {
        new QRCode(container, {
            text: window.location.href || 'https://end-dmpxo.art/',
            width: 88, height: 88,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        _posterQRBuilt = true;
    } catch (_) { /* QRCode 库未加载时跳过 */ }
}

/**
 * _canvasDiveIn() / _canvasRestore()
 * Task C：海报出现前主画布景深收缩，关闭时恢复
 */
function _canvasDiveIn() {
    canvas.style.transform = 'scale(0.82)';
    canvas.style.filter    = 'blur(10px) brightness(0.6)';
}
function _canvasRestore() {
    canvas.style.transform = '';
    canvas.style.filter    = '';
}

let _posterGenerating = false; // 防重入锁

/**
 * generateSharePoster(word, echoCount)
 * 流程：canvas 景深收缩 → 填充模板 → Loading → 截图 → 展示图片
 */
async function generateSharePoster(word, echoCount = 1) {
    if (_posterGenerating) return;
    _posterGenerating = true;
    const tpl         = document.getElementById('poster-tpl');
    const preview     = document.getElementById('poster-preview');
    const loading     = document.getElementById('poster-loading');
    const previewBody = document.getElementById('poster-preview-body');
    const previewImg  = document.getElementById('poster-preview-img');

    // 0. Task C：主画布景深收缩（800ms CSS 过渡）
    _canvasDiveIn();
    await new Promise(r => setTimeout(r, 800));

    // 1. 填充动态内容
    document.getElementById('ptpl-word').textContent  = word;
    document.getElementById('ptpl-coords').innerHTML  = _randomPosterCoords() + ` &nbsp;|&nbsp; Echoes: ${echoCount}`;
    document.getElementById('ptpl-quote').textContent =
        HEALING_QUOTES[Math.floor(Math.random() * HEALING_QUOTES.length)];
    _ensurePosterQR();

    // 2. 触发 Loading UI，隐藏旧图
    previewBody.classList.add('hidden');
    loading.classList.remove('hidden');
    preview.classList.remove('hidden');

    // 3. 等待 QR + 字体渲染稳定（关键：给浏览器充足的排版时间）
    await new Promise(r => setTimeout(r, 800));

    // 锁定背景触控（iOS 滚动穿透）
    document.body.style.overflow = 'hidden';

    try {
        // 4. 截图：移动端降为 1.5x 防内存溢出，桌面保持 2x
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // 移动端：注入临时 style 禁用 ::before 的 SVG filter 引用
        // （html-to-image 克隆 DOM 时找不到外部 #film-grain，会导致整个截图失败）
        let mobileStylePatch = null;
        if (isMobile) {
            mobileStylePatch = document.createElement('style');
            mobileStylePatch.id = '_poster-mobile-patch';
            mobileStylePatch.textContent = '#poster-tpl::before { filter: none !important; }';
            document.head.appendChild(mobileStylePatch);
        }

        let dataUrl;
        try {
            dataUrl = await htmlToImage.toPng(tpl, {
                pixelRatio: isMobile ? 1.5 : 2,
                backgroundColor: '#050505',
                style: { opacity: 1 },
                skipFonts: true,
            });
        } catch (firstErr) {
            console.warn('[Poster] first capture failed, retrying at 1x:', firstErr);
            if (!isMobile) throw firstErr;
            // 移动端降级：1x + 跳过 noise 节点
            dataUrl = await htmlToImage.toPng(tpl, {
                pixelRatio: 1,
                backgroundColor: '#050505',
                style: { opacity: 1 },
                skipFonts: true,
                filter: node => !node.classList?.contains('ptpl-noise'),
            });
        } finally {
            if (mobileStylePatch) mobileStylePatch.remove();
        }

        // 5. 写入图片，切换到预览状态
        previewImg.src = dataUrl;
        loading.classList.add('hidden');
        previewBody.classList.remove('hidden');
    } catch (err) {
        console.warn('[Poster] capture failed:', err);
        // 用户可见的失败提示，而非静默消失
        loading.querySelector('.poster-loading-text').textContent = '生成失败，请截图保存 🙏';
        setTimeout(() => {
            preview.classList.add('hidden');
            loading.classList.add('hidden');
            loading.querySelector('.poster-loading-text').textContent = '正在生成星际档案…';
            _canvasRestore();
        }, 2000);
    } finally {
        _posterGenerating = false;
    }
}

// 关闭预览：隐藏遮罩 + 恢复 canvas + 解锁滚动
document.getElementById('poster-preview-close').addEventListener('click', () => {
    document.getElementById('poster-preview').classList.add('hidden');
    document.body.style.overflow = '';
    _canvasRestore();
});

/**
 * savePosterImage(dataUrl)
 * 优先级：Web Share API（带文件，iOS 15+/Android Chrome 可直接存相册）
 *        → 创建 blob 下载链接（桌面 / Android 浏览器）
 */
async function savePosterImage(dataUrl) {
    try {
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], '星际档案.png', { type: 'image/png' });

        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: '终点之后 · 星际档案' });
            return;
        }
    } catch (err) {
        if (err.name === 'AbortError') return; // 用户取消
        console.warn('[savePoster] share API failed, falling back:', err);
    }

    // Fallback：blob URL + download（桌面及不支持 share 文件的设备）
    try {
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = '星际档案.png';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
    } catch (err) {
        console.warn('[savePoster] download fallback failed:', err);
        showStarNotify('请截图保存图片');
    }
}

document.getElementById('btn-save-poster').addEventListener('click', () => {
    const img = document.getElementById('poster-preview-img');
    if (img?.src) savePosterImage(img.src);
});

// ── btn-archive：解锁 + 触发 ────────────────────────────
let _archiveWord = null, _archiveCount = 1;

function _unlockArchiveBtn(word, count) {
    _archiveWord = word;
    _archiveCount = count;
    const btn = document.getElementById('btn-archive');
    if (btn) btn.classList.remove('hidden');
}

document.getElementById('btn-archive').addEventListener('click', () => {
    if (_archiveWord) generateSharePoster(_archiveWord, _archiveCount);
});

// ── 右上角流星实时通知（不覆盖主 toast）───────────────
const starNotify = document.getElementById('star-notify');
let _starNotifyTimer = null;

function showStarNotify(word) {
    if (!starNotify) return;
    starNotify.textContent = `刚刚 · 「${word}」飞过星海`;
    starNotify.classList.add('show');
    clearTimeout(_starNotifyTimer);
    _starNotifyTimer = setTimeout(() => starNotify.classList.remove('show'), 3500);
}

// update() 循环已直接调用 showStarNotify，无需覆写 showGlobalResonanceToast

// ── 首屏社会证明：页面加载时拉取灵魂总数 ──────────────
async function loadLiveStats() {
    const el = document.getElementById('live-count');
    if (!el) return;
    try {
        const { count } = await _sb.from('words').select('*', { count: 'exact', head: true });
        el.textContent = (count || 0).toLocaleString('zh-CN');
    } catch (_) {
        el.closest('#live-stats').style.display = 'none';
    }
}

// ── 回访用户档案卡：检查本地存档 ─────────────────────
async function loadArchiveHint() {
    const archive = getArchive();
    const entries = Object.entries(archive);
    if (!entries.length) return;

    // 取最近一次提交的词
    const [lastWord] = entries.sort((a, b) => b[1].lastSeen - a[1].lastSeen)[0];

    try {
        const { data } = await _sb.from('words').select('count').eq('word', lastWord).maybeSingle();
        const count = data?.count ?? 1;

        document.getElementById('archive-word').textContent = lastWord;
        document.getElementById('archive-echo-count').textContent = count.toLocaleString('zh-CN');
        document.getElementById('archive-hint').classList.remove('hidden');
    } catch (_) { /* 网络失败时静默 */ }
}

// Start
window.addEventListener('resize', () => {
    resize();
    if (galaxyOverlay.classList.contains('active')) applyCamera();
});

// 移动端软键盘弹出时，保持输入框在可视区域内
if (window.visualViewport) {
    const _vvHandler = () => {
        const container = document.getElementById('container');
        if (!container || galaxyOverlay.classList.contains('active')) return;
        const keyboardH = window.innerHeight - window.visualViewport.height;
        container.style.transform = keyboardH > 100
            ? `translateY(-${Math.round(keyboardH / 2)}px)`
            : '';
    };
    window.visualViewport.addEventListener('resize', _vvHandler);
    window.visualViewport.addEventListener('scroll', _vvHandler);
}
resize();
initStars();
update();
initRealtimeListener();   // Task 2：启动全球共鸣 Realtime 监听
loadLiveStats();          // P1：首屏社会证明
loadArchiveHint();        // P2：回访档案卡
finalWordsInput.focus();

// 禁止星系层触发浏览器原生拉动回弹
galaxyOverlay.addEventListener('touchmove', (e) => {
    if (appState !== 'IDLE' && !e.target.closest('button') && !e.target.closest('#leaderboard')) {
        e.preventDefault();
    }
}, { passive: false });


// ── 社交分享增强 ────────────────────────────────────────

const VIRAL_CAPTIONS = [
    "在宇宙的尽头，我留下了这两个字... #终点之后 #治愈系 #星空",
    "如果这是最后一次告别，你会说什么？ #after-the-end #灵魂共鸣",
    "这是我在星海中的坐标，有人能看到我吗？ #宇宙 #浪漫",
    "星辰记录每一个灵魂的回响。 #星际档案 #AfterTheEnd",
    "穿越 10 亿光年，寻觅一份感同身受。 #共鸣 #碎片时间"
];

/**
 * shareToSocial(platform)
 * 优先级：Web Share API（系统原生分享表单）→ 复制文案 + 跳转 App
 */
async function shareToSocial(platform) {
    const caption = VIRAL_CAPTIONS[Math.floor(Math.random() * VIRAL_CAPTIONS.length)];
    const shareUrl = window.location.href || 'https://end-dmpxo.art/';

    // 优先：Web Share API（iOS Safari / Android Chrome 原生分享表单）
    if (navigator.share) {
        try {
            await navigator.share({ title: 'AfterTheEnd · 终点之后', text: caption, url: shareUrl });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return; // 用户主动取消，静默处理
            console.warn('[share] Web Share API failed, falling back:', err);
        }
    }

    // 降级：复制文案到剪贴板
    let copied = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(caption);
            copied = true;
        }
    } catch (_) {}

    if (!copied) {
        const ta = document.createElement('textarea');
        ta.value = caption;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); copied = true; } catch (_) {}
        document.body.removeChild(ta);
    }

    // 跳转目标 App：隐藏 iframe 触发 scheme，不导致当前页面导航/卡死
    const schemes = { xhs: 'xhsdiscover://', wechat: 'weixin://dl/moments' };
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && schemes[platform]) {
        showStarNotify(copied ? '文案已复制 · 正在唤起 App…' : '正在唤起 App…');
        setTimeout(() => {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none';
            iframe.src = schemes[platform];
            document.body.appendChild(iframe);
            setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }, 2000);
        }, 300);
    } else {
        showStarNotify(copied ? '文案已复制到剪贴板' : '复制失败，请手动复制');
    }
}
