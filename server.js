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

// --- ROTAS DE API ---

// ROTA DE HEALTH CHECK (Importante para o Render)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// LOGIN COM TRATAMENTO DE ERRO ROBUSTO
app.post('/api/auth/login', (req, res) => {
  try {
    const { password } = req.body || {};
    
    // Configuração de senha com Fallback explícito
    const envPassword = process.env.ADMIN_PASSWORD || process.env.SENHA_DE_ADMINISTRADOR;
    const serverPassword = envPassword || 'admin';

    if (!password) {
      return res.status(400).json({ message: 'Senha não fornecida.' });
    }

    if (password === serverPassword) {
      const user = { role: 'admin' };
      const secret = process.env.JWT_SECRET || 'dev_secret_key_change_me';
      const accessToken = jwt.sign(user, secret, { expiresIn: '8h' });
      return res.json({ token: accessToken });
    } else {
      return res.status(401).json({ message: 'Senha incorreta' });
    }
  } catch (error) {
    console.error("CRITICAL: Erro na rota de login:", error);
    return res.status(500).json({ message: 'Erro interno de configuração no servidor.' });
  }
});

// API Github - Produtos
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: REPO_OWNER, repo: REPO_NAME, path: PATH_PRODUCTS, ref: BRANCH,
    });
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    console.error("Erro Github:", error.message);
    res.status(500).json({ message: 'Erro ao buscar produtos. Verifique o GITHUB_TOKEN.' });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const product = req.body;
    // Lógica simples de edição/criação em JS puro
    const isEdit = !!product.isEdit;
    delete product.isEdit;

    // Buscar arquivo atual
    let currentData = { content: [], sha: null };
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: REPO_OWNER, repo: REPO_NAME, path: PATH_PRODUCTS, ref: BRANCH,
        });
        currentData.content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
        currentData.sha = data.sha;
    } catch(e) {} // Se não existir, cria novo

    let newProducts = [...currentData.content];
    const index = newProducts.findIndex(p => p.id === product.id);
    let msg = "";

    if (index !== -1) {
      newProducts[index] = product;
      msg = `EDIT: ${product.name}`;
    } else {
      newProducts.unshift(product);
      msg = `ADD: ${product.name}`;
    }

    // Salvar
    const base64Content = Buffer.from(JSON.stringify(newProducts, null, 2)).toString('base64');
    const params = {
      owner: REPO_OWNER, repo: REPO_NAME, path: PATH_PRODUCTS, message: msg, content: base64Content, branch: BRANCH
    };
    if (currentData.sha) params.sha = currentData.sha;

    await octokit.rest.repos.createOrUpdateFileContents(params);
    res.json({ message: 'Salvo com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao salvar: ' + error.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER, repo: REPO_NAME, path: PATH_PRODUCTS, ref: BRANCH,
    });
    const products = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    const newProducts = products.filter(p => p.id !== id);
    
    const base64Content = Buffer.from(JSON.stringify(newProducts, null, 2)).toString('base64');
    
    await octokit.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER, repo: REPO_NAME, path: PATH_PRODUCTS, 
        message: `DEL: ${id}`, content: base64Content, branch: BRANCH, sha: data.sha
    });
    res.json({ message: 'Removido' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar' });
  }
});

// API Github - Banners
app.get('/api/banners', authenticateToken, async (req, res) => {
  try {
    const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER, repo: REPO_NAME, path: PATH_BANNERS, ref: BRANCH,
    });
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    res.status(500).json({ message: 'Erro banners' });
  }
});

app.post('/api/banners', authenticateToken, async (req, res) => {
  try {
    const bannersData = req.body;
    const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER, repo: REPO_NAME, path: PATH_BANNERS, ref: BRANCH,
    });
    const base64Content = Buffer.from(JSON.stringify(bannersData, null, 2)).toString('base64');
    
    await octokit.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER, repo: REPO_NAME, path: PATH_BANNERS, 
        message: "UPDATE: Banners", content: base64Content, branch: BRANCH, sha: data.sha
    });
    res.json({ message: 'Banners salvos' });
  } catch (error) {
    res.status(500).json({ message: 'Erro salvar banners' });
  }
});

// API Upload
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

// ROTA FINAL: Serve o index.html para qualquer outra rota (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
  
  if (process.env.ADMIN_PASSWORD) {
    console.log("🔒 Autenticação: Variável ADMIN_PASSWORD detectada.");
  } else if (process.env.SENHA_DE_ADMINISTRADOR) {
    console.log("🔒 Autenticação: Variável SENHA_DE_ADMINISTRADOR detectada.");
  } else {
    console.warn("⚠️ AVISO: Nenhuma variável de senha configurada. Usando senha padrão: 'admin'");
  }
});
