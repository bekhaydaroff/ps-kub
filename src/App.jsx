import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Trash2, BarChart3, Clock, DollarSign, Gamepad2, X, Edit2, Bell, Calendar, TrendingUp, Volume2, VolumeX, Zap, Activity } from 'lucide-react';

// ==================== STORAGE HELPER (localStorage) ====================
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
  const [audioReady, setAudioReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, forceUpdate] = useState(0);
  const audioCtxRef = useRef(null);

  // Audio unlock on first interaction
  useEffect(() => {
    const unlockAudio = () => {
      if (audioReady) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        if (ctx.state === 'suspended') ctx.resume();
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
        setAudioReady(true);
      } catch (e) {}
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, [audioReady]);

  // Load from localStorage
  useEffect(() => {
    const sd = storage.get('ps_devices');
    if (sd && Array.isArray(sd) && sd.length > 0) {
      setDevices(sd);
    } else {
      const initial = Array.from({length: 6}, (_, i) => ({
        id: `dev_${Date.now()}_${i}`, name: `PS ${i+1}`,
        running: false, startTime: null, tariffId: null,
        scheduledMinutes: null, alerted: false,
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
    setLoaded(true);
  }, []);

  const saveDevices = (n) => { setDevices(n); storage.set('ps_devices', n); };
  const saveTariffs = (n) => { setTariffs(n); storage.set('ps_tariffs', n); };
  const saveSessions = (n) => { setSessions(n); storage.set('ps_sessions', n); };

  // Ticker
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

  // Voice alert in Uzbek
  const speakAlert = (deviceName) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const messages = [
        `Diqqat! ${deviceName} ning vaqti tugadi!`,
        `${deviceName}, vaqt tugadi!`,
        `Diqqat! ${deviceName} vaqti tugadi!`,
      ];
      messages.forEach((msg, i) => {
        setTimeout(() => {
          const u = new SpeechSynthesisUtterance(msg);
          const voices = window.speechSynthesis.getVoices();
          const uzVoice = voices.find(v => v.lang.startsWith('uz'));
          const ruVoice = voices.find(v => v.lang.startsWith('ru'));
          const trVoice = voices.find(v => v.lang.startsWith('tr'));
          if (uzVoice) u.voice = uzVoice;
          else if (ruVoice) u.voice = ruVoice;
          else if (trVoice) u.voice = trVoice;
          u.lang = uzVoice ? 'uz-UZ' : (ruVoice ? 'ru-RU' : 'en-US');
          u.rate = 0.95;
          u.pitch = 1.1;
          u.volume = 1.0;
          window.speechSynthesis.speak(u);
        }, i * 2500);
      });
    } catch (e) {}
  };

  const triggerAlarm = (device) => {
    const updated = devices.map(d => d.id === device.id ? {...d, alerted: true} : d);
    setDevices(updated);
    storage.set('ps_devices', updated);

    try {
      let ctx = audioCtxRef.current;
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); audioCtxRef.current = ctx; }
      if (ctx.state === 'suspended') ctx.resume();

      const playBeep = (when, freq, dur = 0.25, vol = 0.6) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.setValueAtTime(0, ctx.currentTime + when);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.05);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + when + dur);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + dur);
      };
      for (let i = 0; i < 3; i++) {
        const t = i * 0.35;
        playBeep(t, 1200, 0.15, 0.7);
        playBeep(t + 0.15, 900, 0.15, 0.7);
      }
    } catch(e) {}

    setTimeout(() => speakAlert(device.name), 1200);

    try {
      if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400, 150, 800, 200, 400]);
    } catch(e) {}
  };

  const startDevice = (deviceId, tariffId, minutes = null) => {
    const updated = devices.map(d => d.id === deviceId ? {
      ...d, running: true, startTime: Date.now(), tariffId,
      scheduledMinutes: minutes, alerted: false,
    } : d);
    saveDevices(updated);
  };

  const stopDevice = (deviceId) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.running) return;
    const tariff = tariffs.find(t => t.id === device.tariffId);
    if (!tariff) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

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
    setShowCompleteSession(session);
  };

  const addDevice = (name) => {
    saveDevices([...devices, {
      id: `dev_${Date.now()}`, name, running: false, startTime: null,
      tariffId: null, scheduledMinutes: null, alerted: false,
    }]);
  };

  const removeDevice = (deviceId) => {
    if (!confirm('Bu qurilmani o\'chirmoqchimisiz?')) return;
    saveDevices(devices.filter(d => d.id !== deviceId));
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
          color: #e4e4e7;
          padding-bottom: 100px;
          position: relative;
          overflow-x: hidden;
        }
        .ps-app::before {
          content: '';
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0 0.7 0 0 0 0.025 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
          pointer-events: none; opacity: 0.6; z-index: 1;
        }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .glass {
          background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.05) inset, 0 0 0 1px rgba(0,0,0,0.2), 0 20px 40px -20px rgba(0,0,0,0.4);
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
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.08) inset, 0 0 50px -8px rgba(34,197,94,0.3), 0 0 0 1px rgba(34,197,94,0.15);
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
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        .fade-up { animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        .fade-up-1 { animation-delay: 0.05s; }
        .fade-up-2 { animation-delay: 0.1s; }
        .fade-up-3 { animation-delay: 0.15s; }
        .fade-up-4 { animation-delay: 0.2s; }
        .fade-up-5 { animation-delay: 0.25s; }
        .fade-up-6 { animation-delay: 0.3s; }
        .shimmer-text {
          background: linear-gradient(90deg, #a78bfa 0%, #f0abfc 50%, #a78bfa 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .btn {
          border: none; font-family: inherit; font-weight: 600; cursor: pointer;
          position: relative; overflow: hidden;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: -0.01em;
        }
        .btn:active { transform: scale(0.97); }
        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          color: white;
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.2) inset, 0 8px 20px -6px rgba(99,102,241,0.5);
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 1px 0 0 rgba(255,255,255,0.3) inset, 0 12px 28px -6px rgba(99,102,241,0.7); }
        .btn-success {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.2) inset, 0 8px 20px -6px rgba(34,197,94,0.5);
        }
        .btn-success:hover { transform: translateY(-1px); }
        .btn-danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.2) inset, 0 8px 20px -6px rgba(239,68,68,0.5);
        }
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
        .device-card { position: relative; z-index: 2; border-radius: 24px; padding: 20px; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
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
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          display: flex; align-items: flex-end; justify-content: center;
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
        }
        .header {
          padding: 20px 16px 16px;
          position: sticky; top: 0; z-index: 20;
          background: linear-gradient(180deg, rgba(6,8,15,0.95) 0%, rgba(6,8,15,0.7) 80%, transparent 100%);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .logo-icon {
          width: 48px; height: 48px; border-radius: 14px;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 1px 0 0 rgba(255,255,255,0.3) inset, 0 8px 24px -4px rgba(99,102,241,0.5);
          position: relative;
        }
        .logo-icon::after {
          content: ''; position: absolute; inset: -2px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          z-index: -1; filter: blur(12px); opacity: 0.5;
        }
        .pill {
          font-size: 11px; font-weight: 600;
          padding: 6px 10px; border-radius: 100px;
          display: flex; align-items: center; gap: 5px;
          letter-spacing: -0.01em;
        }
        .pill-ready { color: #86efac; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); }
        .pill-locked { color: #fcd34d; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); }
        .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #71717a; padding: 0 4px; }
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
            </div>
          </div>
          <div className={`pill ${audioReady ? 'pill-ready' : 'pill-locked'} fade-up fade-up-2`}>
            {audioReady ? <Volume2 size={12}/> : <VolumeX size={12}/>}
            {audioReady ? 'Tayyor' : 'Bosing'}
          </div>
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
                    {devices.filter(d => d.running).length} faol qurilma
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

                return (
                  <div key={device.id} className={`device-card ${cls} fade-up ${delayClass}`}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'14px'}}>
                      <div>
                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                          {device.running ? <div className="live-dot"/> : <div style={{width:'8px', height:'8px', borderRadius:'50%', background: '#3f3f46'}}/>}
                          <div style={{fontSize:'18px', fontWeight:700, letterSpacing: '-0.02em'}}>{device.name}</div>
                        </div>
                        {device.running && tariff && (
                          <div style={{fontSize:'12px', color:'#a1a1aa', marginTop:'6px', display:'flex', alignItems:'center', gap:'6px'}}>
                            <span style={{padding:'2px 8px', background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.25)', borderRadius:'6px', color:'#c4b5fd', fontWeight: 600}}>{tariff.name}</span>
                            <span>{formatMoney(tariff.pricePerHour)}/soat</span>
                          </div>
                        )}
                        {!device.running && <div style={{fontSize:'12px', color:'#52525b', marginTop:'6px', fontWeight: 500}}>Bo'sh holat</div>}
                      </div>
                      {!device.running && (
                        <button onClick={() => removeDevice(device.id)} style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#71717a', cursor:'pointer', padding:'8px', borderRadius: '10px'}}>
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>

                    {device.running && (
                      <>
                        <div style={{background:'rgba(0,0,0,0.4)', borderRadius:'16px', padding:'18px 16px', marginBottom:'14px', textAlign:'center', border: '1px solid rgba(255,255,255,0.04)', position:'relative', overflow:'hidden'}}>
                          {device.scheduledMinutes && (
                            <div style={{position:'absolute', top:0, left:0, right:0, height:'3px', background:'rgba(255,255,255,0.06)'}}>
                              <div style={{height:'100%', width:`${progress}%`, background: isAlerted ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #6366f1, #a855f7)', transition:'width 0.3s', boxShadow:'0 0 10px rgba(168,85,247,0.5)'}}/>
                            </div>
                          )}
                          <div style={{fontSize:'10px', color:'#71717a', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:'6px', fontWeight: 700}}>
                            {isAlerted ? '⏰ VAQT TUGADI!' : 'O\'tgan vaqt'}
                          </div>
                          <div className="mono stat-number" style={{fontSize:'32px', fontWeight:700, color: isAlerted ? '#fca5a5' : '#a7f3d0', letterSpacing:'-0.03em', textShadow: isAlerted ? '0 0 30px rgba(239,68,68,0.5)' : '0 0 30px rgba(34,197,94,0.3)'}}>
                            {formatDuration(elapsedMs)}
                          </div>
                          {remaining !== null && !isAlerted && (
                            <div style={{fontSize:'12px', color:'#c4b5fd', marginTop:'4px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace'}}>
                              Qolgan: {formatDuration(Math.max(0, remaining))}
                            </div>
                          )}
                          <div style={{marginTop:'14px', paddingTop:'14px', borderTop:'1px dashed rgba(255,255,255,0.08)'}}>
                            <div style={{fontSize:'11px', color:'#71717a', fontWeight: 600, letterSpacing: '0.05em'}}>JORIY SUMMA</div>
                            <div className="stat-number" style={{fontSize:'24px', fontWeight:800, color:'#fff', marginTop:'2px', letterSpacing: '-0.03em'}}>
                              {formatMoney(getCurrentAmount(device))}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => stopDevice(device.id)} className="btn btn-danger" style={{width:'100%', padding:'14px', borderRadius:'14px', fontSize:'15px'}}>
                          <Square size={16} fill="white"/> Yopish va hisoblash
                        </button>
                      </>
                    )}

                    {!device.running && (
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'}}>
                        <button onClick={() => { if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; } startDevice(device.id, tariffs[0].id); }} className="btn btn-success" style={{padding:'13px', borderRadius:'13px', fontSize:'14px'}}>
                          <Play size={15} fill="white"/> Ochish
                        </button>
                        <button onClick={() => { if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; } setShowTimerSetup(device.id); }} className="btn btn-primary" style={{padding:'13px', borderRadius:'13px', fontSize:'14px'}}>
                          <Clock size={15}/> Vaqt qo'y
                        </button>
                      </div>
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
                          <div className="stat-number" style={{fontSize:'13px', fontWeight:700, color: s.color, marginTop:'4px', letterSpacing: '-0.02em'}}>
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
                        <div style={{fontSize:'14px', fontWeight:700, letterSpacing: '-0.01em'}}>{s.deviceName}</div>
                        <div style={{fontSize:'11px', color:'#71717a', marginTop:'3px', fontWeight: 500}}>
                          {new Date(s.endTime).toLocaleString('uz-UZ', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}{' · '}{formatDuration(s.durationMs)}
                        </div>
                      </div>
                      <div className="stat-number" style={{fontSize:'15px', fontWeight:800, color:'#86efac', letterSpacing: '-0.02em'}}>
                        {formatMoney(s.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
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
      </div>

      {showAddDevice && <Modal onClose={() => setShowAddDevice(false)} title="Yangi qurilma"><AddDeviceForm onAdd={(name) => { addDevice(name); setShowAddDevice(false); }}/></Modal>}
      {showAddTariff && <Modal onClose={() => setShowAddTariff(false)} title="Yangi tarif"><TariffForm onSave={(name, price) => { addTariff(name, price); setShowAddTariff(false); }}/></Modal>}
      {editingTariff && <Modal onClose={() => setEditingTariff(null)} title="Tarifni tahrirlash"><TariffForm initial={editingTariff} onSave={(name, price) => { updateTariff(editingTariff.id, name, price); setEditingTariff(null); }}/></Modal>}
      {showTimerSetup && <Modal onClose={() => setShowTimerSetup(null)} title="Vaqt belgilash"><TimerSetupForm tariffs={tariffs} onStart={(tariffId, minutes) => { startDevice(showTimerSetup, tariffId, minutes); setShowTimerSetup(null); }}/></Modal>}

      {showCompleteSession && (
        <Modal onClose={() => setShowCompleteSession(null)} title="✓ Sessiya yakunlandi">
          <div style={{textAlign:'center', padding:'10px 0'}}>
            <div style={{fontSize:'14px', color:'#a1a1aa', marginBottom:'4px', fontWeight: 500}}>
              {showCompleteSession.deviceName} · {showCompleteSession.tariffName}
            </div>
            <div className="mono" style={{fontSize:'14px', color:'#c4b5fd', marginBottom:'20px', fontWeight: 600}}>
              {formatDuration(showCompleteSession.durationMs)}
            </div>
            <div style={{background:'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.06))', border:'1px solid rgba(34,197,94,0.3)', borderRadius:'20px', padding:'28px 20px', marginBottom:'20px', boxShadow: '0 0 60px -10px rgba(34,197,94,0.3)'}}>
              <div style={{fontSize:'11px', color:'#86efac', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'8px', fontWeight: 700}}>Jami summa</div>
              <div className="stat-number" style={{fontSize:'40px', fontWeight:800, color:'#86efac', letterSpacing:'-0.03em', textShadow: '0 0 40px rgba(34,197,94,0.4)'}}>
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
          <button key={p} onClick={() => setMinutes(p)} style={{padding:'12px 8px', borderRadius:'12px', background: minutes===p ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (minutes===p ? 'transparent' : 'rgba(255,255,255,0.08)'), color:'#e4e4e7', cursor:'pointer', fontWeight:600, fontSize:'13px', fontFamily: 'inherit', transition: 'all 0.2s', boxShadow: minutes===p ? '0 8px 20px -6px rgba(99,102,241,0.5)' : 'none'}}>
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
          Vaqt tugaganda <strong>ovozli xabar</strong>, beep va vibratsiya
        </div>
      </div>
      <button onClick={() => minutes > 0 && tariffId && onStart(tariffId, minutes)} disabled={!minutes || !tariffId} className="btn btn-success" style={{width:'100%', padding:'14px', borderRadius:'14px', fontSize:'15px', opacity: (minutes && tariffId) ? 1 : 0.5}}>
        <Play size={16} fill="white"/> Boshlash
      </button>
    </div>
  );
}
