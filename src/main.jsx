import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  writeBatch,
  serverTimestamp,
  setLogLevel,
} from 'firebase/firestore';
import {
  LayoutDashboard,
  Wifi,
  Ticket,
  Upload,
  Trash2,
  Settings,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Printer,
  FileText,
  DollarSign,
  ChevronRight,
  Menu,
  Database,
  Users, // Ditambahkan
} from 'lucide-react';

// --- KONFIGURASI FIREBASE ---
// Variabel global ini akan disediakan oleh lingkungan Canvas
const firebaseConfig = typeof __firebase_config !== 'undefined'
  ? JSON.parse(__firebase_config)
  : {
      // Fallback config jika tidak ada (hanya untuk pengembangan)
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_AUTH_DOMAIN",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_STORAGE_BUCKET",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel('debug');

// --- Fungsi Helper ---
const formatCurrency = (value) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
};

// --- Komponen Utama Aplikasi ---
export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard', 'machines', 'tokens', 'import'
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Data State
  const [machines, setMachines] = useState([]); // List mesin
  const [tokens, setTokens] = useState([]); // List token yg belum terjual
  const [sales, setSales] = useState([]); // List penjualan
  const [loading, setLoading] = useState(true);

  // Path Koleksi Firestore
  const machinesColPath = `artifacts/${appId}/public/data/machines`;
  const tokensColPath = `artifacts/${appId}/public/data/tokens`;
  const salesColPath = `artifacts/${appId}/public/data/sales`;

  // Efek untuk Autentikasi Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Error signing in:", error);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Efek untuk Fetch Data (Listeners Realtime)
  useEffect(() => {
    if (!isAuthReady || !db) {
      console.log("Auth not ready or DB not available.");
      return;
    }
    
    setLoading(true);
    console.log(`Setting up listeners for appId: ${appId}`);

    // Listener untuk Mesin
    const machinesQuery = query(collection(db, machinesColPath));
    const unsubMachines = onSnapshot(machinesQuery, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMachines(docsData);
      console.log("Fetched/Updated Machines:", docsData);
    }, (error) => console.error("Error fetching machines:", error));

    // Listener untuk Token (hanya yg belum terjual, limit 200)
    const tokensQuery = query(
      collection(db, tokensColPath),
      where('isSold', '==', false),
      limit(200)
    );
    const unsubTokens = onSnapshot(tokensQuery, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Urutkan di sisi klien (JS) untuk menghindari error indeks Firestore
      docsData.sort((a, b) => (b.importedAt?.toDate() || 0) - (a.importedAt?.toDate() || 0));
      setTokens(docsData);
      console.log("Fetched/Updated Tokens:", docsData);
    }, (error) => console.error("Error fetching tokens:", error));

    // Listener untuk Penjualan (limit 200 terbaru)
    const salesQuery = query(
      collection(db, salesColPath),
      limit(200)
    );
    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Urutkan di sisi klien (JS)
      docsData.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
      setSales(docsData);
    }, (error) => console.error("Error fetching sales:", error));

    setLoading(false);

    // Cleanup listeners
    return () => {
      unsubMachines();
      unsubTokens();
      unsubSales();
    };
  }, [isAuthReady, db]); // Bergantung pada kesiapan auth dan db

  // Kalkulasi data untuk Dashboard
  const dashboardStats = useMemo(() => {
    const totalRevenue = sales.reduce((acc, sale) => acc + sale.price, 0);
    const totalFranchiseeRevenue = sales.reduce((acc, sale) => acc + (sale.franchiseeFee || 0), 0); // Ditambahkan
    const lowPaperMachines = machines.filter(m => m.paperLevel < 20).length;
    const tokensByPrice = tokens.reduce((acc, token) => {
      const priceKey = token.price || 0;
      if (!acc[priceKey]) {
        acc[priceKey] = 0;
      }
      acc[priceKey]++;
      return acc;
    }, {});

    return {
      totalRevenue,
      totalFranchiseeRevenue, // Ditambahkan
      totalSales: sales.length,
      totalMachines: machines.length,
      availableTokens: tokens.length,
      lowPaperMachines,
      tokensByPrice,
    };
  }, [sales, machines, tokens]);

  // Data sales per mesin (Fitur 1) - Termasuk perhitungan Keuntungan Franchisee
  const salesByMachine = useMemo(() => {
    return sales.reduce((acc, sale) => {
      const machineName = machines.find(m => m.id === sale.machineId)?.name || 'Unknown Machine';
      if (!acc[machineName]) {
        acc[machineName] = { 
          totalRevenue: 0, 
          totalFranchiseeFee: 0, // Keuntungan Franchisee
          count: 0 
        };
      }
      acc[machineName].totalRevenue += sale.price;
      acc[machineName].totalFranchiseeFee += (sale.franchiseeFee || 0);
      acc[machineName].count += 1;
      return acc;
    }, {});
  }, [sales, machines]);


  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <Loader2 className="w-12 h-12 animate-spin" />
        <span className="ml-4 text-xl">Menghubungkan ke Server...</span>
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardView 
            stats={dashboardStats} 
            recentSales={sales.slice(0, 10)} 
            salesByMachine={salesByMachine}
            machines={machines} 
          />
        );
      case 'machines':
        return <MachinesView machines={machines} db={db} collectionPath={machinesColPath} />;
      case 'tokens':
        return <TokensView tokens={tokens} db={db} collectionPath={tokensColPath} />;
      case 'import':
        return <ImportView db={db} collectionPath={tokensColPath} />;
      default:
        return <DashboardView stats={dashboardStats} recentSales={sales} salesByMachine={salesByMachine} machines={machines} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-200">
      <Sidebar 
        view={view} 
        setView={setView} 
        userId={userId} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen}
      />
      
      <div className="flex-1 flex flex-col md:ml-64">
        <Header setIsSidebarOpen={setIsSidebarOpen} />
        
        <main className="flex-1 p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <span className="ml-3 text-lg">Memuat data...</span>
            </div>
          ) : (
            renderView()
          )}
        </main>
      </div>
    </div>
  );
}

// --- Komponen Navigasi ---
function Header({ setIsSidebarOpen }) {
  return (
    <header className="bg-white dark:bg-slate-800 shadow-sm p-4 flex justify-between items-center md:justify-end">
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className="md:hidden p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        <Menu className="w-6 h-6" />
      </button>
      <div className="flex items-center">
        {/* Bisa tambahkan info user di sini */}
        <span className="text-sm font-medium">Admin</span>
      </div>
    </header>
  );
}

function Sidebar({ view, setView, userId, isOpen, setIsOpen }) {
  const NavItem = ({ icon: Icon, text, active, onClick }) => (
    <button
      onClick={onClick}
      className={`
        flex items-center w-full px-4 py-3 rounded-lg transition-colors duration-200
        ${active
          ? 'bg-indigo-600 text-white shadow-lg'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        }
      `}
    >
      <Icon className="w-5 h-5 mr-3" />
      <span className="font-medium">{text}</span>
    </button>
  );

  const navigationItems = [
    { id: 'dashboard', text: 'Dashboard', icon: LayoutDashboard },
    { id: 'machines', text: 'Manajemen Mesin', icon: Wifi },
    { id: 'tokens', text: 'Manajemen Token', icon: Ticket },
    { id: 'import', text: 'Import Token', icon: Upload },
  ];
  
  const handleNavClick = (newView) => {
    setView(newView);
    setIsOpen(false); // Tutup sidebar di mobile setelah klik
  };

  return (
    <>
      {/* Overlay untuk mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
      
      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 w-64 bg-slate-800 text-white p-6
          flex flex-col z-20 transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="flex items-center mb-8">
          <Database className="w-8 h-8 text-indigo-400" />
          <h1 className="ml-2 text-2xl font-bold">Admin WiFi</h1>
        </div>
        
        <nav className="flex-1 space-y-2">
          {navigationItems.map(item => (
            <NavItem
              key={item.id}
              icon={item.icon}
              text={item.text}
              active={view === item.id}
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </nav>
        
        <div className="mt-auto">
          <p className="text-xs text-slate-400 mb-1">User ID (untuk sharing):</p>
          <p className="text-xs font-mono text-slate-300 break-all">{userId || 'Loading...'}</p>
        </div>
      </aside>
    </>
  );
}

// --- Komponen Tampilan (Views) ---

// 1. Dashboard
function DashboardView({ stats, recentSales, salesByMachine, machines }) {
  const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg flex items-center">
      <div className={`p-3 rounded-full ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="ml-4">
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h2>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard 
          title="Total Pemasukan" 
          value={formatCurrency(stats.totalRevenue)}
          icon={DollarSign}
          color="text-green-500"
        />
        {/* Card Total Keuntungan Franchisee */}
        <StatCard 
          title="Total Keuntungan Franchisee" 
          value={formatCurrency(stats.totalFranchiseeRevenue)}
          icon={Users}
          color="text-amber-500"
        />
        <StatCard 
          title="Total Penjualan" 
          value={`${stats.totalSales} Token`}
          icon={Ticket}
          color="text-indigo-500"
        />
        <StatCard 
          title="Token Tersedia" 
          value={stats.availableTokens}
          icon={FileText}
          color="text-blue-500"
        />
        <StatCard 
          title="Kertas Hampir Habis" 
          value={`${stats.lowPaperMachines} Mesin`}
          icon={AlertCircle}
          color="text-red-500"
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Laporan Keuntungan Franchisee per Mesin (Diperbarui) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Laporan Keuntungan Franchisee per Mesin</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Mesin</th>
                  <th className="text-right p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Jml Penjualan</th>
                  <th className="text-right p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Total Pemasukan</th>
                  <th className="text-right p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Keuntungan Franchisee</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(salesByMachine).length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-slate-500 dark:text-slate-400">
                      Belum ada data penjualan.
                    </td>
                  </tr>
                ) : (
                  Object.entries(salesByMachine).map(([machineName, data]) => (
                    <tr key={machineName} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium">{machineName}</td>
                      <td className="p-3 text-right text-sm">{data.count}</td>
                      <td className="p-3 text-right font-medium text-green-600 dark:text-green-400">{formatCurrency(data.totalRevenue)}</td>
                      <td className="p-3 text-right font-bold text-amber-600 dark:text-amber-400">{formatCurrency(data.totalFranchiseeFee)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Stok Token per Harga */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Stok Token Tersedia</h3>
          <div className="space-y-3">
             {Object.keys(stats.tokensByPrice).length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">Stok token kosong.</p>
            ) : (
              Object.entries(stats.tokensByPrice)
                .sort(([priceA], [priceB]) => parseInt(priceA) - parseInt(priceB))
                .map(([price, count]) => (
                  <div key={price} className="flex justify-between items-center">
                    <span className="font-medium">{formatCurrency(price)}</span>
                    <span className="text-sm font-semibold bg-indigo-100 dark:bg-indigo-700 text-indigo-700 dark:text-indigo-100 px-2 py-0.5 rounded-full">{count} pcs</span>
                  </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Penjualan Terakhir */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Aktivitas Penjualan Terakhir</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Waktu</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Mesin</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Token</th>
                <th className="text-right p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Harga</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-4 text-center text-slate-500 dark:text-slate-400">
                    Belum ada aktivitas penjualan.
                  </td>
                </tr>
              ) : (
                recentSales.map(sale => {
                  const machine = machines.find(m => m.id === sale.machineId);
                  return (
                    <tr key={sale.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 text-sm">{sale.timestamp ? new Date(sale.timestamp.toDate()).toLocaleString('id-ID') : 'N/A'}</td>
                      <td className="p-3 font-medium">{machine?.name || 'Loading...'}</td>
                      <td className="p-3 font-mono text-xs">{sale.tokenCode}</td>
                      <td className="p-3 text-right font-medium text-green-600 dark:text-green-400">{formatCurrency(sale.price)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 2. Manajemen Mesin (Fitur 2)
function MachinesView({ machines, db, collectionPath }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineLocation, setNewMachineLocation] = useState('');

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!newMachineName || !newMachineLocation) {
      // Mengganti alert() dengan pesan konsol atau modal custom jika diperlukan
      console.error("Nama dan Lokasi mesin tidak boleh kosong.");
      return;
    }
    
    try {
      await addDoc(collection(db, collectionPath), {
        name: newMachineName,
        location: newMachineLocation,
        paperLevel: 100, // Default 100%
        status: "offline",
        createdAt: serverTimestamp()
      });
      setNewMachineName('');
      setNewMachineLocation('');
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding machine: ", error);
      // Mengganti alert()
    }
  };

  const handleRefillPaper = async (id) => {
    try {
      const machineRef = doc(db, collectionPath, id);
      await updateDoc(machineRef, {
        paperLevel: 100
      });
    } catch (error) {
      console.error("Error refilling paper: ", error);
      // Mengganti alert()
    }
  };

  const getPaperStatusColor = (level) => {
    if (level < 20) return 'bg-red-500';
    if (level < 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Manajemen Mesin</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Tambah Mesin
        </button>
      </div>
      
      {/* FITUR 2: Status Kertas Thermal */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {machines.map(machine => (
          <div key={machine.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold">{machine.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{machine.location}</p>
              </div>
              <span 
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  machine.status === 'online' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                }`}
              >
                {machine.status}
              </span>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Sisa Kertas Thermal</label>
              <div className="flex items-center mt-2">
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${getPaperStatusColor(machine.paperLevel)}`} 
                    style={{ width: `${machine.paperLevel}%` }}
                  ></div>
                </div>
                {/* BARIS YANG DIPERBAIKI: Menghapus kurung kurawal ganda */}
                <span className="text-sm font-semibold ml-3 w-12 text-right">{machine.paperLevel}%</span>
              </div>
            </div>
            
            <button
              onClick={() => handleRefillPaper(machine.id)}
              disabled={machine.paperLevel === 100}
              className="w-full flex items-center justify-center bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
            >
              <Printer className="w-5 h-5 mr-2" />
              Refill Kertas
            </button>
          </div>
        ))}
      </div>
      
      {/* Modal Tambah Mesin */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Tambah Mesin Baru">
          <form onSubmit={handleAddMachine} className="space-y-4">
            <div>
              <label htmlFor="machineName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nama Mesin</label>
              <input
                type="text"
                id="machineName"
                value={newMachineName}
                onChange={(e) => setNewMachineName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="cth: Lobby Gedung A"
              />
            </div>
            <div>
              <label htmlFor="machineLocation" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Lokasi</label>
              <input
                type="text"
                id="machineLocation"
                value={newMachineLocation}
                onChange={(e) => setNewMachineLocation(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="cth: Jl. Merdeka No. 10"
              />
            </div>
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-lg mr-3 hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                Batal
              </button>
              <button
                type="submit"
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// 3. Manajemen Token (Fitur 4)
function TokensView({ tokens, db, collectionPath }) {
  const [filter, setFilter] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(null); // Berisi token ID

  const filteredTokens = useMemo(() => {
    return tokens.filter(token => 
      token.code.toLowerCase().includes(filter.toLowerCase()) ||
      token.plan.toLowerCase().includes(filter.toLowerCase())
    );
  }, [tokens, filter]);
  
  const handleDeleteToken = async () => {
    if (!showDeleteModal) return;
    
    try {
      const tokenRef = doc(db, collectionPath, showDeleteModal);
      await deleteDoc(tokenRef);
      setShowDeleteModal(null);
    } catch (error) {
      console.error("Error deleting token: ", error);
      // Mengganti alert()
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Manajemen Token (Belum Terjual)</h2>
      
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Cari kode token atau paket..."
        className="w-full max-w-md px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      
      {/* FITUR 4: Hapus Token */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Kode Token</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Paket</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Harga Jual</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Keuntungan</th> {/* Ditambahkan */}
                <th className="text-left p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Tgl Import</th>
                <th className="text-right p-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredTokens.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-slate-500 dark:text-slate-400">
                    Tidak ada token yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredTokens.map(token => (
                  <tr key={token.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-3 font-mono text-sm">{token.code}</td>
                    <td className="p-3 text-sm">{token.plan}</td>
                    <td className="p-3 text-sm font-medium">{formatCurrency(token.price)}</td>
                    <td className="p-3 text-sm font-medium text-amber-600 dark:text-amber-400">{formatCurrency(token.franchiseeFee || 0)}</td>
                    <td className="p-3 text-sm">{token.importedAt ? new Date(token.importedAt.toDate()).toLocaleDateString('id-ID') : 'N/A'}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setShowDeleteModal(token.id)}
                        className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"
                        title="Hapus token"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Modal Konfirmasi Hapus */}
      {showDeleteModal && (
        <Modal onClose={() => setShowDeleteModal(null)} title="Konfirmasi Hapus Token">
          <p className="text-slate-600 dark:text-slate-300">
            Apakah Anda yakin ingin menghapus token <strong>{showDeleteModal}</strong>? Token yang sudah dihapus tidak dapat dikembalikan.
          </p>
          <div className="flex justify-end pt-6 space-x-3">
            <button
              type="button"
              onClick={() => setShowDeleteModal(null)}
              className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-lg mr-3 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Batal
            </button>
            <button
              onClick={handleDeleteToken}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              Ya, Hapus
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// 4. Import Token (Fitur 3)
function ImportView({ db, collectionPath }) {
  const [file, setFile] = useState(null);
  const [selectedPrice, setSelectedPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '...' }
  const [importedCount, setImportedCount] = useState(0);

  const priceOptions = [
    { value: 2000, label: "Rp 2.000" },
    { value: 5000, label: "Rp 5.000" },
    { value: 10000, label: "Rp 10.000" },
    { value: 20000, label: "Rp 20.000" },
    { value: 50000, label: "Rp 50.000" },
    { value: 100000, label: "Rp 100.000" },
  ];

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage(null);
    setImportedCount(0);
  };
  
  const handleImport = () => {
    if (!file || !selectedPrice) {
      setMessage({ type: 'error', text: 'Harap pilih file CSV dan tentukan harga jual.' });
      return;
    }
    
    setIsLoading(true);
    setMessage(null);
    setImportedCount(0);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        
        if (lines.length <= 1) {
          throw new Error("File CSV kosong atau tidak valid.");
        }
        
        const headerLine = lines[0].trim();
        const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
        
        const loginIndex = headers.indexOf('Login');
        const planIndex = headers.indexOf('Plan');
        const costPriceIndex = headers.indexOf('Price'); // Harga Modal dari CSV
        const sellerFeeIndex = headers.indexOf('SellerFee'); // Keuntungan Franchisee dari CSV
        
        if (loginIndex === -1) {
          throw new Error("Kolom 'Login' (untuk kode token) tidak ditemukan di file CSV.");
        }
        if (sellerFeeIndex === -1) {
          throw new Error("Kolom 'SellerFee' (untuk keuntungan franchisee) tidak ditemukan di file CSV.");
        }
        if (costPriceIndex === -1) {
          throw new Error("Kolom 'Price' (untuk harga modal) tidak ditemukan di file CSV.");
        }
        
        const tokensToUpload = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Parsing CSV sederhana, mungkin perlu disesuaikan jika ada koma di dalam tanda kutip
          const cols = line.split(','); 
          
          const code = cols[loginIndex]?.trim().replace(/"/g, '');
          const plan = planIndex !== -1 ? cols[planIndex]?.trim().replace(/"/g, '') : 'Paket Default';
          const costPrice = cols[costPriceIndex]?.trim().replace(/"/g, '');
          const sellerFee = cols[sellerFeeIndex]?.trim().replace(/"/g, '');
          
          if (code) {
            tokensToUpload.push({
              code,
              plan,
              price: parseInt(selectedPrice, 10), // Harga Jual dari UI
              costPrice: costPrice ? parseInt(costPrice, 10) : 0, // Harga Modal dari CSV
              franchiseeFee: sellerFee ? parseInt(sellerFee, 10) : 0, // Keuntungan Franchisee dari CSV
              isSold: false,
              machineId: null,
              importedAt: serverTimestamp()
            });
          }
        }
        
        if (tokensToUpload.length === 0) {
          throw new Error("Tidak ada token valid yang ditemukan di dalam file.");
        }
        
        // Gunakan Batch Write untuk efisiensi
        const batch = writeBatch(db);
        tokensToUpload.forEach(token => {
          // Gunakan kode token sebagai ID dokumen untuk mencegah duplikat
          const tokenRef = doc(db, collectionPath, token.code); 
          batch.set(tokenRef, token);
        });
        
        await batch.commit();
        
        setImportedCount(tokensToUpload.length);
        setMessage({ type: 'success', text: `Berhasil mengimpor ${tokensToUpload.length} token.` });
        setFile(null);
        setSelectedPrice('');
        
      } catch (error) {
        console.error("Error importing CSV: ", error);
        setMessage({ type: 'error', text: `Gagal impor: ${error.message}` });
      } finally {
        setIsLoading(false);
      }
    };
    
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Import Token (CSV)</h2>
      
      <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-lg space-y-6">
        <p className="text-slate-600 dark:text-slate-300">
          Fitur ini akan mengimpor token dari file CSV. Sistem akan menggunakan kolom <strong className="font-mono">"Login"</strong> sebagai kode token unik. Pastikan CSV Anda memiliki kolom <strong className="font-mono">"Price"</strong> (Harga Modal) dan <strong className="font-mono">"SellerFee"</strong> (Keuntungan Franchisee).
        </p>

        {/* FITUR 3: Import CSV */}
        <div className="space-y-4">
          {/* Pilih Harga Jual */}
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              1. Tentukan Harga Jual Token
            </label>
            <select
              id="price"
              value={selectedPrice}
              onChange={(e) => setSelectedPrice(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="" disabled>-- Pilih harga jual --</option>
              {priceOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          
          {/* Upload File */}
          <div>
            <label htmlFor="csvFile" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              2. Pilih File CSV
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <FileText className="mx-auto h-12 w-12 text-slate-400" />
                <div className="flex text-sm text-slate-600 dark:text-slate-300">
                  <label 
                    htmlFor="file-upload" 
                    className="relative cursor-pointer bg-white dark:bg-slate-800 rounded-md font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                  >
                    <span>Upload file</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv" onChange={handleFileChange} />
                  </label>
                  <p className="pl-1">atau drag and drop</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {file ? file.name : 'CSV (maks. 5MB)'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tombol Import */}
        <button
          onClick={handleImport}
          disabled={isLoading || !file || !selectedPrice}
          className="w-full flex items-center justify-center bg-indigo-600 text-white px-6 py-3 rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Upload className="w-5 h-5 mr-2" />
          )}
          {isLoading ? 'Mengimpor...' : 'Mulai Import'}
        </button>
        
        {/* Pesan Status */}
        {message && (
          <div 
            className={`p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200'
            }`}
          >
            <p className="font-medium">{message.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}


// --- Komponen Utility ---

// Modal Sederhana
function Modal({ children, onClose, title }) {
  // Efek untuk mencegah scroll body saat modal terbuka
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 w-full max-w-md rounded-xl shadow-2xl p-6 relative"
        onClick={(e) => e.stopPropagation()} // Mencegah klik di dalam modal menutup modal
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div>
          {children}
        </div>
      </div>
    </div>
  );
}
