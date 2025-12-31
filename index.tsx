import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// CONFIG: Usa URL relativa, pois o servidor serve tanto o site quanto a API
const API_BASE_URL = "/api";

// TYPES
interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  desc: string;
  image: string;
}

interface Banner {
  id: string;
  image: string;
  link: string;
}

// COMPONENTES
const App = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const saved = localStorage.getItem('atomic_theme') || 'dark';
    setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('atomic_theme', newTheme);
  };

  if (!token) {
    return <LoginScreen onLogin={(t: string) => {
      setToken(t);
      localStorage.setItem('admin_token', t);
    }} />;
  }

  return <DashboardLayout token={token} onLogout={() => {
    setToken(null);
    localStorage.removeItem('admin_token');
  }} theme={theme} toggleTheme={toggleTheme} />;
};

const LoginScreen = ({ onLogin }: { onLogin: (t: string) => void }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        onLogin(data.token);
      } else {
        setError(data.message || 'Erro no login');
      }
    } catch (e) {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center relative overflow-hidden bg-slate-900">
      <div className="absolute inset-0 z-0 bg-[url('https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/img2.jpeg')] bg-cover bg-center opacity-40"></div>
      <div className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative z-10 w-full max-w-md p-8 rounded-2xl shadow-2xl bg-slate-900/90 border border-yellow-500/20 backdrop-blur-xl">
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-5 border-2 border-yellow-500/30 shadow-2xl overflow-hidden p-2">
            <img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-3xl font-bold text-white font-[Rajdhani]">Acesso Restrito</h2>
          <p className="text-slate-400 text-sm mt-1">Painel Administrativo Atomic Games</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative group">
            <i className="fa-solid fa-key absolute left-3 top-3.5 text-slate-500"></i>
            <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha do Sistema" className="w-full bg-slate-950/50 border border-slate-700 rounded-lg py-3 pl-10 pr-10 text-white focus:outline-none focus:border-yellow-500 transition-colors placeholder-slate-600" />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3.5 text-slate-500 hover:text-white"><i className={`fa-solid ${showPass ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
          </div>
          {error && <div className="text-red-400 text-sm text-center font-bold bg-red-500/10 py-2 rounded">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-black font-bold rounded-lg shadow-lg transition-all transform active:scale-[0.98] uppercase tracking-wide text-sm flex justify-center items-center">
            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <><i className="fa-solid fa-right-to-bracket mr-2"></i> Entrar no Sistema</>}
          </button>
        </form>
      </div>
    </div>
  );
};

const DashboardLayout = ({ token, onLogout, theme, toggleTheme }: any) => {
  const [section, setSection] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loadingProd, setLoadingProd] = useState(false);

  const bgStyle = theme === 'light' 
    ? { backgroundImage: `url('https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/img1.jpeg')`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }
    : { backgroundColor: '#0f172a' };
  const contentStyle = theme === 'light' 
    ? { background: 'rgba(11, 17, 32, 0.92)', backdropFilter: 'blur(8px)' } 
    : { background: '#0f172a' };

  const fetchData = async () => {
    setLoadingProd(true);
    try {
      const resP = await fetch(`${API_BASE_URL}/products`, { headers: { Authorization: `Bearer ${token}` } });
      if (resP.ok) setProducts(await resP.json());
      const resB = await fetch(`${API_BASE_URL}/banners`, { headers: { Authorization: `Bearer ${token}` } });
      if (resB.ok) setBanners(await resB.json());
    } catch (e) { console.error(e); } finally { setLoadingProd(false); }
  };

  useEffect(() => { fetchData(); }, [token]);

  return (
    <div style={bgStyle} className="min-h-screen flex flex-col text-slate-100 transition-all duration-500">
      <nav className={`h-16 border-b border-slate-700 px-6 flex items-center justify-between shadow-lg z-20 ${theme === 'light' ? 'bg-slate-900/95' : 'bg-slate-900'}`}>
        <div className="flex items-center gap-3">
          <img src="https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/img%20site/atomiclogo.webp" className="h-9 w-9 rounded-full bg-black ring-2 ring-yellow-400/50 animate-spin-slow" />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent hidden sm:block font-[Rajdhani]">ATOMIC ADMIN</h1>
        </div>
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-3 cursor-pointer group" onClick={toggleTheme}>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-yellow-400 hidden sm:block">Modo Visualização</span>
              <div className={`relative w-12 h-6 rounded-full transition-colors ${theme === 'light' ? 'bg-yellow-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform transform ${theme === 'light' ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </div>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <button onClick={() => { if(confirm("Sair?")) onLogout() }} className="text-slate-400 hover:text-red-500 transition-colors"><i className="fa-solid fa-power-off text-lg"></i></button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <aside style={contentStyle} className="w-64 border-r border-slate-700/50 flex-col hidden md:flex transition-all z-10">
           <div className="p-4 space-y-2">
             <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Navegação</p>
             <NavButton icon="fa-chart-line" label="Dashboard" active={section === 'dashboard'} onClick={() => setSection('dashboard')} />
             <NavButton icon="fa-box-open" label="Produtos" active={section === 'products'} onClick={() => setSection('products')} />
             <NavButton icon="fa-images" label="Banners" active={section === 'banners'} onClick={() => setSection('banners')} />
           </div>
           <div className="mt-auto p-4 border-t border-slate-700/50">
             <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
               <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-500 to-orange-600 flex items-center justify-center text-xs font-bold text-black">A</div>
               <div><p className="text-sm font-bold leading-tight">Master Admin</p><p className="text-[10px] text-emerald-500">● Conectado</p></div>
             </div>
           </div>
        </aside>

        <main style={contentStyle} className="flex-1 p-6 overflow-auto custom-scroll relative">
           {section === 'dashboard' && <DashboardHome productsCount={products.length} />}
           {section === 'products' && <ProductsManager token={token} products={products} refresh={fetchData} loading={loadingProd} />}
           {section === 'banners' && <BannersManager token={token} banners={banners} refresh={fetchData} />}
        </main>
      </div>
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 font-medium transition-colors ${active ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <i className={`fa-solid ${icon} w-5`}></i> {label}
  </button>
);

const DashboardHome = ({ productsCount }: { productsCount: number }) => (
  <div className="space-y-6 fade-in">
    <header className="mb-8">
      <h2 className="text-4xl font-bold font-[Rajdhani] mb-2">Dashboard</h2>
      <p className="text-slate-400">Visão geral do sistema e métricas.</p>
    </header>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <StatCard icon="fa-gamepad" label="Total de Produtos" value={productsCount} color="yellow" />
      <StatCard icon="fa-images" label="Banners Ativos" value="2" color="blue" />
      <div className="glass-panel p-6 rounded-2xl border-l-4 border-emerald-500 bg-slate-800/50">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Status da API</p>
          <div className="flex items-center gap-3 mt-3">
              <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
              <h3 className="text-2xl font-bold">Seguro</h3>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">Backend: Connected</p>
      </div>
    </div>
  </div>
);

const StatCard = ({ icon, label, value, color }: any) => (
  <div className={`glass-panel p-6 rounded-2xl border-l-4 border-${color}-500 relative overflow-hidden group bg-slate-800/50`}>
     <div className="absolute right-[-10px] top-[-10px] opacity-[0.05] group-hover:opacity-[0.1] transition-all transform group-hover:scale-110 duration-500">
        <i className={`fa-solid ${icon} text-9xl text-white`}></i>
     </div>
     <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
     <h3 className="text-5xl font-bold mt-2 drop-shadow-lg">{value}</h3>
  </div>
);

const ProductsManager = ({ token, products, refresh, loading }: any) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir produto?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) refresh(); else alert('Erro ao excluir');
    } catch(e) { alert('Erro de rede'); }
  };

  const filtered = products.filter((p: Product) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 fade-in">
      <header className="flex flex-col md:flex-row justify-between md:items-end gap-4 pb-4 border-b border-slate-700/50">
          <div><h2 className="text-3xl font-bold font-[Rajdhani]">Catálogo</h2><p className="text-slate-400">Gerenciamento de estoque.</p></div>
          <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2"><i className="fa-solid fa-plus-circle"></i> Novo Produto</button>
      </header>
      <div className="relative">
        <i className="fa-solid fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"></i>
        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all" />
      </div>
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-700/50 shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wider">
             <tr><th className="p-5 font-bold">Item</th><th className="p-5 font-bold">Nome</th><th className="p-5 font-bold">Categoria</th><th className="p-5 font-bold">Preço</th><th className="p-5 font-bold text-right">Ações</th></tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-700/30">
            {loading ? <tr><td colSpan={5} className="p-8 text-center">Carregando...</td></tr> : 
             filtered.map((p: Product) => (
               <tr key={p.id} className="hover:bg-slate-800/50 transition-colors group">
                 <td className="p-4 pl-5"><div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-700 overflow-hidden flex items-center justify-center"><img src={p.image} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src='https://placehold.co/100/1e293b/475569?text=IMG'} /></div></td>
                 <td className="p-4 font-bold group-hover:text-yellow-400">{p.name}</td>
                 <td className="p-4"><span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">{p.category}</span></td>
                 <td className="p-4 text-emerald-400 font-mono font-bold">{p.price}</td>
                 <td className="p-4 pr-5 text-right"><button onClick={() => { setEditItem(p); setModalOpen(true); }} className="text-slate-500 hover:text-yellow-400 p-2 mr-2"><i className="fa-solid fa-pen"></i></button><button onClick={() => handleDelete(p.id)} className="text-slate-500 hover:text-red-400 p-2"><i className="fa-solid fa-trash"></i></button></td>
               </tr>
             ))}
          </tbody>
        </table>
      </div>
      {modalOpen && <ProductModal token={token} item={editItem} onClose={() => setModalOpen(false)} onSave={() => { setModalOpen(false); refresh(); }} />}
    </div>
  );
};

const ProductModal = ({ token, item, onClose, onSave }: any) => {
  const [formData, setFormData] = useState({ id: item?.id || '', name: item?.name || '', price: item?.price || '', category: item?.category || 'games', desc: item?.desc || '', image: item?.image || '' });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let finalImg = formData.image;
      if (file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        await new Promise(resolve => reader.onload = resolve);
        const base64Content = (reader.result as string).split(',')[1];
        const cleanName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '-')}`;
        const resUp = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ filename: cleanName, content: base64Content, folder: 'products' }) });
        if (resUp.ok) { const d = await resUp.json(); finalImg = d.url; } else throw new Error("Erro upload imagem");
      }
      const payload = { ...formData, id: formData.id || Date.now().toString(), image: finalImg, isEdit: !!item };
      if(!payload.price.includes('R$')) payload.price = `R$ ${payload.price}`;
      const resProd = await fetch(`${API_BASE_URL}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if(resProd.ok) onSave(); else alert("Erro ao salvar produto");
    } catch (err: any) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
         <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl"><h3 className="text-lg font-bold flex items-center gap-2"><i className="fa-solid fa-pen-to-square text-yellow-500"></i> {item ? 'Editar' : 'Novo'} Produto</h3><button onClick={onClose}><i className="fa-solid fa-xmark text-xl text-slate-400"></i></button></div>
         <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scroll">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Nome</label><input required className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-yellow-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-400 uppercase">Preço</label><input required className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-yellow-500 outline-none" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-400 uppercase">Categoria</label><select className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-yellow-500" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}><option value="games">Jogos</option><option value="console">Consoles</option><option value="acessorios">Acessórios</option><option value="hardware">Hardware</option></select></div>
              <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Imagem</label><input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-yellow-500 file:text-black hover:file:bg-yellow-400"/></div>
              <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Descrição</label><textarea rows={3} className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:border-yellow-500 outline-none" value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})}></textarea></div>
            </div>
            <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={onClose} className="px-5 py-2 text-slate-400 hover:text-white">Cancelar</button><button type="submit" disabled={saving} className="px-8 py-2 bg-yellow-500 text-black font-bold rounded-lg shadow-lg hover:bg-orange-500">{saving ? 'Salvando...' : 'Salvar Produto'}</button></div>
         </form>
      </div>
    </div>
  );
};

const BannersManager = ({ token, banners, refresh }: any) => {
  const [b1File, setB1File] = useState<File|null>(null);
  const [b2File, setB2File] = useState<File|null>(null);
  const [saving, setSaving] = useState(false);

  const getBannerUrl = (img: string) => `https://raw.githubusercontent.com/atomicgamesbrasil/siteoficial/main/BANNER%20SAZIONAL/${img}`;
  const b1 = banners.find((b:any) => b.id === 'banner_1') || { image: '' };
  const b2 = banners.find((b:any) => b.id === 'banner_2') || { image: '' };

  const handleSave = async () => {
    setSaving(true);
    try {
      let name1 = b1.image;
      let name2 = b2.image;
      if (b1File) {
        const reader = new FileReader(); reader.readAsDataURL(b1File); await new Promise(r => reader.onload = r);
        const b64 = (reader.result as string).split(',')[1];
        await fetch(`${API_BASE_URL}/upload`, { method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({ filename: b1File.name, content: b64, folder: 'banners' }) });
        name1 = b1File.name;
      }
      if (b2File) {
        const reader = new FileReader(); reader.readAsDataURL(b2File); await new Promise(r => reader.onload = r);
        const b64 = (reader.result as string).split(',')[1];
        await fetch(`${API_BASE_URL}/upload`, { method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({ filename: b2File.name, content: b64, folder: 'banners' }) });
        name2 = b2File.name;
      }
      const newData = [{ id: 'banner_1', image: name1, link: '#store' }, { id: 'banner_2', image: name2, link: '#store' }];
      const res = await fetch(`${API_BASE_URL}/banners`, { method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify(newData) });
      if(res.ok) { alert('Banners atualizados!'); refresh(); setB1File(null); setB2File(null); }
    } catch (e) { alert('Erro ao salvar banners'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 fade-in">
       <header className="mb-8 pb-4 border-b border-slate-700/50"><h2 className="text-3xl font-bold font-[Rajdhani]">Banners Sazonais</h2></header>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8"><BannerEditCard id="1" color="yellow" currentImg={getBannerUrl(b1.image)} file={b1File} setFile={setB1File} /><BannerEditCard id="2" color="orange" currentImg={getBannerUrl(b2.image)} file={b2File} setFile={setB2File} /></div>
       <div className="flex justify-end pt-6"><button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-lg shadow-lg hover:shadow-orange-500/20">{saving ? 'Salvando...' : 'Salvar Alterações'}</button></div>
    </div>
  );
};

const BannerEditCard = ({ id, color, currentImg, file, setFile }: any) => {
  const [preview, setPreview] = useState(currentImg);
  useEffect(() => { if(file) { const reader = new FileReader(); reader.onload = (e) => setPreview(e.target?.result as string); reader.readAsDataURL(file); } else { setPreview(currentImg); } }, [file, currentImg]);

  return (
    <div className={`glass-panel p-6 rounded-2xl border border-slate-700 relative hover:border-${color}-500/50`}>
      <div className={`absolute top-0 left-0 bg-${color}-500 text-black text-xs font-bold px-3 py-1 rounded-br-lg`}>Banner {id}</div>
      <div className="mt-8 mb-4 h-40 w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center"><img src={preview} className="w-full h-full object-cover" /></div>
      <label className="block w-full cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-3 text-center transition-colors"><span className={`text-sm font-bold text-${color}-500`}><i className="fa-solid fa-upload mr-2"></i> Trocar Imagem</span><input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files?.[0])} /></label>
      {file && <p className="text-xs text-center mt-2 text-slate-400">{file.name}</p>}
    </div>
  );
};

// Check for root element to prevent null reference errors
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
