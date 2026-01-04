/**
 * ATOMIC BACKEND SERVER - FINAL VERSION
 * Serve: Site Oficial + Painel Admin + API
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Octokit } = require("@octokit/rest");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de Segurança e Parser
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));

// --- SERVIR ARQUIVOS ESTÁTICOS (SITE E PAINEL) ---
app.use(express.static(__dirname));

// --- CONFIGURAÇÃO DO GITHUB ---
const REPO_OWNER = 'atomicgamesbrasil';
const REPO_NAME = 'siteoficial';
const BRANCH = 'main';

// CAMINHOS DOS ARQUIVOS NO GITHUB
const PATHS = {
    products: 'produtos.json',
    banners: 'banners.json',
    orders: 'orders.json',
    config: 'site-config.json',
    stats: 'stats.json',
    imgSite: 'img site',
    imgBanner: 'BANNER SAZIONAL'
};

// Verifica Token
if (!process.env.GITHUB_TOKEN) {
    console.error("❌ [ERRO] GITHUB_TOKEN não configurado no ambiente.");
}

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token ausente' });

    jwt.verify(token, process.env.JWT_SECRET || 'atomic_secret_key', (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido' });
        req.user = user;
        next();
    });
};

// --- FUNÇÕES AUXILIARES GITHUB ---
async function getFile(path) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: REPO_OWNER, repo: REPO_NAME, path: path, ref: BRANCH,
        });
        if (Array.isArray(data)) return { content: [], sha: null }; // É diretório
        return {
            content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')),
            sha: data.sha
        };
    } catch (e) {
        return { content: null, sha: null }; // Arquivo não existe
    }
}

async function saveFile(path, content, message, sha = null) {
    try {
        if (!sha) {
            const current = await getFile(path);
            sha = current.sha;
        }
        await octokit.rest.repos.createOrUpdateFileContents({
            owner: REPO_OWNER, repo: REPO_NAME, path: path,
            message: message,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
            branch: BRANCH,
            sha: sha
        });
    } catch (e) {
        console.error(`Erro ao salvar ${path}:`, e.message);
        throw e;
    }
}

// --- ROTAS API: AUTENTICAÇÃO ---
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD || process.env.SENHA_DE_ADMINISTRADOR || 'admin';
    
    if (password === adminPass) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'atomic_secret_key', { expiresIn: '12h' });
        return res.json({ token });
    }
    return res.status(401).json({ message: 'Senha incorreta' });
});

// --- ROTAS API: PRODUTOS ---
app.get('/api/products', async (req, res) => {
    const data = await getFile(PATHS.products);
    // Rota pública para o site ler produtos
    res.json(Array.isArray(data.content) ? data.content : []);
});

app.get('/api/public/products', async (req, res) => {
    // Alias para garantir compatibilidade com main.js
    const data = await getFile(PATHS.products);
    res.json(Array.isArray(data.content) ? data.content : []);
});

app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        const product = req.body;
        const current = await getFile(PATHS.products);
        let list = Array.isArray(current.content) ? current.content : [];
        
        const idx = list.findIndex(p => p.id === product.id);
        if (idx >= 0) list[idx] = product;
        else list.unshift(product);
        
        await saveFile(PATHS.products, list, `UPDATE: Product ${product.name}`, current.sha);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const current = await getFile(PATHS.products);
        const list = (current.content || []).filter(p => p.id !== req.params.id);
        await saveFile(PATHS.products, list, `DELETE: Product ${req.params.id}`, current.sha);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS API: BANNERS ---
app.get('/api/banners', async (req, res) => {
    const data = await getFile(PATHS.banners);
    res.json(data.content || []);
});

app.post('/api/banners', authenticateToken, async (req, res) => {
    try {
        const current = await getFile(PATHS.banners);
        await saveFile(PATHS.banners, req.body, "UPDATE: Banners", current.sha);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS API: PEDIDOS (ORDERS) ---
app.get('/api/orders', authenticateToken, async (req, res) => {
    const data = await getFile(PATHS.orders);
    res.json(Array.isArray(data.content) ? data.content : []);
});

app.post('/api/orders', authenticateToken, async (req, res) => {
    // Criação Manual pelo Admin
    try {
        const order = { ...req.body, id: Date.now().toString().slice(-6), date: new Date().toLocaleString('pt-BR') };
        const current = await getFile(PATHS.orders);
        let list = Array.isArray(current.content) ? current.content : [];
        list.unshift(order);
        await saveFile(PATHS.orders, list, `ADMIN ORDER: ${order.id}`, current.sha);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/update', authenticateToken, async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const current = await getFile(PATHS.orders);
        let list = Array.isArray(current.content) ? current.content : [];
        const idx = list.findIndex(o => o.id === orderId);
        if (idx !== -1) {
            list[idx].status = status;
            await saveFile(PATHS.orders, list, `UPDATE ORDER STATUS: ${orderId}`, current.sha);
            res.json({ success: true });
        } else res.status(404).json({ error: 'Not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [NEW] Rota de Edição Completa
app.post('/api/orders/edit', authenticateToken, async (req, res) => {
    try {
        const updatedOrder = req.body;
        const current = await getFile(PATHS.orders);
        let list = Array.isArray(current.content) ? current.content : [];
        const idx = list.findIndex(o => o.id === updatedOrder.id);
        
        if (idx !== -1) {
            // Merge para garantir que campos não enviados sejam preservados, mas atualizando os novos
            list[idx] = { ...list[idx], ...updatedOrder };
            await saveFile(PATHS.orders, list, `EDIT ORDER: ${updatedOrder.id}`, current.sha);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [NEW] Rota de Exclusão Individual
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const current = await getFile(PATHS.orders);
        let list = Array.isArray(current.content) ? current.content : [];
        
        const newList = list.filter(o => o.id !== id);
        
        if (list.length !== newList.length) {
            await saveFile(PATHS.orders, newList, `DELETE ORDER: ${id}`, current.sha);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [NEW] Rota de Limpeza Total (Clear All)
app.post('/api/orders/clear', authenticateToken, async (req, res) => {
    try {
        const current = await getFile(PATHS.orders);
        // Salva array vazio
        await saveFile(PATHS.orders, [], "CLEAR ALL ORDERS", current.sha);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/public/order', async (req, res) => {
    // Criação Automática pelo Site
    try {
        const { customer, items, total } = req.body;
        const order = {
            id: Date.now().toString().slice(-6),
            customer, items, total, status: 'pending',
            date: new Date().toLocaleString('pt-BR')
        };
        
        const current = await getFile(PATHS.orders);
        let list = Array.isArray(current.content) ? current.content : [];
        list.unshift(order);
        // Limita a 100 pedidos para não pesar o JSON
        if(list.length > 100) list = list.slice(0, 100);
        
        await saveFile(PATHS.orders, list, `SITE ORDER: ${order.id}`, current.sha);
        res.json({ success: true, orderId: order.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS API: ESTATÍSTICAS (ANALYTICS) ---
app.get('/api/stats', authenticateToken, async (req, res) => {
    const data = await getFile(PATHS.stats);
    res.json(data.content || { 
        total_visits: 0, today_visits: 0,
        total_carts: 0, today_carts: 0,
        total_whatsapp: 0, today_whatsapp: 0,
        last_updated: new Date().toISOString()
    });
});

app.post('/api/public/visit', async (req, res) => {
    try {
        // Tipos: 'visit', 'add_to_cart', 'whatsapp'
        const { type } = req.body; 
        const current = await getFile(PATHS.stats);
        
        let stats = current.content || { 
            total_visits: 0, today_visits: 0, 
            total_carts: 0, today_carts: 0,
            total_whatsapp: 0, today_whatsapp: 0,
            last_updated: new Date().toISOString() 
        };
        
        const now = new Date();
        const last = new Date(stats.last_updated);
        
        // Reset counters if day changed
        if (now.getDate() !== last.getDate() || now.getMonth() !== last.getMonth()) {
            stats.today_visits = 0;
            stats.today_carts = 0;
            stats.today_whatsapp = 0;
        }
        
        stats.last_updated = now.toISOString();
        
        // Atualiza o contador específico
        if (!type || type === 'visit') {
            stats.total_visits = (stats.total_visits || 0) + 1;
            stats.today_visits = (stats.today_visits || 0) + 1;
        } else if (type === 'add_to_cart') {
            stats.total_carts = (stats.total_carts || 0) + 1;
            stats.today_carts = (stats.today_carts || 0) + 1;
        } else if (type === 'whatsapp') {
            stats.total_whatsapp = (stats.total_whatsapp || 0) + 1;
            stats.today_whatsapp = (stats.today_whatsapp || 0) + 1;
        }
        
        // Salva em background (Fire and Forget)
        const msg = type ? `AUTO: ${type} +1` : "AUTO: Visit +1";
        saveFile(PATHS.stats, stats, msg, current.sha).catch(console.error);
        
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- ROTAS API: CONFIGURAÇÃO ---
app.get('/api/config', async (req, res) => {
    const data = await getFile(PATHS.config);
    res.json(data.content || {});
});

app.post('/api/config', authenticateToken, async (req, res) => {
    try {
        const current = await getFile(PATHS.config);
        await saveFile(PATHS.config, req.body, "UPDATE: Config", current.sha);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS API: UPLOAD IMAGEM ---
app.post('/api/upload', authenticateToken, async (req, res) => {
    try {
        const { filename, content, folder } = req.body;
        const path = folder === 'banners' ? `${PATHS.imgBanner}/${filename}` : `${PATHS.imgSite}/${filename}`;
        
        // Verifica se existe para pegar SHA (Overwrite)
        let sha = null;
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner: REPO_OWNER, repo: REPO_NAME, path: path, ref: BRANCH
            });
            sha = data.sha;
        } catch(e) {}

        await octokit.rest.repos.createOrUpdateFileContents({
            owner: REPO_OWNER, repo: REPO_NAME, path: path,
            message: `UPLOAD: ${filename}`,
            content: content,
            branch: BRANCH,
            sha: sha
        });

        const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${encodeURI(path)}`;
        res.json({ url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTA FALLBACK (SPA) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Servidor Atomic Online na porta ${PORT}`);
});
