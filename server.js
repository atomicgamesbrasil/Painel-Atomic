/**
 * ATOMIC BACKEND SERVER
 * Serve a API de segurança E o Frontend do Painel
 * ARQUIVO: JavaScript Puro (CommonJS) - Não adicionar interfaces TS aqui.
 */

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Octokit } = require("@octokit/rest");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de Segurança - CORS Permissivo para evitar bloqueios do Site Oficial
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));

// --- SERVIR ARQUIVOS DO FRONTEND ---
app.use(express.static(__dirname));

// --- CONFIGURAÇÃO DO REPOSITÓRIO ---
const REPO_OWNER = 'atomicgamesbrasil';
const REPO_NAME = 'siteoficial';
const BRANCH = 'main';

// ARQUIVOS
const PATH_PRODUCTS = 'produtos.json'; 
const PATH_BANNERS = 'banners.json';
const PATH_ORDERS = 'orders.json';
const PATH_CONFIG = 'site-config.json';
const PATH_STATS = 'stats.json';
const PATH_IMG_SITE = 'img site';
const PATH_IMG_BANNER = 'BANNER SAZIONAL';

// --- IN-MEMORY CACHE ---
let cachedStats = {
    total_visits: 0,
    today_visits: 0,
    last_updated: new Date().toISOString(),
    sha: null
};

// CACHE DE PEDIDOS
let cachedOrders = {
    content: [],
    sha: null,
    initialized: false
};

let isStatsDirty = false;

if (!process.env.GITHUB_TOKEN) {
    console.error("❌ [CRÍTICO] GITHUB_TOKEN não encontrado!");
}

const octokit = new Octokit({ 
  auth: process.env.GITHUB_TOKEN 
});

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token não fornecido' });

  const secret = process.env.JWT_SECRET || 'dev_secret_key_change_me';

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    req.user = user;
    next();
  });
};

// --- FUNÇÕES AUXILIARES ---
async function getFileContent(filePath) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: REPO_OWNER, repo: REPO_NAME, path: filePath, ref: BRANCH,
        });
        if (data.content) {
             return {
                content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')),
                sha: data.sha
            };
        }
        return { content: [], sha: data.sha };
    } catch (e) {
        console.error(`⚠️ [GITHUB ERROR] Falha ao ler: ${filePath}`);
        return { content: null, sha: null }; 
    }
}

async function saveFileContent(path, content, message, sha = null) {
    const base64Content = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
    const params = {
        owner: REPO_OWNER, repo: REPO_NAME, path: path, 
        message: message, content: base64Content, branch: BRANCH
    };
    if (sha) params.sha = sha;
    const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);
    return data.content.sha; // Retorna novo SHA
}

// --- LOGIC: MEMORY INITIALIZATION ---
async function initializeData() {
    console.log("🔄 Inicializando Cache de Dados...");
    
    // 1. Carrega Stats
    const statsData = await getFileContent(PATH_STATS);
    if(statsData.content) {
        cachedStats = { ...statsData.content, sha: statsData.sha };
    }

    // 2. Carrega Pedidos (COM MERGE INTELIGENTE)
    // Se pedidos chegarem enquanto o servidor liga, não podemos sobrescrevê-los
    const ordersData = await getFileContent(PATH_ORDERS);
    
    // Pega os pedidos que já estavam no GitHub
    const githubOrders = Array.isArray(ordersData.content) ? ordersData.content : [];
    
    // Pega os pedidos que chegaram na memória RAM enquanto baixávamos do GitHub
    const pendingOrders = cachedOrders.content;
    
    // Junta tudo: Pedidos Novos (RAM) + Pedidos Velhos (GitHub)
    // Remove duplicatas por ID apenas por segurança
    const mergedOrders = [...pendingOrders, ...githubOrders].filter((v,i,a)=>a.findIndex(v2=>(v2.id===v.id))===i);

    cachedOrders.content = mergedOrders;
    cachedOrders.sha = ordersData.sha;
    cachedOrders.initialized = true;
    
    console.log(`✅ Dados Prontos. ${cachedOrders.content.length} Pedidos ativos.`);
}

async function flushStatsToGitHub() {
    if(!isStatsDirty) return;
    try {
        console.log("💾 Sincronizando Stats...");
        cachedStats.last_updated = new Date().toISOString();
        const contentToSave = { 
            total_visits: cachedStats.total_visits,
            today_visits: cachedStats.today_visits,
            last_updated: cachedStats.last_updated
        };
        const newSha = await saveFileContent(PATH_STATS, contentToSave, "AUTO: Update Stats", cachedStats.sha);
        cachedStats.sha = newSha;
        isStatsDirty = false;
    } catch(e) { console.error("❌ Falha ao salvar Stats:", e.message); }
}

initializeData();
setInterval(flushStatsToGitHub, 10 * 60 * 1000); 

// --- ROTAS ---

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/public/wake', (req, res) => {
    // Endpoint leve para acordar o servidor
    res.json({ status: 'awake', time: new Date().toISOString() });
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { password } = req.body || {};
    const serverPassword = process.env.ADMIN_PASSWORD || process.env.SENHA_DE_ADMINISTRADOR || 'admin';
    if (password === serverPassword) {
      const user = { role: 'admin' };
      const secret = process.env.JWT_SECRET || 'dev_secret_key_change_me';
      const accessToken = jwt.sign(user, secret, { expiresIn: '8h' });
      return res.json({ token: accessToken });
    } else {
      return res.status(401).json({ message: 'Senha incorreta' });
    }
  } catch (error) { return res.status(500).json({ message: 'Erro interno.' }); }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const data = await getFileContent(PATH_PRODUCTS);
    res.json(data.content || []);
  } catch (error) { res.status(500).json({ message: 'Erro ao buscar produtos.' }); }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const product = req.body;
    delete product.isEdit;
    const currentData = await getFileContent(PATH_PRODUCTS);
    let newProducts = Array.isArray(currentData.content) ? [...currentData.content] : [];
    const index = newProducts.findIndex(p => p.id === product.id);
    if (index !== -1) newProducts[index] = product;
    else newProducts.unshift(product);
    await saveFileContent(PATH_PRODUCTS, newProducts, `UPDATE: ${product.name}`, currentData.sha);
    res.json({ message: 'Salvo com sucesso' });
  } catch (error) { res.status(500).json({ message: 'Erro ao salvar.' }); }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const currentData = await getFileContent(PATH_PRODUCTS);
    const newProducts = (currentData.content || []).filter(p => p.id !== id);
    await saveFileContent(PATH_PRODUCTS, newProducts, `DEL: ${id}`, currentData.sha);
    res.json({ message: 'Removido' });
  } catch (error) { res.status(500).json({ message: 'Erro ao deletar' }); }
});

app.get('/api/banners', authenticateToken, async (req, res) => {
  try { const data = await getFileContent(PATH_BANNERS); res.json(data.content || []); } 
  catch (error) { res.status(500).json({ message: 'Erro banners' }); }
});

app.post('/api/banners', authenticateToken, async (req, res) => {
  try {
    const bannersData = req.body;
    const currentData = await getFileContent(PATH_BANNERS);
    await saveFileContent(PATH_BANNERS, bannersData, "UPDATE: Banners", currentData.sha);
    res.json({ message: 'Banners salvos' });
  } catch (error) { res.status(500).json({ message: 'Erro salvar banners' }); }
});

// PEDIDOS (ADMIN)
app.get('/api/orders', authenticateToken, (req, res) => {
  res.json(cachedOrders.content);
});

app.post('/api/orders/update', authenticateToken, async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const index = cachedOrders.content.findIndex(o => o.id === orderId);
        if (index !== -1) {
            cachedOrders.content[index].status = status;
            const newSha = await saveFileContent(PATH_ORDERS, cachedOrders.content, `UPDATE ORDER: ${orderId}`, cachedOrders.sha);
            cachedOrders.sha = newSha;
            res.json({ success: true });
        } else { res.status(404).json({ message: 'Pedido não encontrado' }); }
    } catch (e) { res.status(500).json({ message: 'Erro ao atualizar pedido' }); }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { customer, items, total, status } = req.body;
        const newOrder = {
            id: Date.now().toString().slice(-6),
            customer: customer || "Cliente Manual",
            items: items || "Venda Balcão/Direct",
            total: total || "R$ 0,00",
            status: status || "approved",
            date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')
        };
        cachedOrders.content.unshift(newOrder);
        if (cachedOrders.content.length > 100) cachedOrders.content = cachedOrders.content.slice(0, 100);
        const newSha = await saveFileContent(PATH_ORDERS, cachedOrders.content, `ADMIN NEW ORDER: ${newOrder.id}`, cachedOrders.sha);
        cachedOrders.sha = newSha;
        res.json({ success: true, orderId: newOrder.id });
    } catch (e) { res.status(500).json({ message: 'Erro ao criar pedido' }); }
});

// PEDIDOS (PÚBLICO)
app.post('/api/public/order', async (req, res) => {
    try {
        console.log("📨 Recebendo novo pedido...");
        const { customer, items, total } = req.body;
        
        if (!customer || !total) {
            console.log("⚠️ Pedido rejeitado: Dados incompletos");
            return res.status(400).json({ message: 'Dados incompletos' });
        }

        const newOrder = {
            id: Date.now().toString().slice(-6),
            customer: customer,
            items: items || "Pedido via Site",
            total: total,
            status: "pending",
            date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')
        };

        // Salva na memória IMEDIATAMENTE
        cachedOrders.content.unshift(newOrder);
        if (cachedOrders.content.length > 100) cachedOrders.content = cachedOrders.content.slice(0, 100);

        console.log(`✅ Pedido #${newOrder.id} registrado na memória.`);

        // Retorna sucesso para o site (rápido)
        res.json({ success: true, orderId: newOrder.id });

        // Tenta persistir no GitHub (fundo)
        try {
            const newSha = await saveFileContent(PATH_ORDERS, cachedOrders.content, `NEW ORDER: ${newOrder.id}`, cachedOrders.sha);
            cachedOrders.sha = newSha;
            console.log("💾 Pedido persistido no GitHub.");
        } catch (err) {
            console.error("⚠️ Erro ao salvar no GitHub (mas está na RAM):", err.message);
        }

    } catch (e) {
        console.error("❌ Erro fatal ao processar pedido:", e);
        res.status(500).json({ message: 'Erro interno' });
    }
});

// ANALYTICS
app.get('/api/stats', authenticateToken, async (req, res) => res.json(cachedStats));

app.post('/api/public/track', async (req, res) => {
    cachedStats.total_visits = (cachedStats.total_visits || 0) + 1;
    cachedStats.today_visits = (cachedStats.today_visits || 0) + 1;
    isStatsDirty = true;
    res.json({ success: true });
});

// CONFIG
app.get('/api/config', authenticateToken, async (req, res) => {
    try { const data = await getFileContent(PATH_CONFIG); res.json(data.content || {}); } 
    catch (error) { res.status(500).json({ message: 'Erro config' }); }
});

app.post('/api/config', authenticateToken, async (req, res) => {
    try {
        const newConfig = req.body;
        const currentData = await getFileContent(PATH_CONFIG);
        await saveFileContent(PATH_CONFIG, newConfig, "UPDATE: Site Config", currentData.sha);
        res.json({ message: 'Configurações salvas' });
    } catch (error) { res.status(500).json({ message: 'Erro salvar config' }); }
});

// UPLOAD
app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    const { filename, content, folder } = req.body;
    let targetPath = folder === 'banners' ? `${PATH_IMG_BANNER}/${filename}` : `${PATH_IMG_SITE}/${filename}`;
    let sha = null;
    try { const { data } = await octokit.rest.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path: targetPath, ref: BRANCH }); sha = data.sha; } catch (e) {}
    await octokit.rest.repos.createOrUpdateFileContents({ owner: REPO_OWNER, repo: REPO_NAME, path: targetPath, message: `UPLOAD: ${filename}`, content: content, branch: BRANCH, sha: sha });
    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${encodeURI(targetPath)}`;
    res.json({ url: rawUrl });
  } catch (error) { res.status(500).json({ message: 'Erro upload' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`\n✅ Servidor Atomic rodando na porta ${PORT}`));
