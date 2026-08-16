import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Trash2, BarChart3, Clock, DollarSign, Gamepad2, X, Edit2, Bell, Calendar, TrendingUp, Volume2, VolumeX, Zap, Activity, Tv, Power, Settings, Wifi, WifiOff, AlertCircle } from 'lucide-react';

const storage = {
  get: (key) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  },
};

// ==================== TUYA API CLIENT ====================
async function tuyaControl(deviceId, action) {
  try {
    const res = await fetch('/api/tuya', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, action }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('Tuya API error:', e);
    return false;
  }
}

export default function PlayStationClub() {
  const [view, setView] = useState('devices');
  const [devices, setDevices] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddTariff, setShowAddTariff] = useState(false);
  const [showTimerSetup, setShowTimerSetup] = useState(null);
  const [showCompleteSession, setShowCompleteSession] = useState(null);
  const [editingTariff, setEditingTariff] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [notifPermission, setNotifPermission] = useState('default');
  const [, forceUpdate] = useState(0);

  // Load data from localStorage
  useEffect(() => {
    const sd = storage.get('ps_devices');
    if (sd && Array.isArray(sd) && sd.length > 0) {
      // Add tuyaDeviceId field if missing (migration)
      setDevices(sd.map(d => ({ tuyaDeviceId: '', tvAutoControl: true, ...d })));
    } else {
      const initial = Array.from({length: 6}, (_, i) => ({
        id: `dev_${Date.now()}_${i}`, name: `PS ${i+1}`,
        running: false, startTime: null, tariffId: null,
        scheduledMinutes: null, alerted: false,
        tuyaDeviceId: '', tvAutoControl: true,
      }));
      setDevices(initial);
      storage.set('ps_devices', initial);
    }

    const st = storage.get('ps_tariffs');
    if (st && Array.isArray(st) && st.length > 0) {
      setTariffs(st);
    } else {
      const initial = [
        { id: 't1', name: 'Oddiy', pricePerHour: 20000 },
        { id: 't2', name: 'Premium', pricePerHour: 30000 },
      ];
      setTariffs(initial);
      storage.set('ps_tariffs', initial);
    }

    const ss = storage.get('ps_sessions');
    if (ss && Array.isArray(ss)) setSessions(ss);

    // Check notification permission
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
    setLoaded(true);
  }, []);

  const saveDevices = (n) => { setDevices(n); storage.set('ps_devices', n); };
  const saveTariffs = (n) => { setTariffs(n); storage.set('ps_tariffs', n); };
  const saveSessions = (n) => { setSessions(n); storage.set('ps_sessions', n); };

  // Request notification permission
  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Bu brauzer notifikatsiyalarni qo\'llab-quvvatlamaydi');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
  };

  const showNotification = (title, body) => {
    if (notifPermission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'ps-klub-alarm',
        requireInteraction: true,
      });
      // Vibrate if supported
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    } catch (e) { console.error(e); }
  };

  // Ticker - check every second for expired timers
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(n => n+1);
      devices.forEach(d => {
        if (d.running && d.scheduledMinutes && !d.alerted) {
          const elapsedMs = Date.now() - d.startTime;
          const targetMs = d.scheduledMinutes * 60 * 1000;
          if (elapsedMs >= targetMs) triggerAlarm(d);
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [devices]);

  const triggerAlarm = async (device) => {
    const updated = devices.map(d => d.id === device.id ? {...d, alerted: true} : d);
    setDevices(updated);
    storage.set('ps_devices', updated);

    // Desktop notification
    showNotification(
      `⏰ ${device.name} vaqti tugadi!`,
      `${device.name} sessiyasi yakunlandi. Iltimos, hisobni tayyorlang.`
    );

    // Auto turn off TV if enabled
    if (device.tvAutoControl && device.tuyaDeviceId) {
      await tuyaControl(device.tuyaDeviceId, 'off');
    }

    // Vibrate
    try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch(e) {}
  };

  const startDevice = async (deviceId, tariffId, minutes = null) => {
    const device = devices.find(d => d.id === deviceId);
    const updated = devices.map(d => d.id === deviceId ? {
      ...d, running: true, startTime: Date.now(), tariffId,
      scheduledMinutes: minutes, alerted: false,
    } : d);
    saveDevices(updated);

    // Auto turn on TV
    if (device.tvAutoControl && device.tuyaDeviceId) {
      await tuyaControl(device.tuyaDeviceId, 'on');
    }
  };

  const stopDevice = async (deviceId) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.running) return;
    const tariff = tariffs.find(t => t.id === device.tariffId);
    if (!tariff) return;

    const elapsedMs = Date.now() - device.startTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const amount = Math.round(elapsedHours * tariff.pricePerHour);

    const session = {
      id: `s_${Date.now()}`, deviceId, deviceName: device.name,
      tariffName: tariff.name, pricePerHour: tariff.pricePerHour,
      startTime: device.startTime, endTime: Date.now(),
      durationMs: elapsedMs, amount,
    };
    saveSessions([session, ...sessions]);

    const updated = devices.map(d => d.id === deviceId ? {
      ...d, running: false, startTime: null, tariffId: null,
      scheduledMinutes: null, alerted: false,
    } : d);
    saveDevices(updated);

    // Auto turn off TV
    if (device.tvAutoControl && device.tuyaDeviceId) {
      await tuyaControl(device.tuyaDeviceId, 'off');
    }

    setShowCompleteSession(session);
  };

  // Manual TV control
  const toggleTV = async (device, on) => {
    if (!device.tuyaDeviceId) {
      alert('Bu qurilma uchun TV (Smart Plug) sozlanmagan. Sozlamalarga o\'ting.');
      return;
    }
    await tuyaControl(device.tuyaDeviceId, on ? 'on' : 'off');
  };

  const addDevice = (name) => {
    saveDevices([...devices, {
      id: `dev_${Date.now()}`, name, running: false, startTime: null,
      tariffId: null, scheduledMinutes: null, alerted: false,
      tuyaDeviceId: '', tvAutoControl: true,
    }]);
  };

  const removeDevice = (deviceId) => {
    if (!confirm('Bu qurilmani o\'chirmoqchimisiz?')) return;
    saveDevices(devices.filter(d => d.id !== deviceId));
  };

  const updateDevice = (id, updates) => {
    saveDevices(devices.map(d => d.id === id ? {...d, ...updates} : d));
  };

  const addTariff = (name, price) => {
    saveTariffs([...tariffs, { id: `t_${Date.now()}`, name, pricePerHour: price }]);
  };

  const updateTariff = (id, name, price) => {
    saveTariffs(tariffs.map(t => t.id === id ? {...t, name, pricePerHour: price} : t));
  };

  const removeTariff = (id) => {
    if (devices.some(d => d.running && d.tariffId === id)) {
      alert('Bu tarif hozir ishlatilmoqda. Avval qurilmani to\'xtating.');
      return;
    }
    if (!confirm('Bu tarifni o\'chirmoqchimisiz?')) return;
    saveTariffs(tariffs.filter(t => t.id !== id));
  };

  const formatMoney = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n)) + ' so\'m';
  const formatDuration = (ms) => {
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const getCurrentAmount = (d) => {
    if (!d.running) return 0;
    const t = tariffs.find(x => x.id === d.tariffId);
    if (!t) return 0;
    return Math.round(((Date.now() - d.startTime) / 3600000) * t.pricePerHour);
  };
  const getRemainingTime = (d) => {
    if (!d.running || !d.scheduledMinutes) return null;
    return d.scheduledMinutes * 60000 - (Date.now() - d.startTime);
  };
  const getProgress = (d) => {
    if (!d.running || !d.scheduledMinutes) return 0;
    return Math.min(100, ((Date.now() - d.startTime) / (d.scheduledMinutes * 60000)) * 100);
  };

  const calcStats = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sum = (arr) => arr.reduce((a,b) => a + b.amount, 0);
    return {
      today: { count: sessions.filter(s => s.endTime >= todayStart).length, total: sum(sessions.filter(s => s.endTime >= todayStart)) },
      week: { count: sessions.filter(s => s.endTime >= weekStart).length, total: sum(sessions.filter(s => s.endTime >= weekStart)) },
      month: { count: sessions.filter(s => s.endTime >= monthStart).length, total: sum(sessions.filter(s => s.endTime >= monthStart)) },
    };
  };

  const calcDeviceStats = (deviceId) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const ds = sessions.filter(s => s.deviceId === deviceId);
    const sum = (arr) => arr.reduce((a,b) => a + b.amount, 0);
    return {
      today: sum(ds.filter(s => s.endTime >= todayStart)),
      week: sum(ds.filter(s => s.endTime >= weekStart)),
      month: sum(ds.filter(s => s.endTime >= monthStart)),
    };
  };

  const stats = calcStats();
  const linkedDevices = devices.filter(d => d.tuyaDeviceId).length;

  if (!loaded) {
    return (
      <div style={{minHeight:'100vh', background:'#06080f', display:'flex', alignItems:'center', justifyContent:'center', color:'#a78bfa', fontFamily:'system-ui'}}>
        Yuklanmoqda...
      </div>
    );
  }

  return (
    <div className="ps-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { margin: 0; padding: 0; }
        body { background: #06080f; font-family: 'Sora', system-ui, sans-serif; }
        .ps-app {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.25), transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, rgba(168,85,247,0.18), transparent 70%),
            radial-gradient(ellipse 60% 40% at 20% 60%, rgba(34,197,94,0.08), transparent 60%),
            #06080f;
          color: #e4e4e7; padding-bottom: 100px; position: relative; overflow-x: hidden;
        }
        .ps-app::before {
          content: ''; position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0 0.7 0 0 0 0.025 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
          pointer-events: none; opacity: 0.6; z-index: 1;
        }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .glass {
          background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.05) inset, 0 20px 40px -20px rgba(0,0,0,0.4);
        }
        .glass-strong {
          background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.04) 100%);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(168,85,247,0.18);
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.06) inset, 0 0 60px -10px rgba(99,102,241,0.15);
        }
        .running {
          background: linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(16,185,129,0.04) 100%);
          border: 1px solid rgba(34,197,94,0.4);
          box-shadow: 0 0 50px -8px rgba(34,197,94,0.3), 0 0 0 1px rgba(34,197,94,0.15);
        }
        .alerted {
          background: linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.06) 100%);
          border: 1px solid rgba(239,68,68,0.6);
          animation: pulse-alert 0.8s ease-in-out infinite;
        }
        @keyframes pulse-alert {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5), 0 0 30px -5px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0), 0 0 60px -5px rgba(239,68,68,0.7); }
        }
        @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.3); } }
        .fade-up { animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        .fade-up-1 { animation-delay: 0.05s; } .fade-up-2 { animation-delay: 0.1s; }
        .fade-up-3 { animation-delay: 0.15s; } .fade-up-4 { animation-delay: 0.2s; }
        .fade-up-5 { animation-delay: 0.25s; } .fade-up-6 { animation-delay: 0.3s; }
        .shimmer-text {
          background: linear-gradient(90deg, #a78bfa 0%, #f0abfc 50%, #a78bfa 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .btn {
          border: none; font-family: inherit; font-weight: 600; cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: -0.01em;
        }
        .btn:active { transform: scale(0.97); }
        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          color: white;
          box-shadow: 0 8px 20px -6px rgba(99,102,241,0.5);
        }
        .btn-success { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; box-shadow: 0 8px 20px -6px rgba(34,197,94,0.5); }
        .btn-danger { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; box-shadow: 0 8px 20px -6px rgba(239,68,68,0.5); }
        .btn-ghost {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: #e4e4e7; backdrop-filter: blur(10px);
        }
        .btn-ghost:hover { background: rgba(255,255,255,0.08); border-color: rgba(168,85,247,0.4); }
        input, select {
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.1);
          color: #e4e4e7; font-family: inherit; outline: none;
          transition: all 0.2s;
        }
        input:focus, select:focus { border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168,85,247,0.15); }
        select option { background: #0f1322; color: #e4e4e7; }
        .nav-btn {
          flex: 1; background: transparent; border: none;
          color: #6b7280; padding: 10px 8px;
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          cursor: pointer; font-size: 11px; font-weight: 600; font-family: inherit;
          transition: color 0.2s; position: relative;
        }
        .nav-btn.active { color: #c4b5fd; }
        .nav-btn.active::before {
          content: ''; position: absolute; top: 0; left: 50%;
          transform: translateX(-50%); width: 30px; height: 3px;
          border-radius: 0 0 6px 6px;
          background: linear-gradient(90deg, #6366f1, #a855f7);
        }
        .device-card { position: relative; z-index: 2; border-radius: 24px; padding: 20px; transition: all 0.3s; }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: pulse-dot 1.5s ease-in-out infinite; }
        .stat-number { font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
        .bottom-nav {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: rgba(6,8,15,0.85);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          padding: 8px 8px max(16px, env(safe-area-inset-bottom));
          z-index: 50;
        }
        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px); display: flex; align-items: flex-end; justify-content: center;
          z-index: 100; animation: fade-in 0.2s ease;
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .modal-content {
          width: 100%; max-width: 500px;
          background: linear-gradient(180deg, #1a1330 0%, #0a0d1c 100%);
          border-top: 1px solid rgba(168,85,247,0.25);
          border-radius: 28px 28px 0 0;
          padding: 24px 20px max(24px, env(safe-area-inset-bottom));
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 -20px 60px -10px rgba(99,102,241,0.2);
          max-height: 85vh; overflow-y: auto;
        }
        .header {
          padding: 20px 16px 16px;
          position: sticky; top: 0; z-index: 20;
          background: linear-gradient(180deg, rgba(6,8,15,0.95) 0%, rgba(6,8,15,0.7) 80%, transparent 100%);
          backdrop-filter: blur(12px);
        }
        .logo-icon {
          width: 48px; height: 48px; border-radius: 14px;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 24px -4px rgba(99,102,241,0.5);
          position: relative;
        }
        .pill {
          font-size: 11px; font-weight: 600;
          padding: 6px 10px; border-radius: 100px;
          display: flex; align-items: center; gap: 5px;
        }
        .pill-ready { color: #86efac; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); }
        .pill-locked { color: #fcd34d; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); }
        .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #71717a; padding: 0 4px; }
        .tv-btn {
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.3);
          color: #c4b5fd;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex; align-items: center; gap: 6px;
          transition: all 0.2s;
          font-family: inherit;
        }
        .tv-btn:hover { background: rgba(99,102,241,0.2); }
        .tv-btn.on { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); color: #86efac; }
      `}</style>

      <div className="header">
        <div style={{display:'flex', alignItems:'center', gap:'14px'}}>
          <div className="logo-icon fade-up"><Gamepad2 size={26} color="white" strokeWidth={2.2}/></div>
          <div style={{flex: 1}} className="fade-up fade-up-1">
            <div style={{fontSize:'22px', fontWeight:700, letterSpacing:'-0.03em', lineHeight: 1}}>PS Klub</div>
            <div style={{fontSize:'12px', color:'#71717a', marginTop:'4px', fontWeight: 500}}>
              {view === 'devices' && 'Qurilmalar boshqaruvi'}
              {view === 'tariffs' && 'Tariflar ro\'yxati'}
              {view === 'stats' && 'Daromad statistikasi'}
              {view === 'settings' && 'Sozlamalar'}
            </div>
          </div>
          {notifPermission === 'granted' ? (
            <div className="pill pill-ready fade-up fade-up-2">
              <Bell size={12}/> Xabar
            </div>
          ) : (
            <button onClick={requestNotifications} className="pill pill-locked fade-up fade-up-2" style={{border:'1px solid rgba(251,191,36,0.3)', cursor:'pointer', fontFamily:'inherit'}}>
              <Bell size={12}/> Xabar yoqish
            </button>
          )}
        </div>
      </div>

      <div style={{padding: '0 16px', position: 'relative', zIndex: 2}}>
        {view === 'devices' && (
          <>
            <div className="glass-strong fade-up fade-up-1" style={{borderRadius:'20px', padding:'20px', marginBottom:'20px', position:'relative', overflow:'hidden'}}>
              <div style={{position:'absolute', top:0, right:0, width:'120px', height:'120px', background:'radial-gradient(circle, rgba(168,85,247,0.3), transparent 70%)', pointerEvents:'none'}}/>
              <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom: '4px'}}>
                <Activity size={14} color="#a78bfa"/>
                <div className="label" style={{padding: 0}}>Bugungi daromad</div>
              </div>
              <div className="stat-number shimmer-text" style={{fontSize:'34px', fontWeight:800, marginTop:'2px', lineHeight: 1.1}}>
                {formatMoney(stats.today.total)}
              </div>
              <div style={{marginTop:'14px', paddingTop:'14px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{display:'flex', alignItems:'center', gap: '6px'}}>
                  <Zap size={14} color="#86efac"/>
                  <span style={{fontSize:'13px', color:'#a1a1aa', fontWeight: 500}}>
                    {devices.filter(d => d.running).length} faol · {linkedDevices}/{devices.length} TV bog'langan
                  </span>
                </div>
                <div style={{fontSize:'12px', color:'#71717a', fontWeight: 600}}>
                  {stats.today.count} sessiya
                </div>
              </div>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:'12px'}}>
              {devices.map((device, idx) => {
                const tariff = tariffs.find(t => t.id === device.tariffId);
                const remaining = getRemainingTime(device);
                const isAlerted = device.alerted;
                const elapsedMs = device.running ? Date.now() - device.startTime : 0;
                const progress = getProgress(device);
                const cls = isAlerted ? 'alerted' : (device.running ? 'running' : 'glass');
                const delayClass = `fade-up-${Math.min(idx + 2, 6)}`;
                const hasTV = !!device.tuyaDeviceId;

                return (
                  <div key={device.id} className={`device-card ${cls} fade-up ${delayClass}`}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'14px'}}>
                      <div>
                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                          {device.running ? <div className="live-dot"/> : <div style={{width:'8px', height:'8px', borderRadius:'50%', background: '#3f3f46'}}/>}
                          <div style={{fontSize:'18px', fontWeight:700, letterSpacing: '-0.02em'}}>{device.name}</div>
                          {hasTV ? (
                            <div title="TV bog'langan" style={{display:'flex', alignItems:'center', gap:'3px', fontSize:'10px', color:'#86efac', background:'rgba(34,197,94,0.1)', padding:'2px 6px', borderRadius:'6px'}}>
                              <Wifi size={10}/> TV
                            </div>
                          ) : (
                            <div title="TV bog'lanmagan" style={{display:'flex', alignItems:'center', gap:'3px', fontSize:'10px', color:'#71717a', background:'rgba(255,255,255,0.03)', padding:'2px 6px', borderRadius:'6px'}}>
                              <WifiOff size={10}/>
                            </div>
                          )}
                        </div>
                        {device.running && tariff && (
                          <div style={{fontSize:'12px', color:'#a1a1aa', marginTop:'6px', display:'flex', alignItems:'center', gap:'6px'}}>
                            <span style={{padding:'2px 8px', background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.25)', borderRadius:'6px', color:'#c4b5fd', fontWeight: 600}}>{tariff.name}</span>
                            <span>{formatMoney(tariff.pricePerHour)}/soat</span>
                          </div>
                        )}
                        {!device.running && <div style={{fontSize:'12px', color:'#52525b', marginTop:'6px', fontWeight: 500}}>Bo'sh holat</div>}
                      </div>
                      <div style={{display:'flex', gap:'6px'}}>
                        {!device.running && (
                          <>
                            <button onClick={() => setEditingDevice(device)} style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#71717a', cursor:'pointer', padding:'8px', borderRadius: '10px'}}>
                              <Settings size={14}/>
                            </button>
                            <button onClick={() => removeDevice(device.id)} style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#71717a', cursor:'pointer', padding:'8px', borderRadius: '10px'}}>
                              <Trash2 size={14}/>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {device.running && (
                      <>
                        <div style={{background:'rgba(0,0,0,0.4)', borderRadius:'16px', padding:'18px 16px', marginBottom:'14px', textAlign:'center', border: '1px solid rgba(255,255,255,0.04)', position:'relative', overflow:'hidden'}}>
                          {device.scheduledMinutes && (
                            <div style={{position:'absolute', top:0, left:0, right:0, height:'3px', background:'rgba(255,255,255,0.06)'}}>
                              <div style={{height:'100%', width:`${progress}%`, background: isAlerted ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #6366f1, #a855f7)', transition:'width 0.3s'}}/>
                            </div>
                          )}
                          <div style={{fontSize:'10px', color:'#71717a', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:'6px', fontWeight: 700}}>
                            {isAlerted ? '⏰ VAQT TUGADI!' : 'O\'tgan vaqt'}
                          </div>
                          <div className="mono stat-number" style={{fontSize:'32px', fontWeight:700, color: isAlerted ? '#fca5a5' : '#a7f3d0', letterSpacing:'-0.03em'}}>
                            {formatDuration(elapsedMs)}
                          </div>
                          {remaining !== null && !isAlerted && (
                            <div style={{fontSize:'12px', color:'#c4b5fd', marginTop:'4px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace'}}>
                              Qolgan: {formatDuration(Math.max(0, remaining))}
                            </div>
                          )}
                          <div style={{marginTop:'14px', paddingTop:'14px', borderTop:'1px dashed rgba(255,255,255,0.08)'}}>
                            <div style={{fontSize:'11px', color:'#71717a', fontWeight: 600}}>JORIY SUMMA</div>
                            <div className="stat-number" style={{fontSize:'24px', fontWeight:800, color:'#fff', marginTop:'2px'}}>
                              {formatMoney(getCurrentAmount(device))}
                            </div>
                          </div>
                        </div>
                        <div style={{display:'flex', gap:'8px'}}>
                          <button onClick={() => stopDevice(device.id)} className="btn btn-danger" style={{flex:1, padding:'14px', borderRadius:'14px', fontSize:'15px'}}>
                            <Square size={16} fill="white"/> Yopish
                          </button>
                          {hasTV && (
                            <button onClick={() => toggleTV(device, false)} className="tv-btn" title="TV ni qo'lda o'chirish" style={{padding:'0 14px', borderRadius:'14px'}}>
                              <Power size={16}/>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {!device.running && (
                      <>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom: hasTV ? '8px' : 0}}>
                          <button onClick={() => { if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; } startDevice(device.id, tariffs[0].id); }} className="btn btn-success" style={{padding:'13px', borderRadius:'13px', fontSize:'14px'}}>
                            <Play size={15} fill="white"/> Ochish
                          </button>
                          <button onClick={() => { if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; } setShowTimerSetup(device.id); }} className="btn btn-primary" style={{padding:'13px', borderRadius:'13px', fontSize:'14px'}}>
                            <Clock size={15}/> Vaqt qo'y
                          </button>
                        </div>
                        {hasTV && (
                          <div style={{display:'flex', gap:'6px'}}>
                            <button onClick={() => toggleTV(device, true)} className="tv-btn" style={{flex:1, justifyContent:'center'}}>
                              <Tv size={13}/> TV ON
                            </button>
                            <button onClick={() => toggleTV(device, false)} className="tv-btn" style={{flex:1, justifyContent:'center'}}>
                              <Power size={13}/> TV OFF
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => setShowAddDevice(true)} className="btn btn-ghost fade-up fade-up-6" style={{width:'100%', padding:'14px', borderRadius:'14px', marginTop:'14px', fontSize:'14px'}}>
              <Plus size={16}/> Yangi qurilma qo'shish
            </button>
          </>
        )}

        {view === 'tariffs' && (
          <div>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              {tariffs.map((t, idx) => (
                <div key={t.id} className={`glass fade-up fade-up-${Math.min(idx + 1, 6)}`} style={{borderRadius:'18px', padding:'18px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:'17px', fontWeight:700, letterSpacing: '-0.02em'}}>{t.name}</div>
                    <div style={{fontSize:'14px', color:'#c4b5fd', fontWeight:600, marginTop:'4px'}}>
                      {formatMoney(t.pricePerHour)}<span style={{color:'#71717a', fontWeight: 500}}> / soat</span>
                    </div>
                  </div>
                  <div style={{display:'flex', gap:'8px'}}>
                    <button onClick={() => setEditingTariff(t)} className="btn btn-ghost" style={{padding:'10px', borderRadius:'12px'}}><Edit2 size={15}/></button>
                    <button onClick={() => removeTariff(t.id)} style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#fca5a5', padding:'10px', borderRadius:'12px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                      <Trash2 size={15}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAddTariff(true)} className="btn btn-primary" style={{width:'100%', padding:'14px', borderRadius:'14px', marginTop:'14px', fontSize:'14px'}}>
              <Plus size={16}/> Yangi tarif qo'shish
            </button>
          </div>
        )}

        {view === 'stats' && (
          <div>
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom:'24px'}}>
              {[
                {label:'Bugun', icon: Calendar, data: stats.today, color:'#22c55e', accent: 'rgba(34,197,94,0.15)'},
                {label:'Haftalik', icon: TrendingUp, data: stats.week, color:'#a855f7', accent: 'rgba(168,85,247,0.15)'},
                {label:'Oylik', icon: BarChart3, data: stats.month, color:'#6366f1', accent: 'rgba(99,102,241,0.15)'},
              ].map((p, i) => {
                const Icon = p.icon;
                return (
                  <div key={i} className={`glass fade-up fade-up-${i+1}`} style={{borderRadius:'20px', padding:'20px', position:'relative', overflow:'hidden'}}>
                    <div style={{position:'absolute', top:'-30px', right:'-30px', width:'120px', height:'120px', background:`radial-gradient(circle, ${p.accent}, transparent 70%)`}}/>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <div style={{width:'32px', height:'32px', borderRadius:'10px', background: p.accent, border: `1px solid ${p.color}40`, display:'flex', alignItems:'center', justifyContent:'center'}}>
                          <Icon size={16} color={p.color}/>
                        </div>
                        <div style={{fontSize:'14px', color:'#d4d4d8', fontWeight:600}}>{p.label}</div>
                      </div>
                      <div style={{fontSize:'11px', color:'#71717a', background:'rgba(255,255,255,0.04)', padding:'4px 10px', borderRadius:'100px', fontWeight: 600}}>
                        {p.data.count} sessiya
                      </div>
                    </div>
                    <div className="stat-number" style={{fontSize:'30px', fontWeight:800, color: p.color, letterSpacing:'-0.03em', lineHeight: 1.1}}>
                      {formatMoney(p.data.total)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="label" style={{marginBottom:'12px'}}>QURILMALAR BO'YICHA</div>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              {devices.map((d) => {
                const dStats = calcDeviceStats(d.id);
                return (
                  <div key={d.id} className="glass" style={{borderRadius:'16px', padding:'16px'}}>
                    <div style={{fontSize:'15px', fontWeight:700, marginBottom:'12px', letterSpacing: '-0.02em'}}>{d.name}</div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px'}}>
                      {[
                        {label: 'Kunlik', val: dStats.today, color: '#22c55e'},
                        {label: 'Haftalik', val: dStats.week, color: '#a855f7'},
                        {label: 'Oylik', val: dStats.month, color: '#6366f1'},
                      ].map((s, i) => (
                        <div key={i} style={{padding:'10px', background:'rgba(0,0,0,0.3)', borderRadius:'10px', border:'1px solid rgba(255,255,255,0.04)'}}>
                          <div style={{fontSize:'10px', color:'#71717a', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight: 700}}>{s.label}</div>
                          <div className="stat-number" style={{fontSize:'13px', fontWeight:700, color: s.color, marginTop:'4px'}}>
                            {formatMoney(s.val)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {sessions.length > 0 && (
              <>
                <div className="label" style={{marginTop:'28px', marginBottom:'12px'}}>SO'NGGI SESSIYALAR</div>
                <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                  {sessions.slice(0, 10).map(s => (
                    <div key={s.id} className="glass" style={{borderRadius:'14px', padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div>
                        <div style={{fontSize:'14px', fontWeight:700}}>{s.deviceName}</div>
                        <div style={{fontSize:'11px', color:'#71717a', marginTop:'3px', fontWeight: 500}}>
                          {new Date(s.endTime).toLocaleString('uz-UZ', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}{' · '}{formatDuration(s.durationMs)}
                        </div>
                      </div>
                      <div className="stat-number" style={{fontSize:'15px', fontWeight:800, color:'#86efac'}}>
                        {formatMoney(s.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'settings' && (
          <div>
            <div className="glass fade-up" style={{borderRadius:'18px', padding:'18px', marginBottom:'16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px'}}>
                <Bell size={18} color="#a78bfa"/>
                <div style={{fontSize:'15px', fontWeight:700}}>Kompyuter xabarnomalari</div>
              </div>
              <div style={{fontSize:'13px', color:'#a1a1aa', marginBottom:'12px', lineHeight: 1.5}}>
                Vaqt tugaganda Windows notifikatsiyasi chiqadi (ilova yopiq bo'lsa ham).
              </div>
              {notifPermission === 'granted' ? (
                <div style={{padding:'10px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:'10px', color:'#86efac', fontSize:'13px', fontWeight:600, textAlign:'center'}}>
                  ✓ Xabarnomalar yoqilgan
                </div>
              ) : (
                <button onClick={requestNotifications} className="btn btn-primary" style={{width:'100%', padding:'12px', borderRadius:'12px', fontSize:'14px'}}>
                  <Bell size={15}/> Xabarnomalarni yoqish
                </button>
              )}
            </div>

            <div className="label" style={{marginBottom:'12px'}}>QURILMALAR VA TV BOG'LANISHI</div>
            <div style={{fontSize:'12px', color:'#71717a', marginBottom:'14px', padding:'0 4px', lineHeight: 1.5}}>
              Har bir PS qurilmasi uchun Tuya Smart Plug Device ID kiriting. Vaqt boshlanganda TV avtomatik yoqiladi, tugaganda o'chadi.
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              {devices.map((d) => (
                <div key={d.id} className="glass" style={{borderRadius:'14px', padding:'14px'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                    <div style={{fontSize:'14px', fontWeight:700}}>{d.name}</div>
                    {d.tuyaDeviceId ? (
                      <div style={{fontSize:'10px', color:'#86efac', background:'rgba(34,197,94,0.1)', padding:'3px 8px', borderRadius:'6px', fontWeight:600}}>✓ Ulangan</div>
                    ) : (
                      <div style={{fontSize:'10px', color:'#fcd34d', background:'rgba(251,191,36,0.1)', padding:'3px 8px', borderRadius:'6px', fontWeight:600}}>Sozlanmagan</div>
                    )}
                  </div>
                  <button onClick={() => setEditingDevice(d)} className="btn btn-ghost" style={{width:'100%', padding:'10px', borderRadius:'10px', fontSize:'13px'}}>
                    <Settings size={13}/> Sozlash
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bottom-nav">
        <button onClick={() => setView('devices')} className={`nav-btn ${view==='devices'?'active':''}`}>
          <Gamepad2 size={22} strokeWidth={view==='devices' ? 2.5 : 2}/>
          <span>Qurilmalar</span>
        </button>
        <button onClick={() => setView('tariffs')} className={`nav-btn ${view==='tariffs'?'active':''}`}>
          <DollarSign size={22} strokeWidth={view==='tariffs' ? 2.5 : 2}/>
          <span>Tariflar</span>
        </button>
        <button onClick={() => setView('stats')} className={`nav-btn ${view==='stats'?'active':''}`}>
          <BarChart3 size={22} strokeWidth={view==='stats' ? 2.5 : 2}/>
          <span>Statistika</span>
        </button>
        <button onClick={() => setView('settings')} className={`nav-btn ${view==='settings'?'active':''}`}>
          <Settings size={22} strokeWidth={view==='settings' ? 2.5 : 2}/>
          <span>Sozlamalar</span>
        </button>
      </div>

      {showAddDevice && <Modal onClose={() => setShowAddDevice(false)} title="Yangi qurilma"><AddDeviceForm onAdd={(name) => { addDevice(name); setShowAddDevice(false); }}/></Modal>}
      {showAddTariff && <Modal onClose={() => setShowAddTariff(false)} title="Yangi tarif"><TariffForm onSave={(name, price) => { addTariff(name, price); setShowAddTariff(false); }}/></Modal>}
      {editingTariff && <Modal onClose={() => setEditingTariff(null)} title="Tarifni tahrirlash"><TariffForm initial={editingTariff} onSave={(name, price) => { updateTariff(editingTariff.id, name, price); setEditingTariff(null); }}/></Modal>}
      {showTimerSetup && <Modal onClose={() => setShowTimerSetup(null)} title="Vaqt belgilash"><TimerSetupForm tariffs={tariffs} onStart={(tariffId, minutes) => { startDevice(showTimerSetup, tariffId, minutes); setShowTimerSetup(null); }}/></Modal>}
      {editingDevice && <Modal onClose={() => setEditingDevice(null)} title={`${editingDevice.name} sozlamalari`}><DeviceSettingsForm device={editingDevice} onSave={(updates) => { updateDevice(editingDevice.id, updates); setEditingDevice(null); }}/></Modal>}

      {showCompleteSession && (
        <Modal onClose={() => setShowCompleteSession(null)} title="✓ Sessiya yakunlandi">
          <div style={{textAlign:'center', padding:'10px 0'}}>
            <div style={{fontSize:'14px', color:'#a1a1aa', marginBottom:'4px', fontWeight: 500}}>
              {showCompleteSession.deviceName} · {showCompleteSession.tariffName}
            </div>
            <div className="mono" style={{fontSize:'14px', color:'#c4b5fd', marginBottom:'20px', fontWeight: 600}}>
              {formatDuration(showCompleteSession.durationMs)}
            </div>
            <div style={{background:'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.06))', border:'1px solid rgba(34,197,94,0.3)', borderRadius:'20px', padding:'28px 20px', marginBottom:'20px'}}>
              <div style={{fontSize:'11px', color:'#86efac', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'8px', fontWeight: 700}}>Jami summa</div>
              <div className="stat-number" style={{fontSize:'40px', fontWeight:800, color:'#86efac'}}>
                {formatMoney(showCompleteSession.amount)}
              </div>
            </div>
            <button onClick={() => setShowCompleteSession(null)} className="btn btn-primary" style={{width:'100%', padding:'14px', borderRadius:'14px', fontSize:'15px'}}>Yopish</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{width:'40px', height:'4px', background:'rgba(255,255,255,0.15)', borderRadius:'100px', margin:'0 auto 16px'}}/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px'}}>
          <div style={{fontSize:'19px', fontWeight:700, letterSpacing: '-0.02em'}}>{title}</div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', width:'32px', height:'32px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#a1a1aa'}}>
            <X size={16}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddDeviceForm({ onAdd }) {
  const [name, setName] = useState('');
  return (
    <div>
      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>Qurilma nomi</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="masalan: PS5 #1" style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'18px'}}/>
      <button onClick={() => name.trim() && onAdd(name.trim())} disabled={!name.trim()} className="btn btn-primary" style={{width:'100%', padding:'14px', borderRadius:'12px', fontSize:'15px', opacity: name.trim() ? 1 : 0.5}}>
        Qo'shish
      </button>
    </div>
  );
}

function TariffForm({ onSave, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.pricePerHour?.toString() || '');
  return (
    <div>
      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>Tarif nomi</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="masalan: Oddiy" style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'14px'}}/>
      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>1 soat narxi (so'm)</label>
      <input type="number" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} placeholder="20000" style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'18px'}}/>
      <button onClick={() => { const p = parseInt(price); if (name.trim() && p > 0) onSave(name.trim(), p); }} disabled={!name.trim() || !parseInt(price)} className="btn btn-primary" style={{width:'100%', padding:'14px', borderRadius:'12px', fontSize:'15px', opacity: (name.trim() && parseInt(price)) ? 1 : 0.5}}>
        Saqlash
      </button>
    </div>
  );
}

function TimerSetupForm({ tariffs, onStart }) {
  const [tariffId, setTariffId] = useState(tariffs[0]?.id || '');
  const [minutes, setMinutes] = useState(60);
  const presets = [30, 60, 90, 120];
  return (
    <div>
      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>Tarif</label>
      <select value={tariffId} onChange={e => setTariffId(e.target.value)} style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'18px'}}>
        {tariffs.map(t => <option key={t.id} value={t.id}>{t.name} — {new Intl.NumberFormat('uz-UZ').format(t.pricePerHour)} so'm/soat</option>)}
      </select>
      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>Vaqt</label>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'10px'}}>
        {presets.map(p => (
          <button key={p} onClick={() => setMinutes(p)} style={{padding:'12px 8px', borderRadius:'12px', background: minutes===p ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (minutes===p ? 'transparent' : 'rgba(255,255,255,0.08)'), color:'#e4e4e7', cursor:'pointer', fontWeight:600, fontSize:'13px', fontFamily: 'inherit'}}>
            {p < 60 ? `${p} daq` : `${p/60} soat`}
          </button>
        ))}
      </div>
      <input type="number" inputMode="numeric" value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 0)} style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'16px'}}/>
      <div style={{background:'rgba(168,85,247,0.08)', border:'1px solid rgba(168,85,247,0.2)', borderRadius:'14px', padding:'14px', marginBottom:'18px', display:'flex', alignItems:'center', gap:'12px'}}>
        <div style={{width:'32px', height:'32px', borderRadius:'10px', background:'rgba(168,85,247,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0}}>
          <Bell size={16} color="#c4b5fd"/>
        </div>
        <div style={{fontSize:'12px', color:'#c4b5fd', lineHeight: 1.5, fontWeight: 500}}>
          Vaqt tugaganda <strong>ekranga xabar</strong> + <strong>TV avtomatik o'chadi</strong>
        </div>
      </div>
      <button onClick={() => minutes > 0 && tariffId && onStart(tariffId, minutes)} disabled={!minutes || !tariffId} className="btn btn-success" style={{width:'100%', padding:'14px', borderRadius:'14px', fontSize:'15px', opacity: (minutes && tariffId) ? 1 : 0.5}}>
        <Play size={16} fill="white"/> Boshlash
      </button>
    </div>
  );
}

function DeviceSettingsForm({ device, onSave }) {
  const [name, setName] = useState(device.name);
  const [tuyaDeviceId, setTuyaDeviceId] = useState(device.tuyaDeviceId || '');
  const [tvAutoControl, setTvAutoControl] = useState(device.tvAutoControl !== false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async (action) => {
    if (!tuyaDeviceId) { alert('Avval Device ID kiriting'); return; }
    setTesting(true);
    setTestResult(null);
    const ok = await tuyaControl(tuyaDeviceId, action);
    setTestResult(ok ? 'success' : 'error');
    setTesting(false);
  };

  return (
    <div>
      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>Qurilma nomi</label>
      <input value={name} onChange={e => setName(e.target.value)} style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'18px'}}/>

      <label style={{display:'block', fontSize:'12px', color:'#a1a1aa', marginBottom:'8px', fontWeight: 600}}>
        Tuya Smart Plug Device ID
      </label>
      <input
        value={tuyaDeviceId}
        onChange={e => setTuyaDeviceId(e.target.value.trim())}
        placeholder="masalan: bf1234abcd..."
        style={{width:'100%', padding:'13px 14px', borderRadius:'12px', fontSize:'13px', marginBottom:'8px', fontFamily:'JetBrains Mono, monospace'}}
      />
      <div style={{fontSize:'11px', color:'#71717a', marginBottom:'14px', lineHeight: 1.5}}>
        Tuya IoT Platform → Devices → Device ID ni nusxalab qo'ying
      </div>

      {tuyaDeviceId && (
        <>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'12px'}}>
            <button onClick={() => testConnection('on')} disabled={testing} className="btn btn-success" style={{padding:'11px', borderRadius:'10px', fontSize:'13px', opacity: testing ? 0.6 : 1}}>
              <Power size={13}/> ON test
            </button>
            <button onClick={() => testConnection('off')} disabled={testing} className="btn btn-danger" style={{padding:'11px', borderRadius:'10px', fontSize:'13px', opacity: testing ? 0.6 : 1}}>
              <Power size={13}/> OFF test
            </button>
          </div>
          {testResult === 'success' && (
            <div style={{padding:'10px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:'10px', color:'#86efac', fontSize:'12px', marginBottom:'14px', fontWeight:600, textAlign:'center'}}>
              ✓ TV bilan aloqa muvaffaqiyatli!
            </div>
          )}
          {testResult === 'error' && (
            <div style={{padding:'10px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'10px', color:'#fca5a5', fontSize:'12px', marginBottom:'14px', fontWeight:600, textAlign:'center'}}>
              ✗ Xatolik. Device ID va API kalitlarni tekshiring.
            </div>
          )}
        </>
      )}

      <label style={{display:'flex', alignItems:'center', gap:'10px', padding:'14px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'12px', marginBottom:'18px', cursor:'pointer'}}>
        <input type="checkbox" checked={tvAutoControl} onChange={e => setTvAutoControl(e.target.checked)} style={{width:'18px', height:'18px', accentColor:'#a855f7'}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:'13px', fontWeight:600, color:'#e4e4e7'}}>TV avtomatik boshqaruvi</div>
          <div style={{fontSize:'11px', color:'#71717a', marginTop:'2px'}}>Ochish/Yopish paytida TV avtomatik yoq/o'ch</div>
        </div>
      </label>

      <button onClick={() => onSave({ name: name.trim(), tuyaDeviceId, tvAutoControl })} className="btn btn-primary" style={{width:'100%', padding:'14px', borderRadius:'12px', fontSize:'15px'}}>
        Saqlash
      </button>
    </div>
  );
}
