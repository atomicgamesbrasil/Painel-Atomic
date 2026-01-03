/**
 * ATOMIC BACKEND SERVER
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
app.use(cors()); // Allow Cross-Origin for public access
app.use(express.json({ limit: '50mb' })); // Support large image uploads
app.use(express.static(__dirname)); // Serve Frontend

// --- DATA LAYER (GITHUB SERVICE) ---
// Encapsulates all interactions with the persistence layer
const DatabaseService = {
    // In-Memory Cache to reduce latency and API calls
    cache: {
        stats: { total_visits: 0, today_visits: 0, last_updated: new Date().toISOString(), sha: null },
        orders: { content: [], sha: null },
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
            if (e.status === 404) {
                console.log(`ℹ️ [DB] File not found: ${filePath}. Assuming empty/new.`);
                return { content: null, sha: null };
            }
            console.error(`⚠️ [DB ERROR] Read failed for ${filePath}:`, e.message);
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
            // Check if file exists to update instead of create (get SHA)
            const { data } = await octokit.rest.repos.getContent({
                owner: CONFIG.GITHUB.OWNER,
                repo: CONFIG.GITHUB.REPO,
                path: targetPath,
                ref: CONFIG.GITHUB.BRANCH
            });
            sha = data.sha;
        } catch (e) { /* File doesn't exist, proceed with create */ }

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
        console.log("🔄 [SYSTEM] Hydrating In-Memory Cache...");
        
        // 1. Stats
        const stats = await this.getFile(CONFIG.PATHS.STATS);
        if (stats.content) this.cache.stats = { ...stats.content, sha: stats.sha };

        // 2. Orders
        const orders = await this.getFile(CONFIG.PATHS.ORDERS);
        const storedOrders = Array.isArray(orders.content) ? orders.content : [];
        // Merge strategy: RAM (Newest) + Disk (Stored), unique by ID
        const merged = [...this.cache.orders.content, ...storedOrders]
            .filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
        
        this.cache.orders.content = merged;
        this.cache.orders.sha = orders.sha;

        console.log(`✅ [SYSTEM] Ready. Active Orders: ${this.cache.orders.content.length}`);
    },

    async flushStats() {
        if (!this.cache.isStatsDirty) return;
        console.log("💾 [AUTO] Syncing Stats to GitHub...");
        
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
        } catch (e) {
            console.error("❌ [AUTO] Stats Sync Failed");
        }
    }
};

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Unauthorized: No token' });

    jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Forbidden: Invalid token' });
        req.user = user;
        next();
    });
};

// --- ROUTES ---

// System
app.get('/health', (req, res) => res.status(200).send('OK'));
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

// Products
app.get('/api/products', requireAuth, async (req, res) => {
    try {
        const data = await DatabaseService.getFile(CONFIG.PATHS.PRODUCTS);
        res.json(data.content || []);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch products' }); }
});

app.post('/api/products', requireAuth, async (req, res) => {
    try {
        const product = req.body;
        delete product.isEdit; // Clean UI flags
        
        const dbData = await DatabaseService.getFile(CONFIG.PATHS.PRODUCTS);
        let products = Array.isArray(dbData.content) ? [...dbData.content] : [];
        
        const idx = products.findIndex(p => p.id === product.id);
        if (idx !== -1) products[idx] = product;
        else products.unshift(product);

        await DatabaseService.saveFile(CONFIG.PATHS.PRODUCTS, products, `UPDATE: Product ${product.name}`, dbData.sha);
        res.json({ message: 'Product saved' });
    } catch (e) { res.status(500).json({ message: 'Failed to save product' }); }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const dbData = await DatabaseService.getFile(CONFIG.PATHS.PRODUCTS);
        const filtered = (dbData.content || []).filter(p => p.id !== id);
        
        await DatabaseService.saveFile(CONFIG.PATHS.PRODUCTS, filtered, `DELETE: Product ${id}`, dbData.sha);
        res.json({ message: 'Product deleted' });
    } catch (e) { res.status(500).json({ message: 'Failed to delete product' }); }
});

// Banners
app.get('/api/banners', requireAuth, async (req, res) => {
    try {
        const data = await DatabaseService.getFile(CONFIG.PATHS.BANNERS);
        res.json(data.content || []);
    } catch (e) { res.status(500).json({ message: 'Failed to fetch banners' }); }
});

app.post('/api/banners', requireAuth, async (req, res) => {
    try {
        const dbData = await DatabaseService.getFile(CONFIG.PATHS.BANNERS);
        await DatabaseService.saveFile(CONFIG.PATHS.BANNERS, req.body, "UPDATE: Banners", dbData.sha);
        res.json({ message: 'Banners saved' });
    } catch (e) { res.status(500).json({ message: 'Failed to save banners' }); }
});

// Orders (Admin)
app.get('/api/orders', requireAuth, (req, res) => {
    // Serve from cache for speed
    res.json(DatabaseService.cache.orders.content);
});

app.post('/api/orders/update', requireAuth, async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const list = DatabaseService.cache.orders.content;
        const idx = list.findIndex(o => o.id === orderId);

        if (idx !== -1) {
            list[idx].status = status;
            // Optimistic update in cache, then async save
            const newSha = await DatabaseService.saveFile(CONFIG.PATHS.ORDERS, list, `UPDATE ORDER: ${orderId}`, DatabaseService.cache.orders.sha);
            DatabaseService.cache.orders.sha = newSha;
            res.json({ success: true });
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (e) { res.status(500).json({ message: 'Failed to update order' }); }
});

app.post('/api/orders', requireAuth, async (req, res) => {
    // Admin manual creation
    try {
        const { customer, items, total, status } = req.body;
        const newOrder = {
            id: Date.now().toString().slice(-6),
            customer: customer || "Manual Entry",
            items: items || "Direct Sale",
            total: total || "R$ 0,00",
            status: status || "approved",
            date: new Date().toLocaleString('pt-BR')
        };
        
        DatabaseService.cache.orders.content.unshift(newOrder);
        // Trim history to keep JSON file manageable (optional, currently 100)
        if (DatabaseService.cache.orders.content.length > 100) {
            DatabaseService.cache.orders.content = DatabaseService.cache.orders.content.slice(0, 100);
        }

        const newSha = await DatabaseService.saveFile(CONFIG.PATHS.ORDERS, DatabaseService.cache.orders.content, `ADMIN ORDER: ${newOrder.id}`, DatabaseService.cache.orders.sha);
        DatabaseService.cache.orders.sha = newSha;
        res.json({ success: true, orderId: newOrder.id });
    } catch (e) { res.status(500).json({ message: 'Failed to create order' }); }
});

// Orders (Public)
app.post('/api/public/order', async (req, res) => {
    try {
        const { customer, items, total } = req.body;
        
        if (!customer || !total) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const newOrder = {
            id: Date.now().toString().slice(-6),
            customer: customer,
            items: items || "Web Order",
            total: total,
            status: "pending",
            date: new Date().toLocaleString('pt-BR')
        };

        // 1. Save to RAM immediately (Fastest response)
        DatabaseService.cache.orders.content.unshift(newOrder);
        if (DatabaseService.cache.orders.content.length > 100) {
            DatabaseService.cache.orders.content = DatabaseService.cache.orders.content.slice(0, 100);
        }

        console.log(`📨 [PUBLIC] Order #${newOrder.id} received`);
        res.json({ success: true, orderId: newOrder.id });

        // 2. Persist to Disk asynchronously (Don't block response)
        try {
            const newSha = await DatabaseService.saveFile(CONFIG.PATHS.ORDERS, DatabaseService.cache.orders.content, `NEW ORDER: ${newOrder.id}`, DatabaseService.cache.orders.sha);
            DatabaseService.cache.orders.sha = newSha;
        } catch (e) {
            console.error("⚠️ [RISK] Order saved to RAM but failed to sync to GitHub:", e.message);
        }

    } catch (e) {
        console.error("❌ [CRITICAL] Public Order Error:", e);
        res.status(500).json({ message: 'Internal Error' });
    }
});

// Analytics
app.get('/api/stats', requireAuth, (req, res) => res.json(DatabaseService.cache.stats));

app.post('/api/public/track', (req, res) => {
    DatabaseService.cache.stats.total_visits = (DatabaseService.cache.stats.total_visits || 0) + 1;
    DatabaseService.cache.stats.today_visits = (DatabaseService.cache.stats.today_visits || 0) + 1;
    DatabaseService.cache.isStatsDirty = true;
    res.json({ success: true });
});

// Config
app.get('/api/config', requireAuth, async (req, res) => {
    try {
        const data = await DatabaseService.getFile(CONFIG.PATHS.CONFIG);
        res.json(data.content || {});
    } catch (e) { res.status(500).json({ message: 'Fetch config error' }); }
});

app.post('/api/config', requireAuth, async (req, res) => {
    try {
        const dbData = await DatabaseService.getFile(CONFIG.PATHS.CONFIG);
        await DatabaseService.saveFile(CONFIG.PATHS.CONFIG, req.body, "UPDATE: Site Config", dbData.sha);
        res.json({ message: 'Config saved' });
    } catch (e) { res.status(500).json({ message: 'Save config error' }); }
});

// Uploads
app.post('/api/upload', requireAuth, async (req, res) => {
    try {
        const { filename, content, folder } = req.body;
        const url = await DatabaseService.uploadImage(filename, content, folder);
        res.json({ url });
    } catch (e) { res.status(500).json({ message: 'Upload failed' }); }
});

// Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- STARTUP SEQUENCE ---
DatabaseService.initialize().then(() => {
    app.listen(CONFIG.PORT, () => console.log(`\n🚀 [SERVER] Atomic Backend Online on Port ${CONFIG.PORT}`));
    
    // Auto-sync stats every 10 minutes
    setInterval(() => DatabaseService.flushStats(), 10 * 60 * 1000);
});
