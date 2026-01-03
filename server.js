/**
 * ATOMIC BACKEND SERVER - VERSION 2.1
 * Architecture: Monolithic with Service Layer Pattern
 * Standard: CommonJS (Node.js)
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Octokit } = require("@octokit/rest");

// --- CONFIGURATION & CONSTANTS ---
const CONFIG = {
    PORT: process.env.PORT || 3000,
    GITHUB: {
        OWNER: 'atomicgamesbrasil',
        REPO: 'siteoficial',
        BRANCH: 'main',
        TOKEN: process.env.GITHUB_TOKEN
    },
    JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_key_change_me',
    ADMIN_PASS: process.env.ADMIN_PASSWORD || process.env.SENHA_DE_ADMINISTRADOR || 'admin',
    PATHS: {
        PRODUCTS: 'produtos.json',
        BANNERS: 'banners.json',
        ORDERS: 'orders.json',
        CONFIG: 'site-config.json',
        STATS: 'stats.json',
        IMG_SITE: 'img site',
        IMG_BANNER: 'BANNER SAZIONAL'
    }
};

// --- VALIDATION ---
if (!CONFIG.GITHUB.TOKEN) {
    console.error("🚨 [CRITICAL] GITHUB_TOKEN is missing. The server cannot persist data.");
    process.exit(1);
}

// --- INITIALIZATION ---
const app = express();
const octokit = new Octokit({ auth: CONFIG.GITHUB.TOKEN });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// --- DATA LAYER (GITHUB SERVICE) ---
const DatabaseService = {
    cache: {
        stats: { total_visits: 0, today_visits: 0, last_updated: new Date().toISOString(), sha: null },
        orders: { content: [], sha: null },
        products: { content: [], sha: null },
        banners: { content: [], sha: null },
        config: { content: {}, sha: null },
        isStatsDirty: false
    },

    async getFile(filePath) {
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner: CONFIG.GITHUB.OWNER,
                repo: CONFIG.GITHUB.REPO,
                path: filePath,
                ref: CONFIG.GITHUB.BRANCH,
            });

            if (data.content) {
                const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
                return { content: JSON.parse(decoded), sha: data.sha };
            }
            return { content: [], sha: data.sha };
        } catch (e) {
            if (e.status === 404) return { content: null, sha: null };
            throw e;
        }
    },

    async saveFile(filePath, content, commitMessage, sha = null) {
        try {
            const base64Content = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
            const params = {
                owner: CONFIG.GITHUB.OWNER,
                repo: CONFIG.GITHUB.REPO,
                path: filePath,
                message: commitMessage,
                content: base64Content,
                branch: CONFIG.GITHUB.BRANCH
            };
            if (sha) params.sha = sha;

            const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);
            return data.content.sha;
        } catch (e) {
            console.error(`❌ [DB ERROR] Save failed for ${filePath}:`, e.message);
            throw e;
        }
    },

    async uploadImage(filename, base64Content, folder) {
        const targetPath = folder === 'banners' 
            ? `${CONFIG.PATHS.IMG_BANNER}/${filename}` 
            : `${CONFIG.PATHS.IMG_SITE}/${filename}`;
        
        let sha = null;
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner: CONFIG.GITHUB.OWNER,
                repo: CONFIG.GITHUB.REPO,
                path: targetPath,
                ref: CONFIG.GITHUB.BRANCH
            });
            sha = data.sha;
        } catch (e) {}

        await octokit.rest.repos.createOrUpdateFileContents({
            owner: CONFIG.GITHUB.OWNER,
            repo: CONFIG.GITHUB.REPO,
            path: targetPath,
            message: `UPLOAD: ${filename}`,
            content: base64Content,
            branch: CONFIG.GITHUB.BRANCH,
            sha: sha
        });

        return `https://raw.githubusercontent.com/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/${CONFIG.GITHUB.BRANCH}/${encodeURI(targetPath)}`;
    },

    async initialize() {
        console.log("🔄 [SYSTEM] Hydrating Cache...");
        try {
            const [stats, orders, prods, bans, conf] = await Promise.all([
                this.getFile(CONFIG.PATHS.STATS),
                this.getFile(CONFIG.PATHS.ORDERS),
                this.getFile(CONFIG.PATHS.PRODUCTS),
                this.getFile(CONFIG.PATHS.BANNERS),
                this.getFile(CONFIG.PATHS.CONFIG)
            ]);

            if (stats.content) this.cache.stats = { ...stats.content, sha: stats.sha };
            if (orders.content) this.cache.orders = { content: orders.content, sha: orders.sha };
            if (prods.content) this.cache.products = { content: prods.content, sha: prods.sha };
            if (bans.content) this.cache.banners = { content: bans.content, sha: bans.sha };
            if (conf.content) this.cache.config = { content: conf.content, sha: conf.sha };

            console.log(`✅ [SYSTEM] Cache Ready. Products: ${this.cache.products.content.length}`);
        } catch (e) {
            console.error("❌ [SYSTEM] Initialization failed:", e.message);
        }
    },

    async flushStats() {
        if (!this.cache.isStatsDirty) return;
        this.cache.stats.last_updated = new Date().toISOString();
        const payload = { 
            total_visits: this.cache.stats.total_visits, 
            today_visits: this.cache.stats.today_visits,
            last_updated: this.cache.stats.last_updated
        };
        try {
            const newSha = await this.saveFile(CONFIG.PATHS.STATS, payload, "AUTO: Update Stats", this.cache.stats.sha);
            this.cache.stats.sha = newSha;
            this.cache.isStatsDirty = false;
        } catch (e) {}
    }
};

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });
        req.user = user;
        next();
    });
};

// --- ROUTES ---

// Public Data API (Instant Updates)
app.get('/api/public/products', async (req, res) => res.json(DatabaseService.cache.products.content || []));
app.get('/api/public/banners', async (req, res) => res.json(DatabaseService.cache.banners.content || []));
app.get('/api/public/config', async (req, res) => res.json(DatabaseService.cache.config.content || {}));
app.get('/api/public/wake', (req, res) => res.json({ status: 'awake', ts: Date.now() }));

// Auth
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body || {};
    if (password === CONFIG.ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, CONFIG.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ token });
    }
    return res.status(401).json({ message: 'Invalid credentials' });
});

// Admin Products (Updating Cache)
app.get('/api/products', requireAuth, (req, res) => res.json(DatabaseService.cache.products.content));
app.post('/api/products', requireAuth, async (req, res) => {
    try {
        const product = req.body;
        let products = Array.isArray(DatabaseService.cache.products.content) ? [...DatabaseService.cache.products.content] : [];
        const idx = products.findIndex(p => p.id === product.id);
        if (idx !== -1) products[idx] = product; else products.unshift(product);
        
        DatabaseService.cache.products.content = products;
        const newSha = await DatabaseService.saveFile(CONFIG.PATHS.PRODUCTS, products, `UPDATE: Product ${product.name}`, DatabaseService.cache.products.sha);
        DatabaseService.cache.products.sha = newSha;
        res.json({ message: 'Saved' });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        DatabaseService.cache.products.content = DatabaseService.cache.products.content.filter(p => p.id !== id);
        const newSha = await DatabaseService.saveFile(CONFIG.PATHS.PRODUCTS, DatabaseService.cache.products.content, `DELETE: Product ${id}`, DatabaseService.cache.products.sha);
        DatabaseService.cache.products.sha = newSha;
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).send(e.message); }
});

// Orders & Stats (Simplified)
app.get('/api/orders', requireAuth, (req, res) => res.json(DatabaseService.cache.orders.content));
app.post('/api/public/order', async (req, res) => {
    try {
        const newOrder = { id: Date.now().toString().slice(-6), ...req.body, status: "pending", date: new Date().toLocaleString('pt-BR') };
        DatabaseService.cache.orders.content.unshift(newOrder);
        res.json({ success: true, orderId: newOrder.id });
        const newSha = await DatabaseService.saveFile(CONFIG.PATHS.ORDERS, DatabaseService.cache.orders.content, `NEW ORDER: ${newOrder.id}`, DatabaseService.cache.orders.sha);
        DatabaseService.cache.orders.sha = newSha;
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/public/track', (req, res) => {
    DatabaseService.cache.stats.total_visits++;
    DatabaseService.cache.stats.today_visits++;
    DatabaseService.cache.isStatsDirty = true;
    res.json({ success: true });
});

// Uploads
app.post('/api/upload', requireAuth, async (req, res) => {
    try {
        const { filename, content, folder } = req.body;
        const url = await DatabaseService.uploadImage(filename, content, folder);
        res.json({ url });
    } catch (e) { res.status(500).send(e.message); }
});

// Config Admin
app.get('/api/config', requireAuth, (req, res) => res.json(DatabaseService.cache.config.content));
app.post('/api/config', requireAuth, async (req, res) => {
    try {
        DatabaseService.cache.config.content = req.body;
        const newSha = await DatabaseService.saveFile(CONFIG.PATHS.CONFIG, req.body, "UPDATE: Config", DatabaseService.cache.config.sha);
        DatabaseService.cache.config.sha = newSha;
        res.json({ message: 'Saved' });
    } catch (e) { res.status(500).send(e.message); }
});

// Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public.html')));

// STARTUP
DatabaseService.initialize().then(() => {
    app.listen(CONFIG.PORT, () => console.log(`🚀 [ATOMIC] Online Port ${CONFIG.PORT}`));
    setInterval(() => DatabaseService.flushStats(), 5 * 60 * 1000);
});
