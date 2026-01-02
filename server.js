// === GLOBAL PWA VARIABLES ===
let deferredPrompt;

// 1. Capture standard event immediately (Prevents race conditions)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("PWA install prompt captured");
});

const CONFIG = {
    GITHUB_USER: "atomicgamesbrasil",
    GITHUB_REPO: "siteoficial",
    GITHUB_BRANCH: "main",
    // CRITICAL: Point this to your LIVE Render Backend URL
    SERVER_URL: 'https://atomic-thiago-backend.onrender.com'
};
const BASE_IMG_URL = `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/`;

// Initial Data
const initialProducts = [
    { id: "1", name: "PlayStation 5 Slim", category: "console", price: "R$ 3.799,00", image: BASE_IMG_URL + "img%20site/console-ps5.webp", desc: "Digital Edition, 1TB SSD. O console mais rápido da Sony." },
    { id: "2", name: "Xbox Series S", category: "console", price: "R$ 2.699,00", image: BASE_IMG_URL + "img%20site/console-xbox-s.webp", desc: "512GB SSD, Compacto e 100% digital." },
    { id: "6", name: "God of War Ragnarok", category: "games", price: "R$ 299,00", image: BASE_IMG_URL + "img%20site/game-gow.webp", desc: "PS5 Mídia Física. Aventura épica." },
    { id: "12", name: "Controle DualSense", category: "acessorios", price: "R$ 449,00", image: BASE_IMG_URL + "img%20site/acessorio-dualsense.webp", desc: "Original Sony. Controle sem fio." },
    { id: "13", name: "Mouse Gamer Red Dragon", category: "acessorios", price: "R$ 149,90", image: "https://placehold.co/400x400/292524/FFD700?text=MOUSE", desc: "Mouse Redragon de alta precisão." }
];

// Dados Iniciais de Banners
let promoBanners = [];

const faqs = [
    { q: "Vocês aceitam consoles usados na troca?", a: "Sim! Avaliamos seu console usado (PS4, Xbox One, Switch) como parte do pagamento." },
    { q: "Qual o prazo de garantia dos serviços?", a: "Todos os nossos serviços de manutenção possuem 90 dias (3 meses) de garantia legal." },
    { q: "Vocês montam PC Gamer?", a: "Com certeza! Temos consultoria especializada para montar o PC ideal para seu orçamento." },
    { q: "Entregam em todo o Rio de Janeiro?", a: "Sim, trabalhamos com entregas expressas. Consulte taxa no WhatsApp." }
];

// State & DOM Elements Cache
let allProducts = [...initialProducts];
let cart = [];
let currentFilter = 'all';
let debounceTimer;
let els = {}; // Cached DOM elements

// Utils
const formatPrice = p => typeof p === 'number' ? p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : (String(p).includes('R$') ? p : parseFloat(String(p).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const showToast = (msg, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = document.createElement('i');
    icon.className = `ph-bold ${type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'} text-xl`;
    const text = document.createElement('span');
    text.textContent = msg;
    toast.appendChild(icon);
    toast.appendChild(text);
    els.toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(20px) scale(0.8)'; setTimeout(() => toast.remove(), 300); }, 3000);
};

const getCategoryClass = cat => ({ console: 'category-console', games: 'category-games', acessorios: 'category-acessorios', hardware: 'category-hardware' }[cat] || 'category-games');

// --- PWA LOGIC (VISIBLE BY DEFAULT STRATEGY) ---
function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/mac os/.test(ua)) return 'mac';
    if (/windows/.test(ua)) return 'windows';
    return 'generic';
}

function updateInstallButtons() {
    // Robust Check for Standalone Mode (Installed)
    const isInStandaloneMode = (window.matchMedia('(display-mode: standalone)').matches) ||
                               (window.navigator.standalone === true) || 
                               (document.referrer.includes('android-app://'));
    
    const installBtnDesktop = document.getElementById('installAppBtnDesktop');
    const installBtnMobile = document.getElementById('installAppBtnMobile');
    const installBtnMobileHeader = document.getElementById('installAppBtnMobileHeader');

    if (isInStandaloneMode) {
        // App IS Installed: FORCE HIDE buttons
        if (installBtnDesktop) installBtnDesktop.style.display = 'none';
        if (installBtnMobile) installBtnMobile.style.display = 'none';
        if (installBtnMobileHeader) installBtnMobileHeader.style.display = 'none';
    } else {
        // App NOT Installed: Force specific display types (prevents weird CSS overrides on Xiaomi)
        
        // Desktop Button: Hidden on mobile (via CSS), Flex on Desktop
        if (installBtnDesktop) installBtnDesktop.style.display = ''; // Let Tailwind handle md:flex hidden
        
        // Mobile Menu Button: Always Flex (Block) inside the menu
        if (installBtnMobile) installBtnMobile.style.display = 'flex';
        
        // Mobile Header Button: Visible only on mobile screens
        // Note: Tailwind handles md:hidden, but we ensure it's not 'none' style here
        if (installBtnMobileHeader) installBtnMobileHeader.style.display = ''; 
    }
}

function handleInstallClick() {
    if (deferredPrompt) {
        // 1. Standard Chrome/Edge/Samsung Method
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted install');
            }
            deferredPrompt = null;
        });
    } else {
        // 2. Fallback: Show Manual Instructions (Xiaomi/iOS/Desktop Safari)
        showManualGuide();
    }
}

function showManualGuide() {
    const guideModal = document.getElementById('installGuideModal');
    const title = document.getElementById('guideTitle');
    const text = document.getElementById('guideText');
    const steps = document.getElementById('guideSteps');
    const icon = document.getElementById('guideMainIcon');
    const platform = detectPlatform();

    if(!guideModal || !title) return;

    if (platform === 'ios') {
        // iOS
        title.textContent = "Instalar no iPhone";
        text.innerHTML = "Toque em <strong class='text-blue-500'>Compartilhar</strong> e depois em <strong class='text-base'>Adicionar à Tela de Início</strong>.";
        icon.className = "ph-bold ph-share-network text-3xl text-blue-500";
        steps.innerHTML = `
            <div class="flex flex-col items-center gap-2">
                <span class="text-xs font-bold text-muted">1. Toque aqui</span>
                <i class="ph-bold ph-export text-2xl animate-bounce"></i>
            </div>
            <div class="w-px h-10 bg-base mx-2"></div>
            <div class="flex flex-col items-center gap-2">
                <span class="text-xs font-bold text-muted">2. Selecione</span>
                <div class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs font-bold"><i class="ph-bold ph-plus-square"></i> Tela de Início</div>
            </div>`;
    } else if (platform === 'android') {
        // Android (Xiaomi/Manual)
        title.textContent = "Instalar App";
        text.innerHTML = "Toque no menu do navegador e selecione <strong class='text-base'>Instalar aplicativo</strong> ou <strong class='text-base'>Adicionar à tela inicial</strong>.";
        icon.className = "ph-bold ph-download-simple text-3xl text-yellow-500";
        steps.innerHTML = `
            <div class="flex flex-col items-center gap-2">
                <span class="text-xs font-bold text-muted">1. Menu</span>
                <i class="ph-bold ph-dots-three-vertical text-2xl animate-bounce"></i>
            </div>
            <div class="w-px h-10 bg-base mx-2"></div>
            <div class="flex flex-col items-center gap-2">
                <span class="text-xs font-bold text-muted">2. Opção</span>
                <div class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs font-bold"><i class="ph-bold ph-download-simple"></i> Instalar</div>
            </div>`;
    } else {
        // Desktop (Windows/Mac)
        title.textContent = "Instalar no Computador";
        text.innerHTML = "Procure pelo ícone de instalação <i class='ph-bold ph-download-simple'></i> na barra de endereço ou no menu do navegador.";
        icon.className = "ph-bold ph-desktop text-3xl text-purple-500";
        steps.innerHTML = `
            <div class="flex flex-col items-center gap-2">
                <span class="text-xs font-bold text-muted">Chrome / Edge</span>
                <div class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs font-bold">Barra de Endereço</div>
            </div>`;
    }
    
    guideModal.classList.add('open');
}
// --- END PWA LOGIC ---

// Core Functions
function renderSkeletons() {
    els.productGrid.innerHTML = '';
    els.loadMore.classList.add('hidden');
    els.noResults.classList.add('hidden');
    
    const count = window.innerWidth < 768 ? 4 : 8;
    const frag = document.createDocumentFragment();

    for(let i=0; i<count; i++) {
        const article = document.createElement('article');
        article.className = 'product-card bg-card border border-base flex flex-col h-full opacity-80';
        article.innerHTML = `
            <div class="product-img-box skeleton h-48 w-full opacity-50"></div>
            <div class="p-4 flex-grow flex flex-col gap-3">
                <div class="skeleton h-4 w-3/4"></div>
                <div class="skeleton h-3 w-full"></div>
                <div class="mt-auto flex justify-between items-end">
                    <div class="skeleton h-6 w-24"></div>
                    <div class="skeleton h-10 w-10 rounded-xl"></div>
                </div>
            </div>
        `;
        frag.appendChild(article);
    }
    els.productGrid.appendChild(frag);
}

async function loadGamesFromGitHub() {
    renderSkeletons(); 
    try {
        const res = await fetch(`${BASE_IMG_URL}produtos.json?t=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            if (data.length) allProducts = data.map(p => ({
                id: (p.id || Date.now() + Math.random()).toString(),
                name: p.name || "Produto",
                category: p.category ? (p.category.toLowerCase().includes('console') ? 'console' : p.category.toLowerCase().includes('acess') ? 'acessorios' : p.category.toLowerCase().match(/pc|hardware/) ? 'hardware' : 'games') : 'games',
                price: formatPrice(p.price),
                image: (p.image || "").replace('/img/', '/img%20site/') || "https://placehold.co/400x400/e2e8f0/1e293b?text=ATOMIC",
                desc: p.desc || "Sem descrição."
            }));
        }
    } catch (e) { console.warn("Using fallback catalog"); }
    renderProducts(currentFilter, els.searchInput.value);
}

async function loadBannersFromGitHub() {
    try {
        const res = await fetch(`${BASE_IMG_URL}banners.json?t=${Date.now()}`);
        if (res.ok) {
            promoBanners = await res.json();
        } else {
            console.warn("Banners JSON not found");
            promoBanners = [];
        }
    } catch (e) {
        console.warn("Error loading banners:", e);
        promoBanners = [];
    }
    renderPromos();
}

function renderPromos() {
    const container = document.getElementById('promoBannersContainer');
    if(!container) return;

    const validBanners = promoBanners.filter(b => b.image && b.image.trim() !== '');

    if(!validBanners.length) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = '';
    container.style.display = '';

    const sortedBanners = [
        validBanners.find(b => b.id === 'banner_1'),
        validBanners.find(b => b.id === 'banner_2')
    ].filter(b => b);

    if (sortedBanners.length === 0) return;

    const frag = document.createDocumentFragment();
    
    sortedBanners.forEach(banner => {
        const link = document.createElement('a');
        link.className = 'promo-banner-link group';
        link.href = banner.link || '#';
        
        if(banner.link && banner.link.startsWith('http')) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
        
        const imgUrl = `${BASE_IMG_URL}BANNER%20SAZIONAL/${encodeURIComponent(banner.image)}`;
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = banner.id;
        img.className = 'promo-banner-img'; 
        img.loading = 'lazy';
        
        const shine = document.createElement('div');
        shine.className = 'absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none';
        
        link.appendChild(img);
        link.appendChild(shine);
        frag.appendChild(link);
    });
    
    container.appendChild(frag);
}

function renderProducts(filter, term = "", forceAll = false) {
    const lowerTerm = term.toLowerCase();
    const filtered = allProducts.filter(p => 
        (filter === 'all' || (p.category || 'games').toLowerCase().includes(filter)) &&
        (!term || p.name.toLowerCase().includes(lowerTerm) || (p.desc && p.desc.toLowerCase().includes(lowerTerm)))
    );

    const limit = (window.innerWidth < 768) ? 6 : 10;
    const toShow = forceAll || term ? filtered : filtered.slice(0, limit);
    
    els.loadMore.classList.toggle('hidden', forceAll || term || filtered.length <= limit);
    els.noResults.classList.toggle('hidden', filtered.length > 0);
    
    els.productGrid.innerHTML = '';
    
    if (!filtered.length) return;

    const frag = document.createDocumentFragment();
    
    toShow.forEach((p, i) => {
        const card = document.createElement('article');
        card.className = 'product-card bg-card border border-base flex flex-col h-full group';
        card.style.animationDelay = `${i * 50}ms`;
        
        const imgBox = document.createElement('div');
        imgBox.className = 'product-img-box';
        imgBox.role = 'button';
        imgBox.tabIndex = 0;
        imgBox.addEventListener('click', () => showProductDetail(p.id));
        imgBox.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && showProductDetail(p.id));

        const img = document.createElement('img');
        img.src = p.image;
        img.alt = p.name;
        img.loading = 'lazy';
        img.width = 400; 
        img.height = 400;
        img.onerror = function() { this.src='https://placehold.co/400x400/e2e8f0/1e293b?text=ATOMIC' };

        const tag = document.createElement('span');
        tag.className = `category-tag ${getCategoryClass(p.category)} absolute top-3 left-3`;
        tag.textContent = p.category;

        imgBox.appendChild(img);
        imgBox.appendChild(tag);

        const contentBox = document.createElement('div');
        contentBox.className = 'p-4 md:p-5 flex-grow flex flex-col';
        
        const title = document.createElement('h3');
        title.className = 'font-bold text-sm md:text-base mb-1 leading-tight group-hover:text-yellow-500 transition line-clamp-2';
        title.textContent = p.name;

        const desc = document.createElement('p');
        desc.className = 'text-xs text-muted mb-4 flex-grow line-clamp-2';
        desc.textContent = p.desc;

        const footer = document.createElement('div');
        footer.className = 'mt-auto flex items-center justify-between gap-2';
        
        const price = document.createElement('span');
        price.className = 'font-black text-base md:text-lg text-gradient';
        price.textContent = p.price;

        const addBtn = document.createElement('button');
        addBtn.className = 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-black w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all shadow-lg hover:scale-105';
        addBtn.ariaLabel = `Adicionar ${p.name} ao carrinho`;
        
        const icon = document.createElement('i');
        icon.className = 'ph-bold ph-plus text-lg';
        addBtn.appendChild(icon);
        
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(p.id);
        });

        footer.appendChild(price);
        footer.appendChild(addBtn);

        contentBox.appendChild(title);
        contentBox.appendChild(desc);
        contentBox.appendChild(footer);

        card.appendChild(imgBox);
        card.appendChild(contentBox);
        frag.appendChild(card);
    });
    
    els.productGrid.appendChild(frag);
}

function updateCartUI() {
    els.cartCount.textContent = cart.length;
    els.cartCount.classList.toggle('hidden', !cart.length);
    els.checkoutBtn.disabled = !cart.length;
    
    els.cartItems.innerHTML = '';
    
    if (!cart.length) {
        const empty = document.createElement('div');
        empty.className = 'text-center py-12';
        empty.innerHTML = '<div class="w-20 h-20 mx-auto mb-4 rounded-full bg-base flex items-center justify-center"><i class="ph-duotone ph-shopping-cart-simple text-4xl text-muted"></i></div><p class="text-muted font-medium">Seu carrinho está vazio</p>';
        els.cartItems.appendChild(empty);
        els.cartTotal.textContent = 'R$ 0,00';
        return;
    }

    let total = 0;
    const frag = document.createDocumentFragment();
    cart.forEach((item, idx) => {
        total += parseFloat(item.price.replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;
        
        const div = document.createElement('div');
        div.className = 'flex gap-4 bg-base p-4 rounded-2xl border border-base';
        
        const img = document.createElement('img');
        img.src = item.image;
        img.className = 'w-16 h-16 object-contain bg-white dark:bg-slate-800 rounded-xl shadow';
        img.onerror = function() { this.src='https://placehold.co/100?text=ATOMIC' };

        const info = document.createElement('div');
        info.className = 'flex-grow min-w-0';
        
        const pName = document.createElement('p'); pName.className = 'font-bold text-sm line-clamp-1'; pName.textContent = item.name;
        const pDesc = document.createElement('p'); pDesc.className = 'text-xs text-muted line-clamp-1'; pDesc.textContent = item.desc;
        const pPrice = document.createElement('p'); pPrice.className = 'text-sm font-bold text-gradient mt-1'; pPrice.textContent = item.price;
        
        info.appendChild(pName);
        info.appendChild(pDesc);
        info.appendChild(pPrice);

        const delBtn = document.createElement('button');
        delBtn.className = 'self-center p-2 text-red-500 hover:bg-red-100 rounded-xl transition';
        const icon = document.createElement('i'); icon.className = 'ph-bold ph-trash text-lg';
        delBtn.appendChild(icon);
        delBtn.ariaLabel = "Remover item";
        delBtn.addEventListener('click', () => removeFromCart(idx));

        div.appendChild(img);
        div.appendChild(info);
        div.appendChild(delBtn);
        frag.appendChild(div);
    });
    
    els.cartItems.appendChild(frag);
    els.cartTotal.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Logic Helpers & Persistence
function saveCart() {
    localStorage.setItem('atomic_cart', JSON.stringify(cart));
}

function addToCart(id) { 
    const p = allProducts.find(x => x.id == id); 
    if(p){ 
        cart.push(p); 
        saveCart(); 
        updateCartUI(); 
        showToast(`${p.name} adicionado!`); 
    } 
}

function removeFromCart(idx) { 
    cart.splice(idx, 1); 
    saveCart(); 
    updateCartUI(); 
    showToast('Produto removido', 'error'); 
}

function toggleCart() { 
    const open = els.cartModal.classList.toggle('open'); 
    els.cartOverlay.classList.toggle('open'); 
    document.body.style.overflow = open ? 'hidden' : ''; 
}

function toggleMobileMenu() { 
    const open = els.mobileMenu.classList.toggle('open'); 
    els.mobileOverlay.classList.toggle('open'); 
    document.body.style.overflow = open ? 'hidden' : ''; 
}

// --- INTEGRAÇÃO GARÇOM COM RETRY AUTOMÁTICO (CORREÇÃO DE SLEEP) ---
async function sendOrderWithRetry(data, retries = 2) {
    const url = `${CONFIG.SERVER_URL}/api/public/order`;
    for (let i = 0; i <= retries; i++) {
        try {
            console.log(`Tentativa ${i+1} de envio...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                console.log("✅ Pedido enviado com sucesso!");
                return true;
            }
        } catch (e) {
            console.warn(`Erro na tentativa ${i+1}:`, e);
            if (i < retries) {
                // Se falhar (servidor dormindo), espera 2 segundos e tenta de novo
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    return false;
}

async function checkoutWhatsApp() {
    if (!cart.length) return showToast('Carrinho vazio!', 'error');

    const btn = els.checkoutBtn;
    const originalText = btn.innerHTML;
    if(btn.disabled) return;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin text-xl"></i> Enviando...';
    btn.style.opacity = '0.8';

    const itemsSummary = cart.map(i => i.name).join(', ');
    const total = els.cartTotal.textContent;

    // Tenta enviar com Retry (Sistema Anti-Sono)
    await sendOrderWithRetry({
        customer: "Cliente do Site", 
        items: itemsSummary,
        total: total
    });

    // Redireciona SEMPRE (Mesmo se o servidor falhar, o cliente não perde a venda)
    const msg = "Olá Atomic! Gostaria de fechar o pedido:\n\n" + cart.map(i => `• ${i.name} - ${i.price}`).join('\n') + `\n\n*Total: ${total}*`;
    const link = `https://wa.me/5521995969378?text=${encodeURIComponent(msg)}`;
    
    window.location.href = link;

    setTimeout(() => {
        if(btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }, 3000);
}

// EXPOSTA GLOBALMENTE para o Chatbot
window.showProductDetail = function(id) {
    const p = allProducts.find(x => x.id == id);
    if (!p) return;
    document.getElementById('modalProductImage').src = p.image;
    document.getElementById('modalProductName').textContent = p.name;
    document.getElementById('modalProductDescription').textContent = p.desc;
    document.getElementById('modalProductPrice').textContent = p.price;
    document.getElementById('modalProductCategory').className = `category-tag absolute top-4 left-4 ${getCategoryClass(p.category)}`;
    document.getElementById('modalProductCategory').textContent = p.category;
    
    const oldBtn = document.getElementById('modalAddToCartBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    
    newBtn.onclick = () => { addToCart(id); closeProductDetail(); };
    
    document.getElementById('modalWhatsappBtn').href = `https://wa.me/5521995969378?text=${encodeURIComponent(`Interesse em: ${p.name}`)}`;
    els.detailModal.classList.add('open'); 
    els.detailOverlay.classList.add('open'); 
    document.body.style.overflow = 'hidden';
}

function closeProductDetail() { 
    els.detailModal.classList.remove('open'); 
    els.detailOverlay.classList.remove('open'); 
    document.body.style.overflow = ''; 
}

function loadVideo() { 
    const f = document.getElementById('videoFacade'); 
    const container = document.getElementById('videoContainer');
    const iframe = document.createElement('iframe');
    iframe.className = "w-full h-full";
    iframe.src = `https://www.youtube.com/embed/${f.dataset.videoId}?autoplay=1&rel=0`;
    iframe.frameBorder = "0";
    iframe.allow = "autoplay; encrypted-media";
    iframe.allowFullscreen = true;
    
    container.innerHTML = '';
    container.appendChild(iframe);
    
    f.style.display = 'none'; 
    container.classList.remove('hidden');
}

// Charts
function initCharts(theme) {
    const dark = theme === 'dark';
    const color = dark ? '#f1f5f9' : '#0f172a';
    const gridColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    
    if (window.repChart) window.repChart.destroy();
    if (window.servChart) window.servChart.destroy();
    
    const c1 = document.getElementById('reputationChart');
    if (c1) window.repChart = new Chart(c1.getContext('2d'), {
        type: 'radar',
        data: { 
            labels: ['Atendimento', 'Preço', 'Rapidez', 'Variedade', 'Confiança'], 
            datasets: [{ 
                label: 'Nota', 
                data: [4.8, 4.2, 4.6, 4.4, 4.9], 
                backgroundColor: 'rgba(255, 215, 0, 0.25)', 
                borderColor: '#FFD700', 
                borderWidth: 3,
                pointBackgroundColor: '#FFD700',
                pointBorderColor: dark ? '#1e293b' : '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#FFD700',
                pointRadius: 4
            }] 
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                r: { 
                    min: 0, 
                    max: 5, 
                    beginAtZero: true,
                    grid: { color: gridColor, circular: true }, 
                    angleLines: { color: gridColor },
                    pointLabels: { color: color, font: { size: 12, weight: '600', family: 'Inter' } },
                    ticks: { display: false, backdropColor: 'transparent' } 
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });

    const c2 = document.getElementById('servicesChart');
    if (c2) window.servChart = new Chart(c2.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Manutenção', 'Jogos', 'Consoles', 'Peças'], datasets: [{ data: [40, 20, 25, 15], backgroundColor: ['#FFD700', '#10B981', '#3B82F6', '#8B5CF6'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { color, usePointStyle: true, padding: 15, font: { family: 'Inter', size: 12 } } } } }
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // REGISTER SERVICE WORKER FOR PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('SW registered: ', registration.scope))
                .catch(err => console.log('SW registration failed: ', err));
        });
    }

    // --- WAKE UP SERVER (CRUCIAL) ---
    fetch(`${CONFIG.SERVER_URL}/api/public/wake`, { method: 'GET' }).catch(() => {});

    // --- TRACK VISIT ---
    fetch(`${CONFIG.SERVER_URL}/api/public/track`, { method: 'POST' })
        .catch(e => console.log('Analytics silent fail:', e));

    // --- PWA INIT & EVENT LISTENERS ---
    updateInstallButtons();
    window.addEventListener('resize', updateInstallButtons);

    const installBtnDesktop = document.getElementById('installAppBtnDesktop');
    const installBtnMobile = document.getElementById('installAppBtnMobile');
    const installBtnMobileHeader = document.getElementById('installAppBtnMobileHeader');
    const guideModal = document.getElementById('installGuideModal');

    if(installBtnDesktop) installBtnDesktop.addEventListener('click', handleInstallClick);
    if(installBtnMobile) installBtnMobile.addEventListener('click', handleInstallClick);
    if(installBtnMobileHeader) installBtnMobileHeader.addEventListener('click', handleInstallClick);

    // Close Guide Modal logic
    document.getElementById('closeGuideModal')?.addEventListener('click', () => {
        guideModal.classList.remove('open');
    });
    guideModal?.addEventListener('click', (e) => {
        if(e.target === guideModal) guideModal.classList.remove('open');
    });

    // Handle App Installed Event
    window.addEventListener('appinstalled', () => {
        updateInstallButtons(); // Logic inside will hide buttons
        deferredPrompt = null;
        console.log('PWA was installed');
    });
    // --- END PWA INIT ---

    els = {
        toastContainer: document.getElementById('toastContainer'),
        cartCount: document.getElementById('cartCount'),
        cartItems: document.getElementById('cartItemsContainer'),
        cartTotal: document.getElementById('cartTotal'),
        checkoutBtn: document.getElementById('checkoutBtn'),
        cartModal: document.getElementById('cartModal'),
        cartOverlay: document.getElementById('cartOverlay'),
        mobileMenu: document.getElementById('mobileMenu'),
        mobileOverlay: document.getElementById('mobileMenuOverlay'),
        productGrid: document.getElementById('productGrid'),
        noResults: document.getElementById('noResults'),
        loadMore: document.getElementById('loadMoreContainer'),
        searchInput: document.getElementById('searchInput'),
        detailModal: document.getElementById('productDetailModal'),
        detailOverlay: document.getElementById('productDetailOverlay')
    };

    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.className = theme;

    // LOAD CART FROM LOCAL STORAGE
    const savedCart = localStorage.getItem('atomic_cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            updateCartUI();
        } catch(e) { console.error("Error loading cart", e); }
    }
    
    const faqContainer = document.getElementById('faqContainer');
    if(faqContainer) {
        faqContainer.innerHTML = '';
        faqs.forEach((f, i) => {
            const details = document.createElement('details');
            details.className = 'group bento-card overflow-hidden';
            if(i === 0) details.open = true;
            
            const summary = document.createElement('summary');
            summary.className = 'flex justify-between items-center font-medium cursor-pointer list-none p-5 md:p-6 bg-card transition-colors';
            
            const qSpan = document.createElement('span');
            qSpan.className = 'text-base font-bold pr-4';
            qSpan.textContent = f.q;
            
            const iconDiv = document.createElement('div');
            iconDiv.className = 'w-10 h-10 rounded-xl bg-base flex items-center justify-center transition-all flex-shrink-0';
            const icon = document.createElement('i');
            icon.className = 'ph-bold ph-caret-down text-lg transition-transform group-open:rotate-180';
            iconDiv.appendChild(icon);
            
            summary.appendChild(qSpan);
            summary.appendChild(iconDiv);
            
            const ansDiv = document.createElement('div');
            ansDiv.className = 'text-muted p-5 md:p-6 pt-0 leading-relaxed bg-base';
            ansDiv.textContent = f.a;
            
            details.appendChild(summary);
            details.appendChild(ansDiv);
            faqContainer.appendChild(details);
        });
    }
    
    initCharts(theme);
    loadGamesFromGitHub();
    loadBannersFromGitHub();

    // Intersection Observer
    const observer = new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting && (e.target.classList.add('visible'), observer.unobserve(e.target))), { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // Listeners
    document.getElementById('backToTop')?.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));
    document.getElementById('videoFacade')?.addEventListener('click', loadVideo);
    
    document.getElementById('productDetailOverlay')?.addEventListener('click', closeProductDetail);
    document.getElementById('closeDetailBtn')?.addEventListener('click', closeProductDetail);
    
    document.getElementById('mobileMenuOverlay')?.addEventListener('click', toggleMobileMenu);
    document.getElementById('mobileMenuOpenBtn')?.addEventListener('click', toggleMobileMenu);
    document.getElementById('closeMobileMenuBtn')?.addEventListener('click', toggleMobileMenu);
    document.querySelectorAll('.mobile-menu a').forEach(link => link.addEventListener('click', toggleMobileMenu));

    document.getElementById('cartOverlay')?.addEventListener('click', toggleCart);
    document.getElementById('openCartBtn')?.addEventListener('click', toggleCart);
    document.getElementById('closeCartBtn')?.addEventListener('click', toggleCart);
    document.getElementById('checkoutBtn')?.addEventListener('click', checkoutWhatsApp);

    document.getElementById('btnLoadMore')?.addEventListener('click', () => renderProducts(currentFilter, els.searchInput.value, true));
    document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', e => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentFilter = e.currentTarget.dataset.category;
        renderProducts(currentFilter, els.searchInput.value);
    }));
    els.searchInput?.addEventListener('input', e => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => renderProducts(currentFilter, e.target.value), 300); });
    
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        document.documentElement.className = newTheme; localStorage.setItem('theme', newTheme); initCharts(newTheme);
    });

    document.getElementById('serviceForm')?.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const msg = `*SOLICITAÇÃO DE REPARO*\n\n👤 ${fd.get('clientName')}\n📱 ${fd.get('clientPhone')}\n🎮 ${fd.get('device')}\n⚠️ ${fd.get('issue')}`;
        window.open(`https://wa.me/5521995969378?text=${encodeURIComponent(msg)}`);
    });
    
    document.getElementById('serviceForm')?.addEventListener('change', () => {
        if(document.getElementById('deviceSelect').value && document.getElementById('issueSelect').value) {
            document.getElementById('serviceResult').classList.remove('hidden');
            document.getElementById('timeEstimate').textContent = document.getElementById('issueSelect').value === 'Limpeza' ? '24 Horas' : '3 a 5 dias úteis';
        }
    });

    let lastY = 0, ticking = false;
    window.addEventListener('scroll', () => {
        if(!ticking) {
            window.requestAnimationFrame(() => {
                const y = window.scrollY;
                document.getElementById('backToTop').classList.toggle('show', y > 400);
                document.getElementById('navbar').classList.toggle('nav-hidden', y > lastY && y > 80);
                lastY = y; ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (els.cartModal.classList.contains('open')) toggleCart();
            if (els.mobileMenu.classList.contains('open')) toggleMobileMenu();
            if (els.detailModal.classList.contains('open')) closeProductDetail();
        }
    });
});
