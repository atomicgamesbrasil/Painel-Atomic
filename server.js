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

// Configuração de Segurança
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));

// --- SERVIR ARQUIVOS DO FRONTEND ---
// Permite que o navegador baixe o HTML e o TSX
app.use(express.static(__dirname));

// --- CONFIGURAÇÃO DO REPOSITÓRIO ---
const REPO_OWNER = 'atomicgamesbrasil';
const REPO_NAME = 'siteoficial';
const BRANCH = 'main';
const PATH_PRODUCTS = 'produtos.json';
const PATH_BANNERS = 'banners.json';
const PATH_ORDERS = 'orders.json';
const PATH_CONFIG = 'site-config.json';
const PATH_STATS = 'stats.json'; // Novo arquivo de estatísticas
const PATH_IMG_SITE = 'img site';
const PATH_IMG_BANNER = 'BANNER SAZIONAL';

// Inicializa Octokit
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

// --- FUNÇÃO AUXILIAR GENÉRICA DE LEITURA/ESCRITA ---
async function getFileContent(path) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: REPO_OWNER, repo: REPO_NAME, path: path, ref: BRANCH,
        });
        return {
            content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')),
            sha: data.sha
        };
    } catch (e) {
        return { content: null, sha: null }; // Retorna null se não existir
    }
}

async function saveFileContent(path, content, message, sha = null) {
    const base64Content = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
    const params = {
        owner: REPO_OWNER, repo: REPO_NAME, path: path, 
        message: message, content: base64Content, branch: BRANCH
    };
    if (sha) params.sha = sha;
    await octokit.rest.repos.createOrUpdateFileContents(params);
}

// --- ROTAS DE API ---

// ROTA DE HEALTH CHECK
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// LOGIN
app.post('/api/auth/login', (req, res) => {
  try {
    const { password } = req.body || {};
    const envPassword = process.env.ADMIN_PASSWORD || process.env.SENHA_DE_ADMINISTRADOR;
    const serverPassword = envPassword || 'admin';

    if (!password) return res.status(400).json({ message: 'Senha não fornecida.' });

    if (password === serverPassword) {
      const user = { role: 'admin' };
      const secret = process.env.JWT_SECRET || 'dev_secret_key_change_me';
      const accessToken = jwt.sign(user, secret, { expiresIn: '8h' });
      return res.json({ token: accessToken });
    } else {
      return res.status(401).json({ message: 'Senha incorreta' });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Erro interno.' });
  }
});

// PRODUTOS
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const data = await getFileContent(PATH_PRODUCTS);
    res.json(data.content || []);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar produtos.' });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const product = req.body;
    const isEdit = !!product.isEdit;
    delete product.isEdit;

    const currentData = await getFileContent(PATH_PRODUCTS);
    let newProducts = Array.isArray(currentData.content) ? [...currentData.content] : [];
    
    const index = newProducts.findIndex(p => p.id === product.id);
    let msg = "";

    if (index !== -1) {
      newProducts[index] = product;
      msg = `EDIT: ${product.name}`;
    } else {
      newProducts.unshift(product);
      msg = `ADD: ${product.name}`;
    }

    await saveFileContent(PATH_PRODUCTS, newProducts, msg, currentData.sha);
    res.json({ message: 'Salvo com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao salvar: ' + error.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const currentData = await getFileContent(PATH_PRODUCTS);
    const newProducts = (currentData.content || []).filter(p => p.id !== id);
    
    await saveFileContent(PATH_PRODUCTS, newProducts, `DEL: ${id}`, currentData.sha);
    res.json({ message: 'Removido' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar' });
  }
});

// BANNERS
app.get('/api/banners', authenticateToken, async (req, res) => {
  try {
    const data = await getFileContent(PATH_BANNERS);
    res.json(data.content || []);
  } catch (error) {
    res.status(500).json({ message: 'Erro banners' });
  }
});

app.post('/api/banners', authenticateToken, async (req, res) => {
  try {
    const bannersData = req.body;
    const currentData = await getFileContent(PATH_BANNERS);
    await saveFileContent(PATH_BANNERS, bannersData, "UPDATE: Banners", currentData.sha);
    res.json({ message: 'Banners salvos' });
  } catch (error) {
    res.status(500).json({ message: 'Erro salvar banners' });
  }
});

// PEDIDOS (ORDERS)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const data = await getFileContent(PATH_ORDERS);
    const content = Array.isArray(data.content) ? data.content : [];
    res.json(content);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar pedidos' });
  }
});

app.post('/api/orders/update', authenticateToken, async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const currentData = await getFileContent(PATH_ORDERS);
        let orders = Array.isArray(currentData.content) ? currentData.content : [];
        
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            orders[index].status = status;
            await saveFileContent(PATH_ORDERS, orders, `UPDATE ORDER: ${orderId}`, currentData.sha);
            res.json({ success: true });
        } else {
            res.status(404).json({ message: 'Pedido não encontrado' });
        }
    } catch (e) {
        res.status(500).json({ message: 'Erro ao atualizar pedido' });
    }
});

// ANALYTICS / STATS
// Rota Privada para ler os dados no Dashboard
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const data = await getFileContent(PATH_STATS);
        const stats = data.content || { total_visits: 0, today_visits: 0, last_updated: new Date().toISOString() };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: 'Erro stats' });
    }
});

// Rota Pública para incrementar contador (usada pelo script do site)
app.post('/api/public/track', async (req, res) => {
    try {
        // Atenção: Github API tem rate limit e não é instantâneo, mas serve para volumes baixos.
        const currentData = await getFileContent(PATH_STATS);
        let stats = currentData.content || { total_visits: 0, today_visits: 0, last_updated: new Date().toISOString() };
        
        // Simples lógica de data
        const today = new Date().toDateString();
        const lastDate = new Date(stats.last_updated).toDateString();
        
        if (today !== lastDate) {
            stats.today_visits = 1;
        } else {
            stats.today_visits = (stats.today_visits || 0) + 1;
        }
        stats.total_visits = (stats.total_visits || 0) + 1;
        stats.last_updated = new Date().toISOString();

        // Salvar background (não esperar a resposta para ser rápido no front)
        saveFileContent(PATH_STATS, stats, "TRACK: New Visit", currentData.sha).catch(console.error);
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(200).json({ ignored: true }); // Falha silenciosa para não quebrar o site
    }
});


// CONFIGURAÇÕES GERAIS (SITE CONFIG)
app.get('/api/config', authenticateToken, async (req, res) => {
    try {
        const data = await getFileContent(PATH_CONFIG);
        // Default config se não existir
        const config = data.content && data.content.whatsapp ? data.content : {
            whatsapp: "5511999999999",
            instagram: "https://instagram.com/atomicgames",
            maintenance: false,
            announcement: "Bem vindo à Atomic Games!",
            ga_id: "" 
        };
        res.json(config);
    } catch (error) {
        res.status(500).json({ message: 'Erro config' });
    }
});

app.post('/api/config', authenticateToken, async (req, res) => {
    try {
        const newConfig = req.body;
        const currentData = await getFileContent(PATH_CONFIG);
        await saveFileContent(PATH_CONFIG, newConfig, "UPDATE: Site Config", currentData.sha);
        res.json({ message: 'Configurações salvas' });
    } catch (error) {
        res.status(500).json({ message: 'Erro salvar config' });
    }
});

// UPLOAD DE IMAGEM
app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    const { filename, content, folder } = req.body;
    let targetPath = folder === 'banners' ? `${PATH_IMG_BANNER}/${filename}` : `${PATH_IMG_SITE}/${filename}`;

    let sha = null;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER, repo: REPO_NAME, path: targetPath, ref: BRANCH,
      });
      sha = data.sha;
    } catch (e) {}

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: REPO_OWNER, repo: REPO_NAME, path: targetPath,
      message: `UPLOAD: ${filename}`, content: content, branch: BRANCH, sha: sha
    });

    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${encodeURI(targetPath)}`;
    res.json({ url: rawUrl });
  } catch (error) {
    res.status(500).json({ message: 'Erro upload' });
  }
});

// ROTA FINAL SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor Atomic rodando na porta ${PORT}`);
});
