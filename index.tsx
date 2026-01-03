import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

// --- CONFIGURATION ---
// FIX: Caminho relativo conecta automaticamente ao server.js (mesma origem)
const API_BASE_URL = "/api";

// Verifica se estamos na rota do admin
const isAdminRoute = window.location.pathname.includes('/admin') || window.location.hash.includes('#admin');

if (isAdminRoute) {
    // Remove o conteúdo do site da loja para renderizar o painel limpo
    const storeEl = document.getElementById('store-content');
    if (storeEl) storeEl.style.display = 'none';
    document.body.style.overflow = 'hidden'; // Evita scroll do site
}

const formatCurrencyInput = (value: string): string => {
    const cleanValue = value.replace(/\D/g, "");
    if (!cleanValue) return "";
    return (parseInt(cleanValue, 10) / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

// --- STYLES ---
const STYLES = {
    input: "w-full bg-slate-950 text-white border border-slate-700 rounded-xl p-3.5 placeholder-slate-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-all shadow-inner font-medium",
    label: "text-xs font-bold text-slate-400 uppercase mb-2 block tracking-wider",
    btnPrimary: "bg-gradient-to-r from-yellow-500 to-orange-600 text-black font-bold rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all transform active:scale-95 px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
    btnSecondary: "px-6 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium border border-transparent hover:border-slate-700",
    modalOverlay: "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity",
    modalContent: "relative bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden"
};

// --- API CLIENT ---
const api = {
    async request(endpoint: string, method: string = 'GET', body?: any, token?: string) {
        const headers: any = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method, headers, body: body ? JSON.stringify(body) : undefined
            });

            if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
            if (!res.ok) throw new Error("API_ERROR");
            return res.json();
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
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
    upload: (token: string, file: any) => api.request('/upload', 'POST', file, token)
};

// --- TYPES ---
interface Product { id: string; name: string; price: string; category: string; desc: string; image: string; }
interface Banner { id: string; image: string; link: string; }
interface Order { id: string; customer: string; total: string; status: string; date: string; items: string; }
interface SiteConfig { whatsapp: string; instagram: string; maintenance: boolean; announcement: string; ga_id: string; }
interface Stats { total_visits: number; today_visits: number; last_updated: string; }

// --- COMPONENTS ---

const FileUploader = ({ label, currentImage, onFileSelect }: any) => {
    const [preview, setPreview] = useState(currentImage || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setPreview(currentImage || ''); }, [currentImage]);

    const handleChange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
            setPreview(URL.createObjectURL(file));
            onFileSelect(file);
        }
    };

    return (
        <div className="space-y-2">
            <span className={STYLES.label}>{label}</span>
            <div onClick={() => inputRef.current?.click()} className="group h-40 w-full border-2 border-dashed border-slate-700 hover:border-yellow-500 bg-slate-950 rounded-xl flex flex-col items-center justify-center cursor-pointer relative overflow-hidden">
                {preview ? <img src={preview} className="absolute inset-0 w-full h-full object-contain bg-slate-900" /> : <i className="fa-solid fa-cloud-arrow-up text-2xl text-slate-500"></i>}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><span className="text-white text-xs font-bold">TROCAR</span></div>
                <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
            </div>
        </div>
    );
};

const App = () => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
    if (!token) return <LoginScreen onLogin={(t) => { localStorage.setItem('admin_token', t); setToken(t); }} />;
    return <DashboardLayout token={token} onLogout={() => { localStorage.removeItem('admin_token'); setToken(null); }} />;
};

const LoginScreen = ({ onLogin }: any) => {
    const [pass, setPass] = useState('');
    const [err, setErr] = useState('');
    const [load, setLoad] = useState(false);

    const submit = async (e: any) => {
        e.preventDefault();
        setLoad(true); setErr('');
        try {
            const data = await api.login(pass);
            if (data.token) onLogin(data.token);
            else setErr('Senha inválida');
        } catch { setErr('Erro de conexão'); }
        setLoad(false);
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-900 bg-[url('https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/img2.jpeg')] bg-cover bg-center bg-no-repeat bg-blend-overlay">
            <form onSubmit={submit} className="bg-slate-950/90 p-8 rounded-2xl border border-yellow-500/20 w-full max-w-sm backdrop-blur shadow-2xl">
                <div className="text-center mb-6">
                    <img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="w-16 h-16 mx-auto mb-3 rounded-full shadow-lg" />
                    <h2 className="text-2xl font-bold font-[Rajdhani] text-white">ATOMIC ADMIN</h2>
                </div>
                <input type="password" value={pass} onChange={e => setPass(e.target.value)} className={STYLES.input + " mb-4"} placeholder="Senha Mestra" autoFocus />
                {err && <p className="text-red-400 text-xs text-center mb-4 font-bold">{err}</p>}
                <button disabled={load} className={STYLES.btnPrimary + " w-full"}>{load ? '...' : 'ENTRAR'}</button>
            </form>
        </div>
    );
};

const DashboardLayout = ({ token, onLogout }: any) => {
    const [page, setPage] = useState('dashboard');
    const [toasts, setToasts] = useState<any[]>([]);

    const toast = (type: string, text: string) => {
        const id = Date.now();
        setToasts(p => [...p, { id, type, text }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex font-[Inter]">
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`pointer-events-auto p-4 rounded-lg shadow-xl border-l-4 bg-slate-800 text-white ${t.type === 'success' ? 'border-emerald-500' : 'border-red-500'}`}>
                        <span className="text-sm font-bold">{t.text}</span>
                    </div>
                ))}
            </div>

            <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col fixed inset-y-0">
                <div className="p-6 flex items-center gap-3">
                    <img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="w-8 h-8 rounded-full" />
                    <span className="font-bold font-[Rajdhani] text-lg">PAINEL</span>
                </div>
                <nav className="flex-1 px-4 space-y-1">
                    {[
                        { id: 'dashboard', icon: 'fa-chart-pie', label: 'Visão Geral' },
                        { id: 'orders', icon: 'fa-shopping-cart', label: 'Pedidos' },
                        { id: 'products', icon: 'fa-box-open', label: 'Produtos' },
                        { id: 'banners', icon: 'fa-images', label: 'Banners' },
                        { id: 'config', icon: 'fa-cog', label: 'Configuração' }
                    ].map(item => (
                        <button key={item.id} onClick={() => setPage(item.id)} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 font-medium transition ${page === item.id ? 'bg-yellow-500 text-black' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}>
                            <i className={`fa-solid ${item.icon} w-5 text-center`}></i> {item.label}
                        </button>
                    ))}
                </nav>
                <div className="p-4">
                    <button onClick={onLogout} className="w-full py-2 text-slate-500 hover:text-red-400 text-sm font-bold"><i className="fa-solid fa-power-off"></i> SAIR</button>
                </div>
            </aside>

            <main className="flex-1 ml-64 p-8 overflow-y-auto">
                {page === 'dashboard' && <DashboardHome token={token} />}
                {page === 'orders' && <OrdersManager token={token} toast={toast} />}
                {page === 'products' && <ProductsManager token={token} toast={toast} />}
                {page === 'banners' && <BannersManager token={token} toast={toast} />}
                {page === 'config' && <ConfigManager token={token} toast={toast} />}
            </main>
        </div>
    );
};

// --- SUB-PAGES ---

const DashboardHome = ({ token }: any) => {
    const [stats, setStats] = useState<Stats | null>(null);
    useEffect(() => { api.getStats(token).then(setStats).catch(() => {}); }, [token]);

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold font-[Rajdhani]">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-800 p-6 rounded-xl border-l-4 border-blue-500">
                    <p className="text-slate-400 text-xs font-bold uppercase">Visitas Totais</p>
                    <h3 className="text-4xl font-bold mt-2">{stats?.total_visits || 0}</h3>
                </div>
                <div className="bg-slate-800 p-6 rounded-xl border-l-4 border-emerald-500">
                    <p className="text-slate-400 text-xs font-bold uppercase">Visitas Hoje</p>
                    <h3 className="text-4xl font-bold mt-2">{stats?.today_visits || 0}</h3>
                </div>
                <div className="bg-slate-800 p-6 rounded-xl border-l-4 border-yellow-500">
                    <p className="text-slate-400 text-xs font-bold uppercase">Status</p>
                    <h3 className="text-xl font-bold mt-2 text-emerald-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div> ONLINE</h3>
                </div>
            </div>
        </div>
    );
};

const OrdersManager = ({ token, toast }: any) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        api.getOrders(token).then(setOrders).finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const updateStatus = async (id: string, st: string) => {
        try { await api.updateOrder(token, id, st); toast('success', 'Atualizado'); load(); } catch { toast('error', 'Erro'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold font-[Rajdhani]">Pedidos</h2>
                <button onClick={load} className="p-2 text-slate-400 hover:text-white"><i className="fa-solid fa-sync"></i></button>
            </div>
            <div className="bg-slate-800/50 rounded-xl overflow-hidden border border-slate-700">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-900 text-slate-400 text-xs uppercase"><tr><th className="p-4">ID</th><th className="p-4">Cliente</th><th className="p-4">Total</th><th className="p-4">Status</th><th className="p-4">Data</th></tr></thead>
                    <tbody className="divide-y divide-slate-700">
                        {orders.map(o => (
                            <tr key={o.id} className="hover:bg-slate-700/50">
                                <td className="p-4 font-mono text-slate-500">#{o.id}</td>
                                <td className="p-4 font-bold">{o.customer}</td>
                                <td className="p-4 text-emerald-400 font-bold">{o.total}</td>
                                <td className="p-4">
                                    <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} className="bg-slate-900 border border-slate-600 rounded text-xs p-1">
                                        <option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="shipped">Enviado</option>
                                    </select>
                                </td>
                                <td className="p-4 text-slate-500 text-xs">{o.date}</td>
                            </tr>
                        ))}
                        {orders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ProductsManager = ({ token, toast }: any) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [edit, setEdit] = useState<Partial<Product> | null>(null);
    
    const load = useCallback(() => api.getProducts(token).then(setProducts), [token]);
    useEffect(() => { load(); }, [load]);

    const save = async (e: any) => {
        e.preventDefault();
        try {
            const p = { ...edit } as any;
            if (p.file) {
                const reader = new FileReader();
                reader.readAsDataURL(p.file);
                await new Promise(r => reader.onload = r);
                const content = (reader.result as string).split(',')[1];
                const up = await api.upload(token, { filename: Date.now() + '.jpg', content, folder: 'products' });
                p.image = up.url;
            }
            if (!p.id) p.id = Date.now().toString();
            delete p.file;
            await api.saveProduct(token, p);
            toast('success', 'Produto salvo!');
            setEdit(null); load();
        } catch { toast('error', 'Erro ao salvar'); }
    };

    const del = async (id: string) => {
        if (!confirm('Remover?')) return;
        try { await api.deleteProduct(token, id); toast('success', 'Removido'); load(); } catch { toast('error', 'Erro'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold font-[Rajdhani]">Produtos</h2>
                <button onClick={() => setEdit({ category: 'games' })} className={STYLES.btnPrimary}><i className="fa-solid fa-plus"></i> Novo</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {products.map(p => (
                    <div key={p.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex gap-4">
                        <img src={p.image} className="w-16 h-16 rounded bg-black object-cover" />
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold truncate">{p.name}</h4>
                            <p className="text-emerald-400 text-sm font-bold">{p.price}</p>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => setEdit(p)} className="text-blue-400 text-xs"><i className="fa-solid fa-pen"></i> Editar</button>
                                <button onClick={() => del(p.id)} className="text-red-400 text-xs"><i className="fa-solid fa-trash"></i> Remover</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {edit && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
                    <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 p-6">
                        <h3 className="text-xl font-bold mb-4">{edit.id ? 'Editar' : 'Novo'} Produto</h3>
                        <form onSubmit={save} className="space-y-4">
                            <input value={edit.name || ''} onChange={e => setEdit({...edit, name: e.target.value})} placeholder="Nome" className={STYLES.input} required />
                            <div className="grid grid-cols-2 gap-4">
                                <input value={edit.price || ''} onChange={e => setEdit({...edit, price: formatCurrencyInput(e.target.value)})} placeholder="Preço" className={STYLES.input} required />
                                <select value={edit.category || 'games'} onChange={e => setEdit({...edit, category: e.target.value})} className={STYLES.input}>
                                    <option value="games">Jogos</option><option value="console">Consoles</option><option value="acessorios">Acessórios</option>
                                </select>
                            </div>
                            <FileUploader label="Imagem" currentImage={edit.image} onFileSelect={(f: any) => setEdit({...edit, file: f})} />
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setEdit(null)} className={STYLES.btnSecondary}>Cancelar</button>
                                <button type="submit" className={STYLES.btnPrimary}>Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};

const BannersManager = ({ token, toast }: any) => {
    const [banners, setBanners] = useState<Banner[]>([]);
    
    useEffect(() => { api.getBanners(token).then(setBanners); }, [token]);

    const saveBanner = async (file: File, index: number) => {
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            await new Promise(r => reader.onload = r);
            const content = (reader.result as string).split(',')[1];
            const up = await api.upload(token, { filename: `banner_${index+1}_${Date.now()}.jpg`, content, folder: 'banners' });
            
            const newBanners = [...banners];
            const id = `banner_${index+1}`;
            const existingIdx = newBanners.findIndex(b => b.id === id);
            
            if (existingIdx >= 0) newBanners[existingIdx].image = up.url;
            else newBanners.push({ id, image: up.url, link: '#' });

            await api.saveBanners(token, newBanners);
            setBanners(newBanners);
            toast('success', 'Banner atualizado!');
        } catch { toast('error', 'Erro ao enviar banner'); }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold font-[Rajdhani]">Banners</h2>
            <div className="grid md:grid-cols-2 gap-6">
                {[0, 1].map(i => {
                    const b = banners.find(x => x.id === `banner_${i+1}`);
                    return (
                        <div key={i} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <h4 className="font-bold mb-4">Banner Principal {i+1}</h4>
                            <FileUploader label="" currentImage={b?.image} onFileSelect={(f: File) => saveBanner(f, i)} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const ConfigManager = ({ token, toast }: any) => {
    const [cfg, setCfg] = useState<any>({});
    useEffect(() => { api.getConfig(token).then(setCfg); }, [token]);
    const save = async (e: any) => {
        e.preventDefault();
        try { await api.saveConfig(token, cfg); toast('success', 'Config salva'); } catch { toast('error', 'Erro'); }
    };
    return (
        <form onSubmit={save} className="max-w-2xl space-y-6">
            <h2 className="text-3xl font-bold font-[Rajdhani]">Configurações</h2>
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
                <div><label className={STYLES.label}>WhatsApp (somente números)</label><input value={cfg.whatsapp || ''} onChange={e => setCfg({...cfg, whatsapp: e.target.value})} className={STYLES.input} /></div>
                <div><label className={STYLES.label}>Instagram Link</label><input value={cfg.instagram || ''} onChange={e => setCfg({...cfg, instagram: e.target.value})} className={STYLES.input} /></div>
                <div><label className={STYLES.label}>Aviso Global</label><input value={cfg.announcement || ''} onChange={e => setCfg({...cfg, announcement: e.target.value})} className={STYLES.input} /></div>
                <button className={STYLES.btnPrimary}>Salvar</button>
            </div>
        </form>
    );
};

if (isAdminRoute) {
    const root = document.getElementById('root');
    if (root) createRoot(root).render(<App />);
}
