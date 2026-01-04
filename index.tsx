
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

// --- CONFIGURATION & UTILS ---
// CRITICAL FIX: Absolute URL to ensure Admin Panel connects to Backend regardless of hosting
const API_BASE_URL = "https://painel-atomic.onrender.com/api";

const formatCurrencyInput = (value: string): string => {
    const cleanValue = value.replace(/\D/g, "");
    if (!cleanValue) return "";
    return (parseInt(cleanValue, 10) / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

// --- STYLES CONSTANTS ---
const STYLES = {
    // Force Dark Mode colors with !important to prevent conflicts
    input: "w-full bg-slate-950 text-white border border-slate-700 rounded-xl p-3.5 placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-all shadow-inner font-medium",
    label: "text-xs font-bold text-slate-400 uppercase mb-2 block tracking-wider",
    btnPrimary: "bg-gradient-to-r from-yellow-500 to-orange-600 text-black font-bold rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all transform active:scale-95 px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
    btnSecondary: "px-6 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium border border-transparent hover:border-slate-700",
    modalOverlay: "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity",
    // FIXED: Adjusted max-height and width for mobile responsiveness using dvh (dynamic viewport height)
    modalContent: "relative bg-slate-900 border border-slate-700 w-[95%] md:w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] md:max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden"
};

// --- API SERVICE LAYER ---
const api = {
    async request(endpoint: string, method: string = 'GET', body?: any, token?: string) {
        const headers: any = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        try {
            // endpoint starts with /, API_BASE_URL ends without /
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });

            if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
            if (!res.ok) throw new Error("API_ERROR");
            return res.json();
        } catch (error) {
            console.error(`API Fail [${endpoint}]:`, error);
            throw error;
        }
    },

    login: (password: string) => api.request('/auth/login', 'POST', { password }),
    getProducts: (token: string) => api.request('/products', 'GET', undefined, token),
    saveProduct: (token: string, product: any) => api.request('/products', 'POST', product, token),
    deleteProduct: (token: string, id: string) => api.request(`/products/${id}`, 'DELETE', undefined, token),
    getBanners: (token: string) => api.request('/banners', 'GET', undefined, token),
    saveBanners: (token: string, banners: any[]) => api.request('/banners', 'POST', banners, token),
    getOrders: (token: string) => api.request('/orders', 'GET', undefined, token),
    updateOrder: (token: string, orderId: string, status: string) => api.request('/orders/update', 'POST', { orderId, status }, token),
    createOrder: (token: string, order: any) => api.request('/orders', 'POST', order, token),
    getStats: (token: string) => api.request('/stats', 'GET', undefined, token),
    getConfig: (token: string) => api.request('/config', 'GET', undefined, token),
    saveConfig: (token: string, config: any) => api.request('/config', 'POST', config, token),
    upload: (token: string, file: { filename: string, content: string, folder: string }) => api.request('/upload', 'POST', file, token)
};

// --- TYPES ---
interface Product { id: string; name: string; price: string; category: string; desc: string; image: string; }
interface Banner { id: string; image: string; link: string; }
interface Order { id: string; customer: string; total: string; status: string; date: string; items: string; }
interface SiteConfig { whatsapp: string; instagram: string; maintenance: boolean; announcement: string; ga_id: string; }
interface Stats { 
    total_visits: number; today_visits: number; 
    total_carts: number; today_carts: number;
    total_whatsapp: number; today_whatsapp: number;
    last_updated: string; 
}
interface ToastMsg { id: number; type: 'success' | 'error' | 'info'; text: string; }

// --- CUSTOM UI COMPONENTS ---

const FileUploader = ({ label, currentImage, onFileSelect }: { label: string, currentImage?: string, onFileSelect: (f: File) => void }) => {
    const [preview, setPreview] = useState(currentImage || '');
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync preview when prop changes (crucial for editing mode)
    useEffect(() => { setPreview(currentImage || ''); }, [currentImage]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setPreview(url);
            onFileSelect(file);
        }
    };

    return (
        <div className="space-y-2">
            <span className={STYLES.label}>{label}</span>
            <div 
                onClick={() => inputRef.current?.click()}
                className="group relative h-56 w-full border-2 border-dashed border-slate-700 hover:border-yellow-500 bg-slate-950 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden shadow-inner"
            >
                {preview ? (
                   <>
                       <div className="absolute inset-0 z-0 bg-slate-900">
                           <img src={preview} className="w-full h-full object-cover opacity-30 blur-sm scale-110" />
                       </div>
                       <img src={preview} className="relative z-10 h-40 w-auto object-contain rounded-lg shadow-2xl group-hover:scale-105 transition-transform duration-300" />
                       <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px]">
                            <span className="bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wide shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all flex items-center gap-2">
                                <i className="fa-solid fa-camera"></i> Trocar Imagem
                            </span>
                       </div>
                   </>
                ) : (
                    <div className="relative z-10 flex flex-col items-center text-slate-500 group-hover:text-yellow-500 transition-colors">
                        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider">Clique para enviar imagem</span>
                        <span className="text-[10px] text-slate-600 mt-1">JPG, PNG ou WEBP</span>
                    </div>
                )}
                <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
            </div>
        </div>
    );
};

// --- APP & LAYOUT ---

const App = () => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
    const [theme, setTheme] = useState(localStorage.getItem('atomic_theme') || 'dark');

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('atomic_theme', newTheme);
    };

    const handleLogin = (t: string) => {
        localStorage.setItem('admin_token', t);
        setToken(t);
    };

    const handleLogout = () => {
        localStorage.removeItem('admin_token');
        setToken(null);
        window.location.reload();
    };

    if (!token) return <LoginScreen onLogin={handleLogin} />;
    
    return <DashboardLayout token={token} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
};

const LoginScreen = ({ onLogin }: { onLogin: (t: string) => void }) => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPass, setShowPass] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const data = await api.login(password);
            if (data.token) onLogin(data.token);
            else setError('Acesso negado');
        } catch (e) {
            setError('Senha incorreta ou erro de servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-full flex items-center justify-center relative overflow-hidden bg-slate-950 font-[Inter]">
            {/* Background Image - Standardized with Dashboard */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[url('https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/img1.jpeg')] bg-cover bg-center opacity-40 blur-[2px] transform scale-105"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/40"></div>
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.5)]"></div>
            </div>
            
            <div className="relative z-10 w-full max-w-md p-1 m-4 rounded-2xl bg-gradient-to-b from-slate-700/50 to-slate-900/50 shadow-[0_0_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl border border-slate-700/50 animate-in fade-in zoom-in duration-500">
                <div className="bg-slate-900/80 rounded-xl p-8 backdrop-blur-md relative overflow-hidden group">
                     {/* Glow effect behind Logo */}
                    <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-40 h-40 bg-yellow-500/20 rounded-full blur-[50px] group-hover:bg-yellow-500/30 transition-all duration-700"></div>

                    <div className="text-center mb-8 relative z-10">
                        <div className="inline-block relative mb-4">
                            <div className="absolute inset-0 bg-yellow-500 rounded-full blur-md opacity-20 animate-pulse"></div>
                            <img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="w-24 h-24 rounded-full border-2 border-yellow-500/30 shadow-xl object-contain bg-slate-950 relative z-10" />
                        </div>
                        <h2 className="text-4xl font-bold text-white font-[Rajdhani] tracking-wide mb-1">ATOMIC <span className="text-yellow-500">ADMIN</span></h2>
                        <p className="text-slate-400 text-[10px] uppercase tracking-[0.3em] font-medium border-t border-slate-800 pt-3 mt-2 inline-block px-4">Painel de Controle</p>
                    </div>

                    <form onSubmit={submit} className="space-y-5 relative z-10">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Senha de Acesso</label>
                            <div className="relative group/input">
                                <input 
                                    type={showPass ? "text" : "password"} 
                                    value={password} 
                                    onChange={(e) => setPassword(e.target.value)} 
                                    className="w-full bg-slate-950/80 text-white border border-slate-700 rounded-xl p-4 pl-12 placeholder-slate-600 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-all font-mono text-lg shadow-inner" 
                                    placeholder="••••••••" 
                                />
                                <i className="fa-solid fa-lock absolute left-4 top-[1.1rem] text-slate-600 group-focus-within/input:text-yellow-500 transition-colors"></i>
                                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-[1.1rem] text-slate-600 hover:text-white transition-colors">
                                    <i className={`fa-solid ${showPass ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>
                        
                        {error && (
                            <div className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 animate-in slide-in-from-top-2">
                                <i className="fa-solid fa-circle-exclamation"></i> {error}
                            </div>
                        )}

                        <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-black font-bold rounded-xl shadow-[0_4px_20px_-5px_rgba(234,179,8,0.4)] hover:shadow-[0_8px_25px_-5px_rgba(234,179,8,0.5)] transition-all transform active:scale-95 px-6 py-4 uppercase tracking-widest text-sm flex items-center justify-center gap-2 mt-4 relative overflow-hidden group/btn">
                            <span className="relative z-10 flex items-center gap-2">
                                {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <><i className="fa-solid fa-right-to-bracket"></i> Acessar Painel</>}
                            </span>
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300"></div>
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-[10px] text-slate-600">Atomic Games © {new Date().getFullYear()} • Sistema Seguro</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DashboardLayout = ({ token, onLogout, theme, toggleTheme }: any) => {
    const [section, setSection] = useState('dashboard');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    
    // Shared Data
    const [products, setProducts] = useState<Product[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    const showToast = (type: 'success' | 'error' | 'info', text: string) => {
        const id = Date.now();
        setToasts(p => [...p, { id, type, text }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
    };

    const loadCoreData = useCallback(async () => {
        setLoadingData(true);
        try {
            const [pData, bData] = await Promise.all([api.getProducts(token), api.getBanners(token)]);
            setProducts(pData);
            setBanners(bData);
        } catch (e: any) {
            if (e.message === "UNAUTHORIZED") onLogout();
            else showToast('error', 'Falha ao carregar dados');
        } finally {
            setLoadingData(false);
        }
    }, [token]);

    useEffect(() => { loadCoreData(); }, [loadCoreData]);

    const bgStyle = theme === 'light' 
        ? { backgroundImage: `url('https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/img1.jpeg')`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }
        : { backgroundColor: '#0f172a' };

    return (
        <div style={bgStyle} className="h-screen flex flex-col text-slate-100 transition-all duration-500 relative font-[Inter]">
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`pointer-events-auto min-w-[300px] p-4 rounded-lg shadow-2xl border-l-4 flex items-center gap-3 bg-slate-900 text-white animate-in slide-in-from-right ${t.type === 'success' ? 'border-emerald-500' : t.type === 'error' ? 'border-red-500' : 'border-blue-500'}`}>
                        <i className={`fa-solid ${t.type === 'success' ? 'fa-circle-check text-emerald-500' : t.type === 'error' ? 'fa-circle-exclamation text-red-500' : 'fa-circle-info text-blue-500'}`}></i>
                        <span className="text-sm font-medium">{t.text}</span>
                    </div>
                ))}
            </div>

            <nav className={`h-16 border-b border-slate-700 px-6 flex items-center justify-between shadow-lg z-20 ${theme === 'light' ? 'bg-slate-900/95' : 'bg-slate-900'}`}>
                <div className="flex items-center gap-3">
                    <button className="md:hidden text-slate-300" onClick={() => setMobileMenuOpen(true)}><i className="fa-solid fa-bars text-xl"></i></button>
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center ring-2 ring-yellow-400/50"><img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="w-full h-full object-contain" /></div>
                    <h1 className="text-xl font-bold font-[Rajdhani] text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 hidden sm:block">ATOMIC ADMIN</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={toggleTheme} className="w-10 h-10 rounded-full hover:bg-slate-800 transition flex items-center justify-center text-yellow-400"><i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i></button>
                    <button onClick={() => confirm("Sair?") && onLogout()} className="text-slate-400 hover:text-red-500 transition"><i className="fa-solid fa-power-off text-lg"></i></button>
                </div>
            </nav>

            <div className="flex-1 flex overflow-hidden relative">
                {mobileMenuOpen && <div className="fixed inset-0 bg-black/80 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)}></div>}
                
                <aside className={`fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-700/50 z-40 transition-transform duration-300 md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                   <div className="p-4 space-y-2">
                       <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 mt-2">Navegação</p>
                       <NavButton icon="fa-chart-pie" label="Dashboard" active={section === 'dashboard'} onClick={() => { setSection('dashboard'); setMobileMenuOpen(false); }} />
                       <NavButton icon="fa-shopping-cart" label="Pedidos" active={section === 'orders'} onClick={() => { setSection('orders'); setMobileMenuOpen(false); }} />
                       <NavButton icon="fa-box-open" label="Produtos" active={section === 'products'} onClick={() => { setSection('products'); setMobileMenuOpen(false); }} />
                       <NavButton icon="fa-images" label="Banners" active={section === 'banners'} onClick={() => { setSection('banners'); setMobileMenuOpen(false); }} />
                       <NavButton icon="fa-sliders" label="Configurações" active={section === 'settings'} onClick={() => { setSection('settings'); setMobileMenuOpen(false); }} />
                   </div>
                </aside>

                <main className={`flex-1 p-4 md:p-8 overflow-auto custom-scroll relative w-full ${theme === 'light' ? 'bg-slate-900/90' : 'bg-slate-900'}`}>
                    {section === 'dashboard' && <DashboardHome token={token} products={products} />}
                    {section === 'products' && <ProductsManager token={token} products={products} refresh={loadCoreData} loading={loadingData} toast={showToast} />}
                    {section === 'banners' && <BannersManager token={token} banners={banners} refresh={loadCoreData} toast={showToast} />}
                    {section === 'orders' && <OrdersManager token={token} toast={showToast} />}
                    {section === 'settings' && <SettingsManager token={token} toast={showToast} />}
                </main>
            </div>
        </div>
    );
};

const NavButton = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 font-medium transition-colors ${active ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
        <i className={`fa-solid ${icon} w-5 text-center`}></i> {label}
    </button>
);

// --- SECTIONS ---

const DashboardHome = ({ token, products }: { token: string, products: Product[] }) => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        const load = () => api.getStats(token)
            .then(data => { setStats(data); setIsOnline(true); })
            .catch(() => setIsOnline(false));
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [token]);

    const totalStock = products.reduce((acc, p) => {
        const val = parseFloat(p.price.replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;
        return acc + val;
    }, 0);

    const conversionRate = stats?.today_visits ? ((stats.today_carts / stats.today_visits) * 100).toFixed(1) : 0;

    return (
        <div className="space-y-6 fade-in max-w-7xl mx-auto">
            <header className="flex justify-between items-end mb-8">
                <div><h2 className="text-4xl font-bold font-[Rajdhani] mb-2">Visão Geral</h2><p className="text-slate-400">Monitoramento em tempo real do Site Oficial.</p></div>
                <div className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-2 animate-pulse ${isOnline ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></div> {isOnline ? 'Conectado ao Backend' : 'Reconectando...'}
                </div>
            </header>
            
            {/* ROW 1: KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard icon="fa-wallet" label="Estoque Estimado" value={totalStock.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} color="emerald" />
                <StatCard icon="fa-box" label="Produtos Ativos" value={products.length} color="blue" />
                <StatCard icon="fa-users" label="Visitas Hoje" value={stats?.today_visits || 0} color="purple" />
                <StatCard icon="fa-cart-shopping" label="Carrinhos (Hoje)" value={stats?.today_carts || 0} color="yellow" />
            </div>

            {/* ROW 2: Conversion & Funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <FunnelSection stats={stats} />

                <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
                    <h3 className="text-lg font-bold mb-2 font-[Rajdhani] self-start z-10"><i className="fa-solid fa-percent text-orange-500 mr-2"></i> Taxa de Conversão</h3>
                    <p className="text-xs text-slate-400 self-start mb-4 z-10">Visitantes que colocaram itens no carrinho.</p>
                    <div className="relative w-40 h-40 flex items-center justify-center mt-2 z-10">
                        <div className="absolute inset-0 border-8 border-slate-700 rounded-full"></div>
                        <div className="absolute inset-0 border-8 border-orange-500 rounded-full" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${Math.min(100, parseFloat(String(conversionRate)))}%, 0 ${Math.min(100, parseFloat(String(conversionRate)))}%)`, opacity: 0.8 }}></div>
                        <div className="text-center">
                            <span className="text-4xl font-bold text-white tracking-tighter">{conversionRate}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FunnelSection = ({ stats }: { stats: any }) => {
    const visits = stats?.today_visits || 0;
    const carts = stats?.today_carts || 0;
    const whatsapp = stats?.today_whatsapp || 0;
    
    // Avoid division by zero
    const max = Math.max(visits, 1);
    
    // Calculate percentages
    const cartPct = ((carts / max) * 100).toFixed(1);
    const whatsappPct = ((whatsapp / max) * 100).toFixed(1);

    // Calculate widths for visual funnel (min 15% to be visible)
    const wVisits = 100;
    const wCarts = Math.max(15, (carts / max) * 100);
    const wWhatsapp = Math.max(15, (whatsapp / max) * 100);

    return (
        <div className="bg-slate-800/50 border border-slate-700/50 p-8 rounded-2xl relative overflow-hidden lg:col-span-2 flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-8 z-10">
                 <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <i className="fa-solid fa-filter text-xl"></i>
                 </div>
                 <div>
                    <h3 className="text-xl font-bold font-[Rajdhani] text-white">Funil de Vendas</h3>
                    <p className="text-xs text-slate-400 uppercase tracking-widest">Fluxo do Cliente (Hoje)</p>
                 </div>
            </div>

            {/* Funnel Container */}
            <div className="relative flex flex-col items-center gap-4 z-10 flex-1 justify-center py-4">
                {/* Connecting Dashed Line */}
                <div className="absolute top-0 bottom-0 w-[1px] border-l border-dashed border-slate-700 z-0"></div>

                {/* Step 1: Visits */}
                <FunnelStep 
                    label="Visitas Totais" 
                    value={visits} 
                    percent={100} 
                    width={100} 
                    accentColor="border-indigo-500" 
                    icon="fa-users"
                    iconColor="text-indigo-400"
                />

                {/* Step 2: Carts */}
                <FunnelStep 
                    label="Adicionou ao Carrinho" 
                    value={carts} 
                    percent={cartPct} 
                    width={wCarts} 
                    accentColor="border-yellow-500" 
                    icon="fa-cart-shopping"
                    iconColor="text-yellow-400"
                />

                {/* Step 3: WhatsApp */}
                <FunnelStep 
                    label="Finalizou (WhatsApp)" 
                    value={whatsapp} 
                    percent={whatsappPct} 
                    width={wWhatsapp} 
                    accentColor="border-emerald-500" 
                    icon="fa-whatsapp"
                    iconColor="text-emerald-400"
                />
            </div>
            
            {/* Background Decor */}
             <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
             <div className="absolute bottom-0 left-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>
        </div>
    );
};

const FunnelStep = ({ label, value, percent, width, accentColor, icon, iconColor }: any) => (
    <div className="relative w-full flex flex-col items-center group z-10 cursor-default transition-transform hover:scale-[1.01]">
        <div 
            className={`relative h-20 rounded-lg bg-slate-900 border border-slate-700/60 border-l-4 ${accentColor} flex items-center justify-between px-6 shadow-xl`}
            style={{ width: `${width}%`, minWidth: '300px' }}
        >
             {/* Left: Icon & Label */}
             <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 ${iconColor}`}>
                    <i className={`fa-solid ${icon} text-lg`}></i>
                </div>
                <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">{label}</span>
                </div>
             </div>

             {/* Right: Value & Percent */}
             <div className="text-right">
                <div className="text-2xl font-bold text-white font-[Rajdhani]">{value}</div>
                {percent !== 100 && <div className="text-[11px] font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded inline-block mt-1 border border-slate-700/50">{percent}% conv.</div>}
             </div>
             
             {/* Shine Effect */}
             <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
        </div>
    </div>
);

const StatCard = ({ icon, label, value, color }: any) => (
    <div className={`p-6 rounded-2xl border-l-4 border-${color}-500 bg-slate-800/50 relative overflow-hidden group hover:bg-slate-800 transition`}>
        <div className="absolute right-[-10px] top-[-10px] opacity-[0.05] group-hover:opacity-[0.1] transition-all transform group-hover:scale-110 duration-500"><i className={`fa-solid ${icon} text-9xl text-white`}></i></div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{label}</p>
        <h3 className="text-3xl font-bold mt-2 font-mono">{value}</h3>
    </div>
);

const OrdersManager = ({ token, toast }: any) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<'create' | 'details' | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const loadOrders = async (silent = false) => {
        if(!silent) setLoading(true);
        try { setOrders(await api.getOrders(token)); } catch (e) { console.error(e); } finally { if(!silent) setLoading(false); }
    };

    useEffect(() => { loadOrders(); const i = setInterval(() => loadOrders(true), 15000); return () => clearInterval(i); }, []);

    const handleUpdate = async (id: string, status: string) => {
        try { await api.updateOrder(token, id, status); loadOrders(true); toast('success', 'Status atualizado'); } catch(e) { toast('error', 'Erro ao atualizar'); }
    };

    const handleCreate = async (order: any) => {
        try { await api.createOrder(token, order); loadOrders(); setModal(null); toast('success', 'Pedido criado'); } catch(e) { toast('error', 'Erro ao criar'); }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <header className="flex justify-between items-center border-b border-slate-700/50 pb-4">
                <h2 className="text-3xl font-bold font-[Rajdhani]">Pedidos</h2>
                <div className="flex gap-2">
                    <button onClick={() => setModal('create')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg"><i className="fa-solid fa-plus mr-2"></i> Novo</button>
                    <button onClick={() => loadOrders()} className="p-2 text-slate-400 hover:text-white"><i className="fa-solid fa-sync"></i></button>
                </div>
            </header>
            
            {/* FIXED: Added overflow-x-auto and min-w to table for mobile scrolling */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px]">
                    <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
                        <tr><th className="p-4">ID</th><th className="p-4">Cliente</th><th className="p-4">Total</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                        {loading && orders.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Carregando...</td></tr> : orders.map(o => (
                            <tr key={o.id} className="hover:bg-slate-700/30 transition">
                                <td className="p-4 font-mono text-xs text-slate-500">#{o.id}</td>
                                <td className="p-4 font-bold">{o.customer}</td>
                                <td className="p-4 font-mono text-emerald-400">{o.total}</td>
                                <td className="p-4"><StatusBadge status={o.status} /></td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => { setSelectedOrder(o); setModal('details'); }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-blue-400"><i className="fa-solid fa-eye"></i></button>
                                    <select value={o.status} onChange={(e) => handleUpdate(o.id, e.target.value)} className="bg-slate-900 border border-slate-700 rounded text-xs p-1 outline-none">
                                        <option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="shipped">Enviado</option><option value="delivered">Entregue</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {modal === 'create' && <CreateOrderModal onClose={() => setModal(null)} onSave={handleCreate} />}
            {modal === 'details' && selectedOrder && <OrderDetailsModal order={selectedOrder} onClose={() => setModal(null)} />}
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const colors: any = { pending: 'text-yellow-400 bg-yellow-400/10', approved: 'text-blue-400 bg-blue-400/10', shipped: 'text-purple-400 bg-purple-400/10', delivered: 'text-emerald-400 bg-emerald-400/10' };
    return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border border-white/5 ${colors[status] || 'text-slate-400'}`}>{status}</span>;
};

const CreateOrderModal = ({ onClose, onSave }: any) => {
    const [form, setForm] = useState({ customer: '', items: '', total: '', status: 'approved' });
    return (
        <ModalBase title="Novo Pedido Manual" onClose={onClose}>
            <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
                <div><label className={STYLES.label}>Cliente</label><input required className={STYLES.input} value={form.customer} onChange={e => setForm({...form, customer: e.target.value})} /></div>
                <div><label className={STYLES.label}>Itens</label><textarea required className={STYLES.input} value={form.items} onChange={e => setForm({...form, items: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className={STYLES.label}>Total</label><input required className={STYLES.input} value={form.total} onChange={e => setForm({...form, total: formatCurrencyInput(e.target.value)})} placeholder="R$ 0,00" /></div>
                    <div><label className={STYLES.label}>Status</label><select className={STYLES.input} value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="approved">Aprovado</option><option value="pending">Pendente</option></select></div>
                </div>
                <div className="flex justify-end gap-3 mt-6"><button type="button" onClick={onClose} className={STYLES.btnSecondary}>Cancelar</button><button type="submit" className={STYLES.btnPrimary}>Criar</button></div>
            </form>
        </ModalBase>
    );
};

const OrderDetailsModal = ({ order, onClose }: any) => {
    // Parser simples para transformar a string de itens em uma lista visual
    const itemsList = order.items.split('|').map((item: string) => item.trim());

    return (
        <ModalBase title={`Pedido #${order.id}`} onClose={onClose}>
            <div className="space-y-6" id="print-area">
                <div className="flex justify-between items-start border-b border-slate-700 pb-4">
                    <div><p className="text-sm text-slate-400 uppercase font-bold tracking-wider">Cliente</p><p className="text-xl font-bold">{order.customer}</p></div>
                    <div className="text-right"><p className="text-sm text-slate-400 uppercase font-bold tracking-wider">Data</p><p className="font-mono text-slate-300">{order.date}</p></div>
                </div>
                
                {/* Visual Cupom Fiscal - FIXED: Reduced padding on mobile */}
                <div className="bg-white text-black p-4 md:p-6 rounded-sm shadow-xl font-mono text-sm relative">
                    {/* Serrilhado fake top */}
                    <div className="absolute top-0 left-0 w-full h-2 bg-slate-900" style={{clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)'}}></div>
                    
                    <div className="text-center border-b-2 border-dashed border-black/20 pb-4 mb-4 mt-2">
                        <h4 className="font-bold text-lg uppercase">Atomic Games</h4>
                        <p className="text-xs">Pedido de Venda</p>
                    </div>

                    <div className="space-y-2 mb-4">
                        {itemsList.map((item: string, idx: number) => (
                            <div key={idx} className="flex justify-between items-start">
                                <span className="mr-2">•</span>
                                <span className="flex-1">{item}</span>
                            </div>
                        ))}
                    </div>

                    <div className="border-t-2 border-dashed border-black/20 pt-4 flex justify-between items-center text-lg font-bold">
                        <span>TOTAL</span>
                        <span>{order.total}</span>
                    </div>

                    <div className="mt-8 text-center text-xs opacity-50">
                        <p>Obrigado pela preferência!</p>
                        <p>www.atomicgames.com.br</p>
                    </div>

                    {/* Serrilhado fake bottom */}
                    <div className="absolute bottom-0 left-0 w-full h-2 bg-slate-900" style={{clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)'}}></div>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 no-print"><button onClick={() => window.print()} className={STYLES.btnSecondary}><i className="fa-solid fa-print mr-2"></i> Imprimir</button></div>
        </ModalBase>
    );
};

const ProductsManager = ({ token, products, refresh, toast }: any) => {
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Product | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza?')) return;
        try { await api.deleteProduct(token, id); refresh(); toast('success', 'Produto removido'); } catch(e) { toast('error', 'Erro ao remover'); }
    };

    const handleSave = async (prod: any, file: File | null) => {
        try {
            let image = prod.image;
            if (file) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                await new Promise(r => reader.onload = r);
                const content = (reader.result as string).split(',')[1];
                const res = await api.upload(token, { filename: `${Date.now()}-${file.name}`, content, folder: 'products' });
                image = res.url;
            }
            const payload = { ...prod, image, id: prod.id || Date.now().toString() };
            if (!payload.price.includes('R$')) payload.price = `R$ ${payload.price}`;
            
            await api.saveProduct(token, payload);
            refresh();
            setEditing(null); setIsCreating(false);
            toast('success', 'Produto salvo');
        } catch (e) { toast('error', 'Erro ao salvar'); }
    };

    const startEditing = (p: Product) => {
        setEditing(p);
        setIsCreating(false);
    };

    const startCreating = () => {
        setEditing(null);
        setIsCreating(true);
    };

    const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <header className="flex justify-between items-center border-b border-slate-700/50 pb-4">
                <h2 className="text-3xl font-bold font-[Rajdhani]">Produtos</h2>
                <button onClick={startCreating} className={STYLES.btnPrimary}><i className="fa-solid fa-plus"></i> Adicionar</button>
            </header>
            <div className="relative">
                <i className="fa-solid fa-search absolute left-4 top-3.5 text-slate-500"></i>
                <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-12 focus:border-yellow-500 outline-none" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => (
                    <div key={p.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex gap-4 group hover:border-yellow-500/30 transition">
                        <div className="w-20 h-20 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0 border border-slate-700"><img src={p.image} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src='https://placehold.co/100?text=IMG'} /></div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold truncate">{p.name}</h4>
                            <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">{p.category}</span>
                            <p className="text-emerald-400 font-mono font-bold mt-1">{p.price}</p>
                        </div>
                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEditing(p)} className="text-blue-400 hover:bg-slate-700 p-1.5 rounded"><i className="fa-solid fa-pen"></i></button>
                            <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:bg-slate-700 p-1.5 rounded"><i className="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                ))}
            </div>
            {(editing || isCreating) && <ProductForm product={editing} onClose={() => { setEditing(null); setIsCreating(false); }} onSave={handleSave} />}
        </div>
    );
};

const ProductForm = ({ product, onClose, onSave }: any) => {
    const [form, setForm] = useState(product || { name: '', price: '', category: 'games', desc: '', image: '' });
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    // FIX: Force reset state when product prop changes (handles switching between edit/create modes)
    useEffect(() => {
        if (product) {
            setForm(product);
        } else {
            setForm({ name: '', price: '', category: 'games', desc: '', image: '' });
        }
    }, [product]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        await onSave(form, file);
        setSaving(false);
    };

    return (
        <ModalBase title={product ? 'Editar Produto' : 'Novo Produto'} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <label className={STYLES.label}>Nome</label>
                        <input required className={STYLES.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: God of War Ragnarok" />
                    </div>
                    
                    <div>
                        <label className={STYLES.label}>Preço</label>
                        <input required className={STYLES.input} value={form.price} onChange={e => setForm({...form, price: formatCurrencyInput(e.target.value})} placeholder="R$ 0,00" />
                    </div>
                    
                    <div>
                        <label className={STYLES.label}>Categoria</label>
                        <select className={STYLES.input} value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                            <option value="games">Jogos</option>
                            <option value="console">Consoles</option>
                            <option value="acessorios">Acessórios</option>
                            <option value="hardware">Hardware</option>
                        </select>
                    </div>

                    <div className="md:col-span-2">
                        <FileUploader label="Imagem do Produto" currentImage={form.image} onFileSelect={setFile} />
                    </div>

                    <div className="md:col-span-2">
                        <label className={STYLES.label}>Descrição</label>
                        <textarea className={STYLES.input + " h-32 font-mono text-sm resize-none"} value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} placeholder="Detalhes do produto..."></textarea>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-700/50">
                    <button type="button" onClick={onClose} className={STYLES.btnSecondary}>Cancelar</button>
                    <button type="submit" disabled={saving} className={STYLES.btnPrimary + " min-w-[120px]"}>
                        {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Salvar'}
                    </button>
                </div>
            </form>
        </ModalBase>
    );
};

const SettingsManager = ({ token, toast }: any) => {
    const [config, setConfig] = useState<SiteConfig>({ whatsapp: '', instagram: '', maintenance: false, announcement: '', ga_id: '' });

    useEffect(() => { api.getConfig(token).then(setConfig).catch(() => {}); }, [token]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        try { await api.saveConfig(token, config); toast('success', 'Configurações salvas'); } catch(e) { toast('error', 'Erro ao salvar'); }
    };

    const SnippetBox = ({ title, code }: any) => {
        const copy = () => { navigator.clipboard.writeText(code); toast('info', 'Código copiado!'); };
        return (
            <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden text-xs font-mono mb-4">
                <div className="flex justify-between items-center bg-slate-800 px-3 py-2 border-b border-slate-700">
                    <span className="text-slate-400 font-bold uppercase">{title}</span>
                    <button onClick={copy} className="text-blue-400 hover:text-white"><i className="fa-regular fa-copy"></i> Copiar</button>
                </div>
                <div className="p-3 text-slate-300 whitespace-pre overflow-x-auto">{code}</div>
            </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-10">
            <h2 className="text-3xl font-bold font-[Rajdhani] border-b border-slate-700/50 pb-4">Configurações do Site</h2>
            
            {/* Integration Section - NEW */}
            <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                <h3 className="font-bold text-xl text-blue-400 flex items-center gap-3 border-b border-slate-700/50 pb-4">
                    <i className="fa-solid fa-code"></i> Integração de Métricas (API)
                </h3>
                <p className="text-sm text-slate-400">Abaixo estão os endpoints que conectam o site ao painel para alimentar os gráficos.</p>
                
                <SnippetBox title="Endpoint de Rastreamento (Visita/Carrinho/WhatsApp)" code={`// POST para ${API_BASE_URL}/public/visit\n// Payload: { "type": "visit" | "add_to_cart" | "whatsapp" }`} />
            </div>

            <form onSubmit={save} className="grid md:grid-cols-2 gap-8">
                {/* Contato Card */}
                <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                    <h3 className="font-bold text-xl text-yellow-500 flex items-center gap-3 border-b border-slate-700/50 pb-4">
                        <i className="fa-solid fa-address-card"></i> Contato & Redes
                    </h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className={STYLES.label}>WhatsApp (Somente números)</label>
                            <input className={STYLES.input} value={config.whatsapp} onChange={e => setConfig({...config, whatsapp: e.target.value})} placeholder="5521999999999" />
                            <p className="text-[10px] text-slate-500 mt-1 ml-1">Inclua o código do país (55) e DDD.</p>
                        </div>
                        <div>
                            <label className={STYLES.label}>Link do Instagram</label>
                            <input className={STYLES.input} value={config.instagram} onChange={e => setConfig({...config, instagram: e.target.value})} placeholder="https://instagram.com/..." />
                        </div>
                    </div>
                </div>

                {/* Sistema Card */}
                <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                    <h3 className="font-bold text-xl text-red-400 flex items-center gap-3 border-b border-slate-700/50 pb-4">
                        <i className="fa-solid fa-gears"></i> Sistema
                    </h3>
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer" onClick={() => setConfig({...config, maintenance: !config.maintenance})}>
                            <div>
                                <span className="font-bold block text-sm mb-1">Modo Manutenção</span>
                                <span className="text-xs text-slate-400">Bloqueia o acesso público ao site.</span>
                            </div>
                            <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${config.maintenance ? 'bg-red-500' : 'bg-slate-700'}`}>
                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${config.maintenance ? 'translate-x-6' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                        
                        <div>
                            <label className={STYLES.label}>Faixa de Aviso Global</label>
                            <input className={STYLES.input} value={config.announcement} onChange={e => setConfig({...config, announcement: e.target.value})} placeholder="Ex: Promoção de Carnaval! Aproveite." />
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 flex justify-end pt-4">
                    <button type="submit" className={STYLES.btnPrimary + " px-10 py-4 text-lg shadow-2xl"}>
                        <i className="fa-solid fa-floppy-disk mr-2"></i> Salvar Alterações
                    </button>
                </div>
            </form>
        </div>
    );
};

const BannersManager = ({ token, banners, refresh, toast }: any) => {
    const [files, setFiles] = useState<{ [key: string]: File | null }>({});
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const newBanners = [...banners];
            for (let i = 1; i <= 2; i++) {
                const id = `banner_${i}`;
                const file = files[id];
                if (file) {
                    const reader = new FileReader(); reader.readAsDataURL(file);
                    await new Promise(r => reader.onload = r);
                    const content = (reader.result as string).split(',')[1];
                    await api.upload(token, { filename: file.name, content, folder: 'banners' });
                    
                    const idx = newBanners.findIndex(b => b.id === id);
                    if(idx !== -1) newBanners[idx].image = file.name;
                    else newBanners.push({ id, image: file.name, link: '#store' });
                }
            }
            await api.saveBanners(token, newBanners);
            refresh(); toast('success', 'Banners atualizados');
        } catch(e) { toast('error', 'Erro ao salvar'); } finally { setSaving(false); }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold font-[Rajdhani] border-b border-slate-700/50 pb-4">Gerenciar Banners</h2>
            <div className="grid md:grid-cols-2 gap-8">
                {[1, 2].map(id => {
                    const bid = `banner_${id}`;
                    const current = banners.find(b => b.id === bid)?.image;
                    const url = current ? `https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/BANNER%20SAZIONAL/${current}` : '';
                    
                    return (
                        <div key={id} className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 space-y-4">
                            <h3 className="font-bold text-lg">Banner Principal {id}</h3>
                            <FileUploader 
                                label="" 
                                currentImage={files[bid] ? URL.createObjectURL(files[bid]!) : url} 
                                onFileSelect={(f) => setFiles({ ...files, [bid]: f })} 
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-end pt-4">
                <button onClick={handleSave} disabled={saving} className={STYLES.btnPrimary + " px-10 py-4 text-lg"}>
                    {saving ? 'Enviando...' : 'Salvar Banners'}
                </button>
            </div>
        </div>
    );
};

// --- SHARED UI ---
// FIXED: Adjusted flex-1 and scroll behavior to ensure footer is visible and content scrolls
const ModalBase = ({ title, onClose, children }: any) => createPortal(
    <div className={STYLES.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={STYLES.modalContent}>
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 shrink-0">
                <h3 className="text-xl font-bold text-white font-[Rajdhani]">{title}</h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center transition-colors">
                    <i className="fa-solid fa-xmark text-lg text-slate-400 hover:text-white"></i>
                </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto custom-scroll bg-slate-900 flex-1 relative">{children}</div>
        </div>
    </div>,
    document.body
);

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
