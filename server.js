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
// VERIFIQUE SE OS NOMES ABAIXO ESTÃO IGUAIS AO SEU GITHUB
const REPO_OWNER = 'atomicgamesbrasil';
const REPO_NAME = 'siteoficial';
const BRANCH = 'main';

// ARQUIVOS (Devem existir na raiz do repo ou pasta especificada)
const PATH_PRODUCTS = 'produtos.json'; // Se no github for products.json, mude aqui.
const PATH_BANNERS = 'banners.json';
const PATH_ORDERS = 'orders.json';
const PATH_CONFIG = 'site-config.json';
const PATH_STATS = 'stats.json';
const PATH_IMG_SITE = 'img site';
const PATH_IMG_BANNER = 'BANNER SAZIONAL';

// Verifica Token na Inicialização
if (!process.env.GITHUB_TOKEN) {
    console.error("❌ [CRÍTICO] GITHUB_TOKEN não encontrado nas Variáveis de Ambiente do Render!");
    console.error("   O painel vai carregar, mas não mostrará nenhum dado.");
}

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
async function getFileContent(filePath) {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: REPO_OWNER, repo: REPO_NAME, path: filePath, ref: BRANCH,
        });
        
        // Verifica se é arquivo e tem conteúdo
        if (data.content) {
             return {
                content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')),
                sha: data.sha
            };
        }
        return { content: [], sha: data.sha }; // Arquivo existe mas vazio

    } catch (e) {
        // LOGS DE DIAGNÓSTICO PARA O RENDER
        console.error(`⚠️ [GITHUB ERROR] Falha ao ler arquivo: ${filePath}`);
        if (e.status === 404) {
            console.error(`   ↳ Motivo: Arquivo não encontrado (404). Verifique se '${filePath}' existe no repositório '${REPO_NAME}'.`);
        } else if (e.status === 401 || e.status === 403) {
            console.error(`   ↳ Motivo: Permissão negada (${e.status}). Verifique o GITHUB_TOKEN.`);
        } else {
            console.error(`   ↳ Motivo: ${e.message}`);
        }
        
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
    // Se content for null, retorna array vazio para não quebrar o front
    res.json(data.content || []);
  } catch (error) {
    console.error("Erro rota produtos:", error);
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

// PEDIDOS (ORDERS) - ADMIN
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const data = await getFileContent(PATH_ORDERS);
    const content = Array.isArray(data.content) ? data.content : [];
    res.json(content);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar pedidos' });
  }
});

// Atualiza Status
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

// Cria Pedido Manual (Admin)
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

        const currentData = await getFileContent(PATH_ORDERS);
        let orders = Array.isArray(currentData.content) ? currentData.content : [];
        
        // Adiciona no topo
        orders.unshift(newOrder);
        
        // Limite de segurança
        if (orders.length > 100) orders = orders.slice(0, 100);

        await saveFileContent(PATH_ORDERS, orders, `ADMIN NEW ORDER: ${newOrder.id}`, currentData.sha);
        
        res.json({ success: true, orderId: newOrder.id });
    } catch (e) {
        console.error("Erro ao criar pedido manual:", e);
        res.status(500).json({ message: 'Erro ao criar pedido' });
    }
});

// PEDIDOS (ORDERS) - PÚBLICO (SITE)
// Esta rota permite que o site crie um pedido SEM precisar estar logado no admin
app.post('/api/public/order', async (req, res) => {
    try {
        const { customer, items, total } = req.body;
        
        if (!customer || !total) {
            return res.status(400).json({ message: 'Dados incompletos' });
        }

        const newOrder = {
            id: Date.now().toString().slice(-6), // ID curto
            customer: customer,
            items: items || "Pedido via Site",
            total: total,
            status: "pending",
            date: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')
        };

        const currentData = await getFileContent(PATH_ORDERS);
        let orders = Array.isArray(currentData.content) ? currentData.content : [];
        
        // Adiciona no topo da lista
        orders.unshift(newOrder);
        
        // Mantém apenas os últimos 100 pedidos para o arquivo não ficar gigante
        if (orders.length > 100) orders = orders.slice(0, 100);

        await saveFileContent(PATH_ORDERS, orders, `NEW ORDER: ${newOrder.id}`, currentData.sha);
        
        res.json({ success: true, orderId: newOrder.id });
    } catch (e) {
        console.error("Erro ao criar pedido público:", e);
        res.status(500).json({ message: 'Erro ao processar pedido' });
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
    // [CRITICAL FIX] Desativada a escrita no GitHub a cada visita.
    // O painel apenas registra log, não faz commit para evitar queda do servidor.
    console.log('Analytics Track recebido (Modo Passivo)');
    res.json({ success: true, mode: 'passive' });
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
  console.log(`🔍 Monitorando repositório: ${REPO_OWNER}/${REPO_NAME}`);
});
