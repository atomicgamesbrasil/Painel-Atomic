import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

// --- CONFIGURATION & UTILS ---
const API_BASE_URL = "/api";

const formatCurrencyInput = (value: string): string => {
    const cleanValue = value.replace(/\D/g, "");
    if (!cleanValue) return "";
    return (parseInt(cleanValue, 10) / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

// --- API SERVICE LAYER ---
const api = {
    async request(endpoint: string, method: string = 'GET', body?: any, token?: string) {
        const headers: any = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        try {
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
interface Stats { total_visits: number; today_visits: number; last_updated: string; }
interface ToastMsg { id: number; type: 'success' | 'error' | 'info'; text: string; }

// --- CUSTOM UI COMPONENTS ---

const FileUploader = ({ label, currentImage, onFileSelect }: { label: string, currentImage?: string, onFileSelect: (f: File) => void }) => {
    const [preview, setPreview] = useState(currentImage || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (currentImage) setPreview(currentImage); }, [currentImage]);

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
            <span className="label">{label}</span>
            <div 
                onClick={() => inputRef.current?.click()}
                className="group relative h-48 w-full border-2 border-dashed border-slate-700 hover:border-yellow-500 bg-slate-950 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden shadow-inner"
            >
                {preview ? (
                   <>
                       <div className="absolute inset-0 z-0">
                           <img src={preview} className="w-full h-full object-cover opacity-50 blur-[2px] scale-110" />
                           <div className="absolute inset-0 bg-black/60"></div>
                       </div>
                       <img src={preview} className="relative z-10 h-36 w-auto object-contain rounded-lg shadow-lg group-hover:scale-105 transition-transform duration-300" />
                       <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <span className="bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wide shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                                <i className="fa-solid fa-rotate mr-2"></i> Alterar Imagem
                            </span>
                       </div>
                   </>
                ) : (
                    <div className="relative z-10 flex flex-col items-center text-slate-500 group-hover:text-yellow-500 transition-colors">
                        <i className="fa-solid fa-cloud-arrow-up text-4xl mb-3"></i>
                        <span className="text-xs font-bold uppercase tracking-wider">Clique para enviar imagem</span>
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
        <div className="h-screen w-full flex items-center justify-center relative overflow-hidden bg-slate-900">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-0"></div>
            <div className="absolute inset-0 z-[-1] bg-[url('https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/img2.jpeg')] bg-cover bg-center opacity-40"></div>
            
            <div className="relative z-10 w-full max-w-md p-8 rounded-2xl shadow-2xl bg-slate-900/90 border border-yellow-500/20 backdrop-blur-xl animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-8">
                    <img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="w-20 h-20 mx-auto mb-4 rounded-full border-2 border-yellow-500/30 shadow-lg object-contain bg-slate-950" />
                    <h2 className="text-3xl font-bold text-white font-[Rajdhani]">ATOMIC ADMIN</h2>
                </div>
                <form onSubmit={submit} className="space-y-5">
                    <div className="relative">
                        <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha Mestra" className="input" />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3.5 text-slate-500 hover:text-white"><i className={`fa-solid ${showPass ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                    </div>
                    {error && <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded font-bold">{error}</div>}
                    <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-yellow-500 to-orange-600 text-black font-bold rounded-lg shadow-lg hover:shadow-orange-500/20 transition-all uppercase tracking-wide">
                        {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Acessar Painel'}
                    </button>
                </form>
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

    const chartData = [45, 52, 38, 65, 72, 85, stats?.today_visits || 0];

    return (
        <div className="space-y-6 fade-in max-w-7xl mx-auto">
            <header className="flex justify-between items-end mb-8">
                <div><h2 className="text-4xl font-bold font-[Rajdhani] mb-2">Visão Geral</h2><p className="text-slate-400">Monitoramento em tempo real.</p></div>
                <div className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-2 animate-pulse ${isOnline ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></div> {isOnline ? 'Servidor Online' : 'Desconectado'}
                </div>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard icon="fa-wallet" label="Estoque Estimado" value={totalStock.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} color="emerald" />
                <StatCard icon="fa-box" label="Produtos Ativos" value={products.length} color="yellow" />
                <StatCard icon="fa-users" label="Visitas Totais" value={stats?.total_visits || 0} color="blue" />
                <StatCard icon="fa-calendar-day" label="Visitas Hoje" value={stats?.today_visits || 0} color="purple" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl">
                    <h3 className="text-lg font-bold mb-4 font-[Rajdhani]"><i className="fa-solid fa-chart-line text-blue-500 mr-2"></i> Acessos Recentes</h3>
                    <div className="h-48 flex items-end gap-2 px-2">
                        {chartData.map((v, i) => (
                            <div key={i} className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 transition-all rounded-t relative group" style={{ height: `${(v / 100) * 100}%` }}>
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-xs py-1 px-2 rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition">{v}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ icon, label, value, color }: any) => (
    <div className={`p-6 rounded-2xl border-l-4 border-${color}-500 bg-slate-800/50 relative overflow-hidden group hover:bg-slate-800 transition`}>
        <div className="absolute right-[-10px] top-[-10px] opacity-[0.05] group-hover:opacity-[0.1] transition-all transform group-hover:scale-110 duration-500"><i className={`fa-solid ${icon} text-9xl text-white`}></i></div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{label}</p>
        <h3 className="text-3xl font-bold mt-2">{value}</h3>
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
            
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-left text-sm">
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
                <div><label className="label">Cliente</label><input required className="input" value={form.customer} onChange={e => setForm({...form, customer: e.target.value})} /></div>
                <div><label className="label">Itens</label><textarea required className="input" value={form.items} onChange={e => setForm({...form, items: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">Total</label><input required className="input" value={form.total} onChange={e => setForm({...form, total: formatCurrencyInput(e.target.value)})} placeholder="R$ 0,00" /></div>
                    <div><label className="label">Status</label><select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="approved">Aprovado</option><option value="pending">Pendente</option></select></div>
                </div>
                <div className="flex justify-end gap-3 mt-6"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="submit" className="btn-primary">Criar</button></div>
            </form>
        </ModalBase>
    );
};

const OrderDetailsModal = ({ order, onClose }: any) => (
    <ModalBase title={`Pedido #${order.id}`} onClose={onClose}>
        <div className="space-y-6" id="print-area">
            <div className="flex justify-between items-start border-b border-slate-700 pb-4">
                <div><p className="text-sm text-slate-400">Cliente</p><p className="text-xl font-bold">{order.customer}</p></div>
                <div className="text-right"><p className="text-sm text-slate-400">Data</p><p className="font-mono">{order.date}</p></div>
            </div>
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700"><p className="text-sm text-slate-400 mb-1">Itens</p><p className="whitespace-pre-wrap">{order.items}</p></div>
            <div className="flex justify-between items-center text-xl font-bold pt-2"><span>Total</span><span className="text-emerald-400">{order.total}</span></div>
        </div>
        <div className="mt-6 flex justify-end gap-3 no-print"><button onClick={() => window.print()} className="btn-secondary"><i className="fa-solid fa-print mr-2"></i> Imprimir</button></div>
    </ModalBase>
);

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

    const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <header className="flex justify-between items-center border-b border-slate-700/50 pb-4">
                <h2 className="text-3xl font-bold font-[Rajdhani]">Produtos</h2>
                <button onClick={() => setIsCreating(true)} className="btn-primary"><i className="fa-solid fa-plus mr-2"></i> Adicionar</button>
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
                            <button onClick={() => setEditing(p)} className="text-blue-400 hover:bg-slate-700 p-1.5 rounded"><i className="fa-solid fa-pen"></i></button>
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

    // CRITICAL FIX: Update form state when product prop changes (for editing)
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
                        <label className="label">Nome</label>
                        <input required className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: God of War Ragnarok" />
                    </div>
                    
                    <div>
                        <label className="label">Preço</label>
                        <input required className="input" value={form.price} onChange={e => setForm({...form, price: formatCurrencyInput(e.target.value)})} placeholder="R$ 0,00" />
                    </div>
                    
                    <div>
                        <label className="label">Categoria</label>
                        <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
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
                        <label className="label">Descrição</label>
                        <textarea className="input h-32 font-mono text-sm resize-none" value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} placeholder="Detalhes do produto..."></textarea>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-700/50">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button type="submit" disabled={saving} className="btn-primary min-w-[120px]">
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

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-10">
            <h2 className="text-3xl font-bold font-[Rajdhani] border-b border-slate-700/50 pb-4">Configurações do Site</h2>
            <form onSubmit={save} className="grid md:grid-cols-2 gap-8">
                {/* Contato Card */}
                <div className="bg-slate-800/40 p-8 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                    <h3 className="font-bold text-xl text-yellow-500 flex items-center gap-3 border-b border-slate-700/50 pb-4">
                        <i className="fa-solid fa-address-card"></i> Contato & Redes
                    </h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="label">WhatsApp (Somente números)</label>
                            <input className="input" value={config.whatsapp} onChange={e => setConfig({...config, whatsapp: e.target.value})} placeholder="5521999999999" />
                            <p className="text-[10px] text-slate-500 mt-1 ml-1">Inclua o código do país (55) e DDD.</p>
                        </div>
                        <div>
                            <label className="label">Link do Instagram</label>
                            <input className="input" value={config.instagram} onChange={e => setConfig({...config, instagram: e.target.value})} placeholder="https://instagram.com/..." />
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
                            <label className="label">Faixa de Aviso Global</label>
                            <input className="input" value={config.announcement} onChange={e => setConfig({...config, announcement: e.target.value})} placeholder="Ex: Promoção de Carnaval! Aproveite." />
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 flex justify-end pt-4">
                    <button type="submit" className="btn-primary px-10 py-4 text-lg shadow-2xl">
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
                <button onClick={handleSave} disabled={saving} className="btn-primary px-10 py-4 text-lg">
                    {saving ? 'Enviando...' : 'Salvar Banners'}
                </button>
            </div>
        </div>
    );
};

// --- SHARED UI ---
const ModalBase = ({ title, onClose, children }: any) => createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity" onClick={onClose}></div>
        <div className="relative bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 className="text-xl font-bold text-white font-[Rajdhani]">{title}</h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center transition-colors">
                    <i className="fa-solid fa-xmark text-lg text-slate-400 hover:text-white"></i>
                </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scroll bg-slate-900">{children}</div>
        </div>
    </div>,
    document.body
);

// --- GLOBAL STYLES (Tailwind Utilities Injection) ---
const GlobalStyles = () => (
    <style>{`
        /* FORCED DARK INPUT STYLES TO FIX WHITE BOX ISSUE */
        .input { 
            @apply w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-white placeholder-slate-600 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-all shadow-inner;
        }
        .label { 
            @apply text-xs font-bold text-slate-400 uppercase mb-2 block tracking-wider; 
        }
        .btn-primary { 
            @apply bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all transform active:scale-95 px-5 py-2.5; 
        }
        .btn-secondary { 
            @apply px-5 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium; 
        }
    `}</style>
);

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<><GlobalStyles /><App /></>);
}
