import React, { useState, useEffect } from 'react';
import {
  Play, Square, Plus, Trash2, BarChart3, Clock, DollarSign, Gamepad2, X, Edit2,
  Bell, Calendar, TrendingUp, Zap, Activity, Tv, Power, Settings, Wifi, WifiOff,
  Wallet, Users, Home, Wrench, Timer, Crown, CheckCircle2, LayoutGrid,
} from 'lucide-react';

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

const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const WEEKDAYS_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const MENU = [
  { id: 'home', label: 'Bosh sahifa', sub: 'Umumiy holat', icon: Home, g: 'linear-gradient(135deg,#6d28d9,#a855f7)' },
  { id: 'devices', label: 'Qurilmalar', sub: 'Barcha PS', icon: Gamepad2, g: 'linear-gradient(135deg,#0369a1,#0ea5e9)' },
  { id: 'tariffs', label: 'Tariflar', sub: 'Narxlar', icon: DollarSign, g: 'linear-gradient(135deg,#be185d,#ec4899)' },
  { id: 'stats', label: 'Hisobot olish', sub: 'Daromad', icon: BarChart3, g: 'linear-gradient(135deg,#c2410c,#f59e0b)' },
  { id: 'settings', label: 'Sozlamalar', sub: 'Tizim', icon: Settings, g: 'linear-gradient(135deg,#334155,#64748b)' },
];

export default function PlayStationClub() {
  const [view, setView] = useState('home');
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
      setDevices(sd.map(d => ({ tuyaDeviceId: '', tvAutoControl: true, maintenance: false, vip: false, ...d })));
    } else {
      const initial = Array.from({ length: 4 }, (_, i) => ({
        id: `dev_${Date.now()}_${i}`, name: `PS ${i + 1}`,
        running: false, startTime: null, tariffId: null,
        scheduledMinutes: null, alerted: false,
        tuyaDeviceId: '', tvAutoControl: true, maintenance: false, vip: false,
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

    if ('Notification' in window) setNotifPermission(Notification.permission);
    setLoaded(true);
  }, []);

  const saveDevices = (n) => { setDevices(n); storage.set('ps_devices', n); };
  const saveTariffs = (n) => { setTariffs(n); storage.set('ps_tariffs', n); };
  const saveSessions = (n) => { setSessions(n); storage.set('ps_sessions', n); };

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
      new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'ps-klub-alarm',
        requireInteraction: true,
      });
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    } catch (e) { console.error(e); }
  };

  // Ticker - check every second for expired timers
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
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
    const updated = devices.map(d => d.id === device.id ? { ...d, alerted: true } : d);
    setDevices(updated);
    storage.set('ps_devices', updated);

    showNotification(
      `⏰ ${device.name} vaqti tugadi!`,
      `${device.name} sessiyasi yakunlandi. Iltimos, hisobni tayyorlang.`
    );

    if (device.tvAutoControl && device.tuyaDeviceId) {
      await tuyaControl(device.tuyaDeviceId, 'off');
    }
    try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
  };

  const startDevice = async (deviceId, tariffId, minutes = null, vip = false) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    if (device.maintenance) {
      alert('Bu qurilma texnik xizmatda. Avval sozlamalardan holatini o\'zgartiring.');
      return;
    }
    const updated = devices.map(d => d.id === deviceId ? {
      ...d, running: true, startTime: Date.now(), tariffId,
      scheduledMinutes: vip ? null : minutes, alerted: false, vip,
    } : d);
    saveDevices(updated);

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
      durationMs: elapsedMs, amount, vip: !!device.vip,
    };
    saveSessions([session, ...sessions]);

    const updated = devices.map(d => d.id === deviceId ? {
      ...d, running: false, startTime: null, tariffId: null,
      scheduledMinutes: null, alerted: false, vip: false,
    } : d);
    saveDevices(updated);

    if (device.tvAutoControl && device.tuyaDeviceId) {
      await tuyaControl(device.tuyaDeviceId, 'off');
    }
    setShowCompleteSession(session);
  };

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
      tuyaDeviceId: '', tvAutoControl: true, maintenance: false, vip: false,
    }]);
  };

  const removeDevice = (deviceId) => {
    if (!confirm('Bu qurilmani o\'chirmoqchimisiz?')) return;
    saveDevices(devices.filter(d => d.id !== deviceId));
  };

  const updateDevice = (id, updates) => {
    saveDevices(devices.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const addTariff = (name, price) => {
    saveTariffs([...tariffs, { id: `t_${Date.now()}`, name, pricePerHour: price }]);
  };

  const updateTariff = (id, name, price) => {
    saveTariffs(tariffs.map(t => t.id === id ? { ...t, name, pricePerHour: price } : t));
  };

  const removeTariff = (id) => {
    if (devices.some(d => d.running && d.tariffId === id)) {
      alert('Bu tarif hozir ishlatilmoqda. Avval qurilmani to\'xtating.');
      return;
    }
    if (!confirm('Bu tarifni o\'chirmoqchimisiz?')) return;
    saveTariffs(tariffs.filter(t => t.id !== id));
  };

  // ==================== HELPERS ====================
  const formatMoney = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n)) + ' so\'m';
  const formatShort = (n) => {
    const v = Math.round(n);
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + ' mln';
    return new Intl.NumberFormat('uz-UZ').format(v);
  };
  const formatDuration = (ms) => {
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const deviceStatus = (d) => {
    if (d.alerted) return { key: 'alert', text: 'Vaqt tugadi', color: '#f87171' };
    if (d.running && d.vip) return { key: 'vip', text: 'VIP · band', color: '#fbbf24' };
    if (d.running) return { key: 'busy', text: 'Band', color: '#4ade80' };
    if (d.maintenance) return { key: 'maint', text: 'Texnik xizmat', color: '#fb7185' };
    return { key: 'free', text: 'Bo\'sh', color: '#38bdf8' };
  };

  const todayStart = () => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  };

  const calcStats = () => {
    const now = new Date();
    const ts = todayStart();
    const weekStart = ts - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sum = (arr) => arr.reduce((a, b) => a + b.amount, 0);
    const today = sessions.filter(s => s.endTime >= ts);
    const yesterday = sessions.filter(s => s.endTime >= ts - 86400000 && s.endTime < ts);
    const todayMs = today.reduce((a, b) => a + b.durationMs, 0);
    return {
      today: { count: today.length, total: sum(today), hours: todayMs / 3600000 },
      yesterday: { count: yesterday.length, total: sum(yesterday) },
      week: { count: sessions.filter(s => s.endTime >= weekStart).length, total: sum(sessions.filter(s => s.endTime >= weekStart)) },
      month: { count: sessions.filter(s => s.endTime >= monthStart).length, total: sum(sessions.filter(s => s.endTime >= monthStart)) },
      all: { count: sessions.length, total: sum(sessions), hours: sessions.reduce((a, b) => a + b.durationMs, 0) / 3600000 },
    };
  };

  const calcDeviceStats = (deviceId) => {
    const now = new Date();
    const ts = todayStart();
    const weekStart = ts - 6 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const ds = sessions.filter(s => s.deviceId === deviceId);
    const sum = (arr) => arr.reduce((a, b) => a + b.amount, 0);
    return {
      today: sum(ds.filter(s => s.endTime >= ts)),
      todayCount: ds.filter(s => s.endTime >= ts).length,
      todayMs: ds.filter(s => s.endTime >= ts).reduce((a, b) => a + b.durationMs, 0),
      week: sum(ds.filter(s => s.endTime >= weekStart)),
      month: sum(ds.filter(s => s.endTime >= monthStart)),
    };
  };

  // Weekly chart: Dushanba -> Yakshanba of the current week
  const weeklyChart = () => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 0 = Dushanba
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
    return WEEKDAYS.map((label, i) => {
      const from = monday + i * 86400000;
      const to = from + 86400000;
      const total = sessions.filter(s => s.endTime >= from && s.endTime < to).reduce((a, b) => a + b.amount, 0);
      return { label, short: WEEKDAYS_SHORT[i], total, isToday: i === dow };
    });
  };

  const stats = calcStats();
  const linkedDevices = devices.filter(d => d.tuyaDeviceId).length;
  const runningDevices = devices.filter(d => d.running);
  const chart = weeklyChart();
  const chartMax = Math.max(1, ...chart.map(c => c.total));

  // Bugungi faol qurilmalar: bugun ishlatilgan yoki hozir ishlab turgan qurilmalar
  const todayActiveDevices = devices
    .map(d => {
      const ds = calcDeviceStats(d.id);
      const live = d.running ? getCurrentAmount(d) : 0;
      const liveMs = d.running ? Date.now() - d.startTime : 0;
      return {
        device: d,
        count: ds.todayCount + (d.running ? 1 : 0),
        total: ds.today + live,
        ms: ds.todayMs + liveMs,
      };
    })
    .filter(x => x.count > 0 || x.total > 0)
    .sort((a, b) => b.total - a.total);

  const dayDiff = stats.yesterday.total > 0
    ? Math.round(((stats.today.total - stats.yesterday.total) / stats.yesterday.total) * 100)
    : null;

  const clock = new Date();
  const timeStr = clock.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = clock.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#050b1c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontFamily: 'system-ui' }}>
        Yuklanmoqda...
      </div>
    );
  }

  // ==================== SHARED PIECES ====================
  return (
    <div className="ps-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { margin: 0; padding: 0; }
        body { background: #050b1c; font-family: 'Sora', system-ui, sans-serif; display: block; }
        #root {
          width: 100%; max-width: none; margin: 0; padding: 0;
          text-align: left; border: 0; display: block; min-height: 0;
        }
        .ps-app {
          min-height: 100vh; color: #e5edff; line-height: 1.35; letter-spacing: 0;
          background:
            radial-gradient(ellipse 70% 45% at 50% -8%, rgba(37,99,235,0.30), transparent 62%),
            radial-gradient(ellipse 55% 40% at 88% 78%, rgba(168,85,247,0.16), transparent 70%),
            radial-gradient(ellipse 55% 40% at 8% 62%, rgba(6,182,212,0.10), transparent 65%),
            #050b1c;
          padding-bottom: 120px;
        }
        .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }

        .kpi-row { display: flex; align-items: center; gap: 8px; }
        .scroll::-webkit-scrollbar { width: 6px; }
        .scroll::-webkit-scrollbar-thumb { background: rgba(96,165,250,0.28); border-radius: 100px; }
        .scroll::-webkit-scrollbar-track { background: transparent; }

        /* ---------- TOP BAR ---------- */
        .topbar {
          position: sticky; top: 0; z-index: 40;
          display: flex; align-items: center; gap: 14px;
          padding: 12px 18px;
          background: rgba(5,11,28,0.82);
          backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(96,165,250,0.14);
        }
        .brand { display: flex; align-items: center; gap: 11px; }
        .brand-ico {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg,#1d4ed8,#0ea5e9);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 22px -6px rgba(29,78,216,0.7);
        }
        .brand-name { font-size: 18px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
        .brand-sub { font-size: 11px; color: #7f93b8; margin-top: 3px; font-weight: 500; }
        .topbar-sp { flex: 1; }
        .clock { text-align: right; line-height: 1.15; }
        .clock-t { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
        .clock-d { font-size: 11px; color: #7f93b8; font-weight: 500; }
        .who {
          display: flex; align-items: center; gap: 8px;
          background: rgba(96,165,250,0.10); border: 1px solid rgba(96,165,250,0.22);
          padding: 6px 12px; border-radius: 100px;
        }
        .who-name { font-size: 12px; font-weight: 700; line-height: 1.1; }
        .who-st { font-size: 10px; color: #4ade80; display: flex; align-items: center; gap: 4px; }

        /* ---------- PAGE ---------- */
        .page { padding: 18px; max-width: 1500px; margin: 0 auto; }
        .page-head { margin-bottom: 18px; }
        .page-title { font-size: 24px; font-weight: 800; letter-spacing: -0.035em; display: flex; align-items: center; gap: 10px; }
        .page-sub { font-size: 13px; color: #7f93b8; margin-top: 5px; font-weight: 500; }

        .layout { display: grid; grid-template-columns: minmax(0,1fr) 360px; gap: 16px; align-items: start; }
        .layout.home-layout { grid-template-columns: minmax(0,1fr); }
        .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .col-side { gap: 10px; }
        @media (max-width: 1100px) {
          .layout { grid-template-columns: 1fr; }
          .layout.home-layout { grid-template-columns: 1fr; }
          .home-layout .dev-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1101px) {
          .layout.fit { grid-template-rows: minmax(0,1fr); align-items: stretch; }
        }

        /* ---------- KPI ---------- */
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
        @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 520px) { .kpis { grid-template-columns: 1fr 1fr; gap: 10px; } }
        .kpi {
          border-radius: 18px; padding: 16px; position: relative; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 18px 36px -22px rgba(0,0,0,0.9), 0 1px 0 0 rgba(255,255,255,0.08) inset;
        }
        .kpi-ico {
          width: 30px; height: 30px; border-radius: 10px; background: rgba(255,255,255,0.16);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .kpi-lbl { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.82); }
        .kpi-val { font-size: 26px; font-weight: 800; letter-spacing: -0.035em; margin-top: 4px; font-variant-numeric: tabular-nums; }
        @media (max-width: 520px) { .kpi-val { font-size: 20px; } }
        .kpi-foot { font-size: 11px; margin-top: 8px; font-weight: 600; display: flex; align-items: center; gap: 5px; color: rgba(255,255,255,0.72); }

        /* ---------- PANEL ---------- */
        .panel {
          border-radius: 20px; padding: 16px;
          background: linear-gradient(160deg, rgba(18,32,68,0.72) 0%, rgba(9,17,40,0.72) 100%);
          border: 1px solid rgba(96,165,250,0.16);
          box-shadow: 0 24px 48px -28px rgba(0,0,0,0.95), 0 1px 0 0 rgba(255,255,255,0.05) inset;
        }
        .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .panel-title { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
        .badge { font-size: 11px; font-weight: 700; padding: 5px 11px; border-radius: 100px; }
        .badge-green { color: #86efac; background: rgba(34,197,94,0.14); border: 1px solid rgba(34,197,94,0.32); }
        .badge-blue { color: #93c5fd; background: rgba(59,130,246,0.14); border: 1px solid rgba(59,130,246,0.32); }
        .link { background: none; border: none; color: #60a5fa; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; padding: 0; }
        .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64769b; }

        .empty {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 26px 14px; color: #64769b; font-size: 13px; font-weight: 500;
          border: 1px dashed rgba(96,165,250,0.18); border-radius: 16px; background: rgba(0,0,0,0.18);
        }
        .empty.sm { padding: 18px 12px; font-size: 12px; }

        /* ---------- DEVICE GRID ---------- */
        .dev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
        .home-layout .dev-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .home-layout .dev-grid .dev { display: flex; flex-direction: column; }
        .home-layout .dev-grid .dev-btns { margin-top: auto; padding-top: 12px; }
        .dev {
          border-radius: 18px; padding: 14px; position: relative;
          background: linear-gradient(160deg, rgba(12,24,54,0.9), rgba(7,14,34,0.9));
          border: 1px solid rgba(96,165,250,0.22);
          transition: transform 0.2s, box-shadow 0.35s ease, border-color 0.35s ease, background 0.35s ease;
        }
        .dev:hover { transform: translateY(-2px); }
        .dev.st-free { border-color: rgba(56,189,248,0.45); box-shadow: 0 0 26px -12px rgba(56,189,248,0.7); }
        .dev.st-busy {
          border-color: rgba(74,222,128,0.85); border-width: 1.5px;
          box-shadow: 0 0 44px -8px rgba(74,222,128,1);
        }
        .dev.st-vip {
          border-color: rgba(251,191,36,0.6);
          background: linear-gradient(160deg, rgba(120,53,15,0.45), rgba(7,14,34,0.92));
          box-shadow: 0 0 34px -12px rgba(251,191,36,0.8);
        }
        .dev.st-busy { background: linear-gradient(160deg, rgba(21,128,61,0.58), rgba(7,14,34,0.94)); }
        .dev.st-alert {
          background: linear-gradient(160deg, rgba(127,29,29,0.45), rgba(20,8,20,0.9));
          border-color: rgba(248,113,113,0.75);
          box-shadow: 0 0 30px -6px rgba(239,68,68,0.6);
        }
        .dev.st-maint { border-color: rgba(251,113,133,0.5); box-shadow: 0 0 26px -12px rgba(251,113,133,0.6); opacity: 0.85; }
        .vip-tag {
          margin-left: 7px; font-size: 9px; font-weight: 800; letter-spacing: 0.08em;
          padding: 2px 6px; border-radius: 5px; vertical-align: middle;
          background: linear-gradient(135deg,#f59e0b,#fbbf24); color: #442200;
        }
        .dev-top { display: flex; gap: 12px; }
        .screen {
          width: 84px; height: 62px; border-radius: 9px; flex-shrink: 0; position: relative;
          background: linear-gradient(160deg,#1e40af,#0891b2);
          display: flex; align-items: center; justify-content: center;
          border: 2px solid rgba(255,255,255,0.16);
          box-shadow: 0 10px 22px -10px rgba(14,165,233,0.85);
        }
        .screen[data-st="busy"] { background: linear-gradient(160deg,#16a34a,#0d9488); box-shadow: 0 10px 26px -8px rgba(34,197,94,1); }
        .screen[data-st="maint"] { background: linear-gradient(160deg,#9f1239,#a21caf); box-shadow: 0 10px 22px -10px rgba(236,72,153,0.8); }
        .screen[data-st="vip"] { background: linear-gradient(160deg,#b45309,#f59e0b); box-shadow: 0 10px 22px -10px rgba(245,158,11,0.9); }
        .screen[data-st="alert"] { background: linear-gradient(160deg,#b91c1c,#7f1d1d); }
        .screen-glow { position: absolute; inset: 0; border-radius: 7px; background: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.28), transparent 65%); }
        .screen-stand { position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 26px; height: 6px; border-radius: 0 0 5px 5px; background: rgba(255,255,255,0.18); }
        .dev-info { min-width: 0; flex: 1; }
        .dev-name { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; }
        .dev-status { font-size: 12px; font-weight: 700; margin-top: 3px; display: flex; align-items: center; gap: 6px; }
        .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
        .dot.live { background: #4ade80; box-shadow: 0 0 10px #4ade80; }
        .dev-meta { font-size: 11px; color: #7f93b8; margin-top: 4px; display: flex; align-items: center; gap: 5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dev-meta-sep { opacity: 0.5; }
        .dev-live { margin-top: 12px; background: rgba(0,0,0,0.36); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 12px; }
        .dev-live-row { display: flex; align-items: baseline; justify-content: space-between; }
        .timer { font-size: 19px; font-weight: 700; color: #6ee7b7; letter-spacing: -0.02em; }
        .amt { font-size: 14px; font-weight: 800; color: #fff; }
        .dev-remain { font-size: 11px; color: #93c5fd; margin-top: 4px; font-weight: 600; }
        .bar { height: 4px; background: rgba(255,255,255,0.08); border-radius: 100px; overflow: hidden; margin-bottom: 8px; }
        .bar-fill { height: 100%; transition: width 0.4s; }
        .dev-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }

        /* ---------- ACTIVE ---------- */
        .act-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        .act-grid.compact { grid-template-columns: 1fr; }
        .act {
          border-radius: 16px; padding: 14px;
          background: linear-gradient(160deg, rgba(20,83,45,0.35), rgba(6,20,40,0.7));
          border: 1px solid rgba(74,222,128,0.35);
          box-shadow: 0 0 34px -18px rgba(34,197,94,0.8);
        }
        .act-alert { background: linear-gradient(160deg, rgba(127,29,29,0.4), rgba(20,8,20,0.7)); border-color: rgba(248,113,113,0.6); }
        .act-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .act-name { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px; letter-spacing: -0.02em; }
        .chip { font-size: 11px; font-weight: 700; color: #c4b5fd; background: rgba(168,85,247,0.14); border: 1px solid rgba(168,85,247,0.3); padding: 4px 9px; border-radius: 100px; }
        .act-body { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 10px; }
        .act-cell { background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.06); border-radius: 11px; padding: 9px 10px; }
        .cell-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #7f93b8; font-weight: 700; }
        .cell-val { font-size: 15px; font-weight: 800; margin-top: 3px; letter-spacing: -0.02em; }
        .act-btns { display: flex; gap: 8px; }
        .act-btns .btn:first-child { flex: 1; }

        /* ---------- TODAY ACTIVE LIST ---------- */
        .tad-list { display: flex; flex-direction: column; gap: 8px; }
        .tad { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 13px; background: rgba(0,0,0,0.24); border: 1px solid rgba(255,255,255,0.05); }
        .tad-ico { width: 36px; height: 36px; border-radius: 11px; border: 1px solid; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .tad-mid { flex: 1; min-width: 0; }
        .tad-name { font-size: 13px; font-weight: 700; display: flex; align-items: center; }
        .tad-sub { font-size: 11px; color: #7f93b8; margin-top: 2px; font-weight: 500; }
        .tad-amt { font-size: 13px; font-weight: 800; color: #86efac; white-space: nowrap; }

        /* ---------- CHART ---------- */
        .chart { display: grid; grid-template-columns: repeat(7,1fr); gap: 6px; height: 150px; align-items: end; }
        .chart-col { display: flex; flex-direction: column; align-items: center; height: 100%; gap: 4px; }
        .chart-val { font-size: 9px; color: #7f93b8; font-weight: 700; height: 12px; }
        .chart-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
        .chart-bar { width: 100%; border-radius: 6px 6px 3px 3px; background: linear-gradient(180deg,#3b82f6,#1d4ed8); transition: height 0.4s; }
        .chart-bar.today { background: linear-gradient(180deg,#22d3ee,#0ea5e9); box-shadow: 0 0 16px -4px rgba(34,211,238,0.8); }
        .chart-lbl { font-size: 10px; color: #64769b; font-weight: 600; }
        .chart-lbl.today { color: #22d3ee; font-weight: 800; }
        .chart-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.07); font-size: 12px; color: #7f93b8; font-weight: 600; }
        .chart-foot strong { color: #fff; font-size: 14px; }

        /* ---------- BUTTONS ---------- */
        .btn {
          border: none; font-family: inherit; font-weight: 700; cursor: pointer;
          transition: transform 0.15s, filter 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 11px 12px; border-radius: 12px; font-size: 13px; letter-spacing: -0.01em;
        }
        .btn:active { transform: scale(0.97); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn.sm { padding: 9px 14px; font-size: 12px; }
        .btn.wide { width: 100%; }
        .btn-primary { background: linear-gradient(135deg,#2563eb,#0ea5e9); color: #fff; box-shadow: 0 10px 22px -10px rgba(37,99,235,0.85); }
        .btn-success { background: linear-gradient(135deg,#16a34a,#22c55e); color: #fff; box-shadow: 0 10px 22px -10px rgba(34,197,94,0.85); }
        .btn-danger { background: linear-gradient(135deg,#dc2626,#ef4444); color: #fff; box-shadow: 0 10px 22px -10px rgba(239,68,68,0.85); }
        .btn-warn { background: linear-gradient(135deg,#ea580c,#f59e0b); color: #fff; }
        .btn-ghost { background: rgba(96,165,250,0.10); border: 1px solid rgba(96,165,250,0.28); color: #bfdbfe; }
        .btn-ghost:hover { background: rgba(96,165,250,0.18); }
        .icon-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: #8ea3c7; cursor: pointer; padding: 9px; border-radius: 11px; display: flex; align-items: center; justify-content: center; }
        .icon-btn:hover { color: #fff; border-color: rgba(96,165,250,0.4); }

        input, select {
          background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.10);
          color: #e5edff; font-family: inherit; outline: none; transition: all 0.2s;
        }
        input:focus, select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.16); }
        select option { background: #0b1630; color: #e5edff; }

        /* ---------- BOTTOM MENU ---------- */
        .bottom-menu {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
          padding: 10px 12px max(12px, env(safe-area-inset-bottom));
          background: rgba(5,11,28,0.9);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(96,165,250,0.16);
        }
        .bm-row { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; max-width: 1500px; margin: 0 auto; }
        @media (max-width: 860px) { .bm-row { grid-template-columns: repeat(5,1fr); gap: 6px; } }
        .bm {
          border: 1px solid rgba(255,255,255,0.10); border-radius: 14px;
          padding: 11px 12px; cursor: pointer; font-family: inherit; color: #fff;
          display: flex; align-items: center; gap: 10px; text-align: left;
          opacity: 0.62; transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .bm:hover { opacity: 0.9; }
        .bm.on { opacity: 1; transform: translateY(-3px); box-shadow: 0 14px 26px -14px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.22) inset; }
        .bm-txt { min-width: 0; }
        .bm-lbl { font-size: 13px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bm-sub { font-size: 10px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @media (max-width: 860px) {
          .bm { flex-direction: column; gap: 4px; padding: 9px 4px; align-items: center; text-align: center; border-radius: 12px; }
          .bm-sub { display: none; }
          .bm-lbl { font-size: 9.5px; }
        }

        /* ---------- MODAL ---------- */
        .modal-backdrop { position: fixed; inset: 0; background: rgba(2,6,18,0.78); backdrop-filter: blur(8px); display: flex; align-items: flex-end; justify-content: center; z-index: 120; animation: fade-in 0.2s ease; }
        @media (min-width: 700px) { .modal-backdrop { align-items: center; } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-content {
          width: 100%; max-width: 520px;
          background: linear-gradient(180deg,#132449 0%,#070f26 100%);
          border: 1px solid rgba(96,165,250,0.25);
          border-radius: 24px 24px 0 0;
          padding: 22px 20px max(22px, env(safe-area-inset-bottom));
          animation: slide-up 0.28s cubic-bezier(0.16,1,0.3,1);
          max-height: 88vh; overflow-y: auto;
        }
        @media (min-width: 700px) { .modal-content { border-radius: 22px; } }
        .flabel { display: block; font-size: 12px; color: #93a7c9; margin-bottom: 7px; font-weight: 600; }
        .mode-row { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-bottom: 16px; }
        .mode {
          display: flex; align-items: center; gap: 9px; text-align: left; cursor: pointer;
          padding: 12px; border-radius: 14px; font-family: inherit; color: #93a7c9;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          transition: all 0.2s;
        }
        .mode.on.timed { background: linear-gradient(135deg, rgba(37,99,235,0.28), rgba(14,165,233,0.14)); border-color: rgba(56,189,248,0.6); color: #dbeafe; }
        .mode.on.vip { background: linear-gradient(135deg, rgba(245,158,11,0.28), rgba(251,191,36,0.12)); border-color: rgba(251,191,36,0.65); color: #fde68a; }
        .mode-t { font-size: 13.5px; font-weight: 800; letter-spacing: -0.02em; }
        .mode-s { font-size: 10.5px; opacity: 0.85; margin-top: 2px; line-height: 1.35; }
        .finput { width: 100%; padding: 12px 13px; border-radius: 12px; font-size: 15px; }

        @keyframes fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fade-up 0.45s cubic-bezier(0.16,1,0.3,1) backwards; }
        .fade-up-1 { animation-delay: .04s } .fade-up-2 { animation-delay: .08s }
        .fade-up-3 { animation-delay: .12s } .fade-up-4 { animation-delay: .16s }
        .fade-up-5 { animation-delay: .2s }  .fade-up-6 { animation-delay: .24s }

        /* ---------- ONE-SCREEN DESKTOP LAYOUT (oxirida turishi shart) ---------- */
        @media (min-width: 1101px) {
          .ps-app { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; padding-bottom: 78px; }
          .page { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding: 12px 18px; width: 100%; align-self: center; margin: 0; }
          .layout.fit { flex: 1; min-height: 0; gap: 12px; }
          .layout.fit .col { height: 100%; min-height: 0; }
          .panel.grow { flex: 1; min-height: 0; display: flex; flex-direction: column; }
          .panel.grow .scroll { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
          .page-head { margin-bottom: 10px; }
          .page-title { font-size: 20px; }
          .page-sub { font-size: 12px; margin-top: 2px; }
          .kpis { margin-bottom: 10px; gap: 10px; }
          .kpi { padding: 9px 12px; border-radius: 15px; }
          .kpi-val { font-size: 21px; margin-top: 1px; }
          .kpi-foot { margin-top: 3px; }
          .kpi-ico { width: 27px; height: 27px; border-radius: 9px; }
          .col { gap: 10px; }
          .panel { padding: 12px 13px; border-radius: 17px; }
          .panel-head { margin-bottom: 10px; }
          .chart { height: 100px; }
          .chart-foot { margin-top: 8px; padding-top: 8px; }
          .dev-grid { grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); gap: 8px; }
          .dev { padding: 9px; border-radius: 14px; }
          .dev-top { gap: 10px; }
          .screen { width: 52px; height: 39px; border-radius: 7px; }
          .screen-stand { width: 18px; height: 5px; bottom: -6px; }
          .dev-name { font-size: 13.5px; }
          .dev-status { font-size: 11px; margin-top: 2px; }
          .dev-meta { font-size: 10.5px; margin-top: 2px; }
          .dev-live { margin-top: 7px; padding: 6px 8px; border-radius: 10px; }
          .timer { font-size: 15px; }
          .amt { font-size: 12.5px; }
          .dev-remain { font-size: 9.5px; margin-top: 1px; }
          .bar { height: 3px; margin-bottom: 6px; }
          .dev-btns { margin-top: 7px; gap: 6px; }
          .dev-btns .btn { padding: 6px 5px; font-size: 11.5px; border-radius: 9px; gap: 5px; }
          .tad { padding: 6px 9px; border-radius: 11px; }
          .tad-ico { width: 29px; height: 29px; border-radius: 9px; }
          .tad-name { font-size: 12.5px; }
          .tad-sub { font-size: 10.5px; }
          .tad-amt { font-size: 12.5px; }
          .tad-list { gap: 6px; }
          .bottom-menu { padding: 8px 12px; }
          .bm { padding: 9px 11px; border-radius: 12px; }
        }
        @media (min-width: 1101px) and (max-height: 820px) {
          .page-sub { display: none; }
          .chart-val { display: none; }
          .chart { height: 84px; }
          .kpi-val { font-size: 20px; }
        }
        @media (min-width: 1101px) {
          .home-layout .col-side .panel { padding: 10px 11px; }
          .home-layout .col-side .panel-title { font-size: 13px; }
          .home-layout .col-side .chart { height: 76px; }
          .home-layout .col-side .chart-val { display: none; }
          .home-layout .col-side .tad-ico { width: 26px; height: 26px; }
          .home-layout .col-side .tad { padding: 5px 8px; gap: 8px; }

          /* 4 ta qurilmaga mo'ljallangan katta kartalar — panjara balandligi HAR DOIM mavjud joyga qattiq cheklanadi,
             shunda seans ochilib karta kattalashganda ham butun sahifa emas, faqat shu panjara ichida joylashadi */
          .home-layout .dev-grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, minmax(0,1fr)); height: 100%; gap: 10px; }
          .home-layout .dev-grid .dev { padding: 12px 16px; border-radius: 16px; display: flex; flex-direction: column; justify-content: center; min-height: 0; overflow: hidden; }
          .home-layout .dev-grid .dev-btns { margin-top: auto; }
          .home-layout .dev-grid .dev-top { gap: 14px; }
          .home-layout .dev-grid .screen { width: 76px; height: 58px; border-radius: 12px; }
          .home-layout .dev-grid .screen svg { width: 32px; height: 32px; }
          .home-layout .dev-grid .screen-stand { width: 22px; height: 5px; bottom: -6px; }
          .home-layout .dev-grid .dev-name { font-size: 16px; }
          .home-layout .dev-grid .dev-status { font-size: 12px; margin-top: 2px; }
          .home-layout .dev-grid .dot { width: 7px; height: 7px; }
          .home-layout .dev-grid .dev-meta { font-size: 11px; margin-top: 2px; }
          .home-layout .dev-grid .vip-tag { font-size: 9px; padding: 2px 6px; }
          .home-layout .dev-grid .dev-live { margin-top: 8px; padding: 7px 10px; border-radius: 10px; }
          .home-layout .dev-grid .bar { height: 4px; margin-bottom: 5px; border-radius: 100px; }
          .home-layout .dev-grid .timer { font-size: 16px; }
          .home-layout .dev-grid .amt { font-size: 13px; }
          .home-layout .dev-grid .dev-remain { font-size: 10px; margin-top: 2px; }
          .home-layout .dev-grid .dev-btns { gap: 8px; padding-top: 8px; }
          .home-layout .dev-grid .dev-btns .btn { padding: 7px 8px; font-size: 12px; border-radius: 9px; gap: 5px; }
        }
      `}</style>

      {/* ============ TOP BAR ============ */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-ico"><Gamepad2 size={22} color="#fff" strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">PS Klub</div>
            <div className="brand-sub">O'yinlar. Do'stlar. Zo'r kayfiyat!</div>
          </div>
        </div>
        <div className="topbar-sp" />
        <div className="clock">
          <div className="clock-t mono">{timeStr}</div>
          <div className="clock-d">{dateStr}</div>
        </div>
        {notifPermission === 'granted' ? (
          <div className="who">
            <Bell size={13} color="#4ade80" />
            <div>
              <div className="who-name">Admin</div>
              <div className="who-st"><span className="dot live" /> Onlayn</div>
            </div>
          </div>
        ) : (
          <button onClick={requestNotifications} className="who" style={{ cursor: 'pointer', fontFamily: 'inherit', color: '#fcd34d', borderColor: 'rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.12)' }}>
            <Bell size={13} /> <span style={{ fontSize: 12, fontWeight: 700 }}>Xabarni yoqish</span>
          </button>
        )}
      </div>

      <div className="page">
        {/* ============ HOME ============ */}
        {view === 'home' && (
          <>
            <div className="page-head">
              <div className="page-title">PS Klub — Boshqaruv paneli</div>
              <div className="page-sub">Klub faoliyatini qulay boshqaring va barcha jarayonlarni nazorat qiling</div>
            </div>

            <div className="kpis">
              <div className="kpi fade-up fade-up-1" style={{ background: 'linear-gradient(135deg,#6d28d9,#8b5cf6)' }}>
                <div className="kpi-row"><div className="kpi-ico"><Users size={16} color="#fff" /></div><div className="kpi-lbl">Bugungi seanslar</div></div>
                <div className="kpi-val">{stats.today.count}</div>
                <div className="kpi-foot"><Clock size={11} /> Kechagi: {stats.yesterday.count}</div>
              </div>
              <div className="kpi fade-up fade-up-2" style={{ background: 'linear-gradient(135deg,#15803d,#22c55e)' }}>
                <div className="kpi-row"><div className="kpi-ico"><Zap size={16} color="#fff" /></div><div className="kpi-lbl">Faol seanslar</div></div>
                <div className="kpi-val">{runningDevices.length}</div>
                <div className="kpi-foot">{runningDevices.length > 0 ? 'Hozirda o\'yin ketmoqda' : 'Hammasi bo\'sh'}</div>
              </div>
              <div className="kpi fade-up fade-up-3" style={{ background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' }}>
                <div className="kpi-row"><div className="kpi-ico"><Timer size={16} color="#fff" /></div><div className="kpi-lbl">Bugungi o'yin soatlari</div></div>
                <div className="kpi-val">{stats.today.hours.toFixed(1)}</div>
                <div className="kpi-foot"><Gamepad2 size={11} /> {devices.length} qurilma · {linkedDevices} TV</div>
              </div>
              <div className="kpi fade-up fade-up-4" style={{ background: 'linear-gradient(135deg,#c2410c,#f59e0b)' }}>
                <div className="kpi-row"><div className="kpi-ico"><Wallet size={16} color="#fff" /></div><div className="kpi-lbl">Bugungi tushum</div></div>
                <div className="kpi-val">{formatShort(stats.today.total)}</div>
                <div className="kpi-foot">
                  {dayDiff !== null ? <><TrendingUp size={11} /> {dayDiff > 0 ? '+' : ''}{dayDiff}% kechagiga nisbatan</> : 'so\'m'}
                </div>
              </div>
            </div>

            <div className="layout fit home-layout">
              <div className="col">
                <section className="panel grow">
                  <div className="panel-head">
                    <div className="panel-title"><LayoutGrid size={16} color="#38bdf8" /> PS zallar holati</div>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <span className="badge badge-green">{runningDevices.length} band</span>
                      <span className="badge badge-blue">{devices.filter(d => !d.running && !d.maintenance).length} bo'sh</span>
                    </div>
                  </div>
                  <div className="scroll">
                    <div className="dev-grid">
                      {devices.map((d, i) => (
                        <DeviceCard
                          key={d.id} device={d} idx={i} tariffs={tariffs}
                          deviceStatus={deviceStatus} getRemainingTime={getRemainingTime}
                          getProgress={getProgress} getCurrentAmount={getCurrentAmount}
                          formatDuration={formatDuration} formatShort={formatShort}
                          stopDevice={stopDevice} setEditingDevice={setEditingDevice}
                          setShowTimerSetup={setShowTimerSetup}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}

        {/* ============ DEVICES ============ */}
        {view === 'devices' && (
          <>
            <div className="page-head">
              <div className="page-title"><Gamepad2 size={22} color="#38bdf8" /> Qurilmalar</div>
              <div className="page-sub">Barcha PS qurilmalari va ularning holati</div>
            </div>
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Barcha qurilmalar ({devices.length})</div>
                <button className="btn btn-primary sm" onClick={() => setShowAddDevice(true)}><Plus size={14} /> Qurilma qo'shish</button>
              </div>
              <div className="dev-grid">
                {devices.map((d, i) => (
                  <DeviceCard
                    key={d.id} device={d} idx={i} tariffs={tariffs}
                    deviceStatus={deviceStatus} getRemainingTime={getRemainingTime}
                    getProgress={getProgress} getCurrentAmount={getCurrentAmount}
                    formatDuration={formatDuration} formatShort={formatShort}
                    stopDevice={stopDevice} setEditingDevice={setEditingDevice}
                    setShowTimerSetup={setShowTimerSetup}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {/* ============ TARIFFS ============ */}
        {view === 'tariffs' && (
          <>
            <div className="page-head">
              <div className="page-title"><DollarSign size={22} color="#f472b6" /> Tariflar</div>
              <div className="page-sub">Soatlik narxlarni boshqaring</div>
            </div>
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Tariflar ro'yxati ({tariffs.length})</div>
                <button className="btn btn-primary sm" onClick={() => setShowAddTariff(true)}><Plus size={14} /> Yangi tarif</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '10px' }}>
                {tariffs.map((t, idx) => (
                  <div key={t.id} className={`dev fade-up fade-up-${Math.min(idx + 1, 6)}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'rgba(236,72,153,0.3)' }}>
                    <div>
                      <div className="dev-name">{t.name}</div>
                      <div style={{ fontSize: 13, color: '#f9a8d4', fontWeight: 700, marginTop: 4 }}>
                        {formatMoney(t.pricePerHour)}<span style={{ color: '#7f93b8', fontWeight: 500 }}> / soat</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <button className="icon-btn" onClick={() => setEditingTariff(t)}><Edit2 size={14} /></button>
                      <button className="icon-btn" style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => removeTariff(t.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ============ STATS ============ */}
        {view === 'stats' && (
          <>
            <div className="page-head">
              <div className="page-title"><BarChart3 size={22} color="#fbbf24" /> Hisobot</div>
              <div className="page-sub">Daromad va qurilmalar bo'yicha to'liq ma'lumot</div>
            </div>
            <div className="kpis">
              <div className="kpi" style={{ background: 'linear-gradient(135deg,#15803d,#22c55e)' }}>
                <div className="kpi-lbl">Bugun</div>
                <div className="kpi-val">{formatShort(stats.today.total)}</div>
                <div className="kpi-foot">{stats.today.count} seans</div>
              </div>
              <div className="kpi" style={{ background: 'linear-gradient(135deg,#6d28d9,#a855f7)' }}>
                <div className="kpi-lbl">Haftalik</div>
                <div className="kpi-val">{formatShort(stats.week.total)}</div>
                <div className="kpi-foot">{stats.week.count} seans</div>
              </div>
              <div className="kpi" style={{ background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' }}>
                <div className="kpi-lbl">Oylik</div>
                <div className="kpi-val">{formatShort(stats.month.total)}</div>
                <div className="kpi-foot">{stats.month.count} seans</div>
              </div>
              <div className="kpi" style={{ background: 'linear-gradient(135deg,#c2410c,#f59e0b)' }}>
                <div className="kpi-lbl">Umumiy</div>
                <div className="kpi-val">{formatShort(stats.all.total)}</div>
                <div className="kpi-foot">{stats.all.hours.toFixed(0)} soat o'yin</div>
              </div>
            </div>

            <div className="layout">
              <div className="col">
                <section className="panel">
                  <div className="panel-head"><div className="panel-title">Qurilmalar bo'yicha</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {devices.map(d => {
                      const ds = calcDeviceStats(d.id);
                      return (
                        <div key={d.id} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 13 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{d.name}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                            {[
                              { label: 'Kunlik', val: ds.today, color: '#4ade80' },
                              { label: 'Haftalik', val: ds.week, color: '#c084fc' },
                              { label: 'Oylik', val: ds.month, color: '#60a5fa' },
                            ].map((s, i) => (
                              <div key={i} style={{ padding: 9, background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="cell-label">{s.label}</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: s.color, marginTop: 3 }}>{formatShort(s.val)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {sessions.length > 0 && (
                  <section className="panel">
                    <div className="panel-head"><div className="panel-title">So'nggi seanslar</div></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {sessions.slice(0, 15).map(s => (
                        <div key={s.id} className="tad">
                          <div className="tad-ico" style={{ borderColor: 'rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.12)' }}>
                            <CheckCircle2 size={15} color="#60a5fa" />
                          </div>
                          <div className="tad-mid">
                            <div className="tad-name">
                              {s.deviceName}
                              <span style={{ color: '#7f93b8', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>{s.tariffName}</span>
                              {s.vip && <span className="vip-tag">VIP</span>}
                            </div>
                            <div className="tad-sub">
                              {new Date(s.endTime).toLocaleString('uz-UZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {formatDuration(s.durationMs)}
                            </div>
                          </div>
                          <div className="tad-amt">{formatShort(s.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
              <div className="col">
                <WeeklyPanel chart={chart} chartMax={chartMax} formatMoney={formatMoney} formatShort={formatShort} stats={stats} setView={setView} />
                <TodayActivePanel todayActiveDevices={todayActiveDevices} deviceStatus={deviceStatus} formatDuration={formatDuration} formatShort={formatShort} setView={setView} />
              </div>
            </div>
          </>
        )}

        {/* ============ SETTINGS ============ */}
        {view === 'settings' && (
          <>
            <div className="page-head">
              <div className="page-title"><Settings size={22} color="#94a3b8" /> Sozlamalar</div>
              <div className="page-sub">Xabarnomalar va TV (Tuya Smart Plug) bog'lanishi</div>
            </div>
            <div className="layout">
              <div className="col">
                <section className="panel">
                  <div className="panel-head"><div className="panel-title"><Tv size={16} color="#38bdf8" /> Qurilmalar va TV bog'lanishi</div></div>
                  <div style={{ fontSize: 12, color: '#7f93b8', marginBottom: 12, lineHeight: 1.55 }}>
                    Har bir PS qurilmasi uchun Tuya Smart Plug Device ID kiriting. Seans boshlanganda TV avtomatik yoqiladi, tugaganda o'chadi.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10 }}>
                    {devices.map(d => (
                      <div key={d.id} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                          {d.maintenance ? (
                            <span className="badge" style={{ color: '#fda4af', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)' }}>Texnik xizmat</span>
                          ) : d.tuyaDeviceId ? (
                            <span className="badge badge-green">TV ulangan</span>
                          ) : (
                            <span className="badge" style={{ color: '#fcd34d', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}>Sozlanmagan</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 7 }}>
                          <button className="btn btn-ghost sm" onClick={() => setEditingDevice(d)}><Settings size={13} /> Sozlash</button>
                          <button className="icon-btn" style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.25)' }} onClick={() => removeDevice(d.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary wide" style={{ marginTop: 12 }} onClick={() => setShowAddDevice(true)}><Plus size={15} /> Yangi qurilma qo'shish</button>
                </section>
              </div>
              <div className="col">
                <section className="panel">
                  <div className="panel-head"><div className="panel-title"><Bell size={16} color="#a78bfa" /> Xabarnomalar</div></div>
                  <div style={{ fontSize: 13, color: '#93a7c9', marginBottom: 12, lineHeight: 1.55 }}>
                    Vaqt tugaganda tizim xabarnomasi chiqadi (ilova yopiq bo'lsa ham).
                  </div>
                  {notifPermission === 'granted' ? (
                    <div style={{ padding: 11, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', borderRadius: 12, color: '#86efac', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                      ✓ Xabarnomalar yoqilgan
                    </div>
                  ) : (
                    <button onClick={requestNotifications} className="btn btn-primary wide"><Bell size={15} /> Xabarnomalarni yoqish</button>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-head"><div className="panel-title"><Activity size={16} color="#4ade80" /> Tizim holati</div></div>
                  <div className="tad-list">
                    <div className="tad"><div className="tad-mid"><div className="tad-name">Qurilmalar</div></div><div className="tad-amt" style={{ color: '#93c5fd' }}>{devices.length} ta</div></div>
                    <div className="tad"><div className="tad-mid"><div className="tad-name">TV bog'langan</div></div><div className="tad-amt" style={{ color: '#93c5fd' }}>{linkedDevices} ta</div></div>
                    <div className="tad"><div className="tad-mid"><div className="tad-name">Texnik xizmatda</div></div><div className="tad-amt" style={{ color: '#fda4af' }}>{devices.filter(d => d.maintenance).length} ta</div></div>
                    <div className="tad"><div className="tad-mid"><div className="tad-name">Jami seanslar</div></div><div className="tad-amt">{sessions.length} ta</div></div>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ============ BOTTOM MENU ============ */}
      <div className="bottom-menu">
        <div className="bm-row">
          {MENU.map(m => {
            const Icon = m.icon;
            const on = view === m.id;
            return (
              <button key={m.id} className={`bm ${on ? 'on' : ''}`} style={{ background: m.g }} onClick={() => setView(m.id)}>
                <Icon size={18} color="#fff" strokeWidth={on ? 2.4 : 2} />
                <div className="bm-txt">
                  <div className="bm-lbl">{m.label}</div>
                  <div className="bm-sub">{m.id === 'home' ? `${runningDevices.length} ta band` : m.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============ MODALS ============ */}
      {showAddDevice && <Modal onClose={() => setShowAddDevice(false)} title="Yangi qurilma"><AddDeviceForm onAdd={(name) => { addDevice(name); setShowAddDevice(false); }} /></Modal>}
      {showAddTariff && <Modal onClose={() => setShowAddTariff(false)} title="Yangi tarif"><TariffForm onSave={(name, price) => { addTariff(name, price); setShowAddTariff(false); }} /></Modal>}
      {editingTariff && <Modal onClose={() => setEditingTariff(null)} title="Tarifni tahrirlash"><TariffForm initial={editingTariff} onSave={(name, price) => { updateTariff(editingTariff.id, name, price); setEditingTariff(null); }} /></Modal>}
      {showTimerSetup && <Modal onClose={() => setShowTimerSetup(null)} title="Seansni boshlash"><TimerSetupForm tariffs={tariffs} onStart={(tariffId, minutes) => { startDevice(showTimerSetup, tariffId, minutes); setShowTimerSetup(null); }} /></Modal>}
      {editingDevice && (
        <Modal onClose={() => setEditingDevice(null)} title={`${editingDevice.name} sozlamalari`}>
          <DeviceSettingsForm device={editingDevice} onSave={(updates) => { updateDevice(editingDevice.id, updates); setEditingDevice(null); }} />
        </Modal>
      )}

      {showCompleteSession && (
        <Modal onClose={() => setShowCompleteSession(null)} title="✓ Seans yakunlandi">
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 14, color: '#93a7c9', marginBottom: 4, fontWeight: 500 }}>
              {showCompleteSession.deviceName} · {showCompleteSession.tariffName}
            </div>
            <div className="mono" style={{ fontSize: 14, color: '#93c5fd', marginBottom: 18, fontWeight: 600 }}>
              {formatDuration(showCompleteSession.durationMs)}
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.06))', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '26px 18px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8, fontWeight: 700 }}>Jami summa</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: '#86efac', letterSpacing: '-0.03em' }}>
                {formatMoney(showCompleteSession.amount)}
              </div>
            </div>
            <button onClick={() => setShowCompleteSession(null)} className="btn btn-primary wide">Yopish</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DeviceScreen({ status }) {
  return (
    <div className="screen" data-st={status.key}>
      <div className="screen-glow" />
      <Gamepad2 size={26} color="rgba(255,255,255,0.85)" strokeWidth={1.6} />
      <div className="screen-stand" />
    </div>
  );
}

function DeviceCard({
  device, idx, tariffs, deviceStatus, getRemainingTime, getProgress, getCurrentAmount,
  formatDuration, formatShort, stopDevice, setEditingDevice, setShowTimerSetup,
}) {
  const st = deviceStatus(device);
  const tariff = tariffs.find(t => t.id === device.tariffId);
  const remaining = getRemainingTime(device);
  const elapsedMs = device.running ? Date.now() - device.startTime : 0;
  const progress = getProgress(device);
  const hasTV = !!device.tuyaDeviceId;

  return (
    <div className={`dev st-${st.key} fade-up fade-up-${Math.min(idx + 1, 6)}`}>
      <div className="dev-top">
        <DeviceScreen status={st} />
        <div className="dev-info">
          <div className="dev-name">
            {device.name}
            {device.running && device.vip && <span className="vip-tag">VIP</span>}
          </div>
          <div className="dev-status" style={{ color: st.color }}>
            <span className="dot" style={{ background: st.color, boxShadow: `0 0 10px ${st.color}` }} />
            {st.text}
          </div>
          <div className="dev-meta">
            <span>{tariff ? tariff.name : 'Tarif: —'}</span>
            <span className="dev-meta-sep">·</span>
            {hasTV ? <><Wifi size={11} /> TV</> : <><WifiOff size={11} /> TV yo'q</>}
          </div>
        </div>
      </div>

      {device.running && (
        <div className="dev-live">
          {device.scheduledMinutes ? (
            <div className="bar"><div className="bar-fill" style={{ width: `${progress}%`, background: device.alerted ? 'linear-gradient(90deg,#ef4444,#dc2626)' : 'linear-gradient(90deg,#22c55e,#16a34a)' }} /></div>
          ) : null}
          <div className="dev-live-row">
            <span className="mono timer" style={{ color: device.alerted ? '#fca5a5' : (device.vip ? '#fcd34d' : '#6ee7b7') }}>{formatDuration(elapsedMs)}</span>
            <span className="amt">{formatShort(getCurrentAmount(device))}</span>
          </div>
          <div className="dev-remain mono">
            {device.alerted ? '⏰ Vaqt tugadi' : (remaining !== null ? `Qolgan: ${formatDuration(Math.max(0, remaining))}` : 'VIP · vaqt chegarasiz')}
          </div>
        </div>
      )}

      <div className="dev-btns">
        {device.running ? (
          <>
            <button className="btn btn-danger" onClick={() => stopDevice(device.id)}><Square size={13} fill="white" /> To'xtatish</button>
            <button className="btn btn-ghost" onClick={() => setEditingDevice(device)}><Settings size={13} /> Ma'lumot</button>
          </>
        ) : (
          <>
            <button
              className="btn btn-success"
              disabled={device.maintenance}
              onClick={() => { if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; } setShowTimerSetup(device.id); }}
            >
              <Play size={13} fill="white" /> Boshlash
            </button>
            <button className="btn btn-ghost" onClick={() => setEditingDevice(device)}><Settings size={13} /> Ma'lumot</button>
          </>
        )}
      </div>
    </div>
  );
}

function TodayActivePanel({ todayActiveDevices, deviceStatus, formatDuration, formatShort, setView }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title"><Activity size={16} color="#60a5fa" /> Bugungi faol qurilmalar</div>
        <button className="link" onClick={() => setView('stats')}>Barchasi →</button>
      </div>
      {todayActiveDevices.length === 0 ? (
        <div className="empty sm"><Calendar size={22} color="#3b4a6b" /><div>Bugun hali seans bo'lmadi</div></div>
      ) : (
        <div className="tad-list">
          {todayActiveDevices.map(({ device, count, total, ms }) => {
            const st = deviceStatus(device);
            return (
              <div key={device.id} className="tad">
                <div className="tad-ico" style={{ borderColor: `${st.color}55`, background: `${st.color}18` }}>
                  <Gamepad2 size={16} color={st.color} />
                </div>
                <div className="tad-mid">
                  <div className="tad-name">
                    {device.name}
                    {device.running && <span className="dot live" style={{ marginLeft: 8 }} />}
                  </div>
                  <div className="tad-sub">{count} seans · {formatDuration(ms)}</div>
                </div>
                <div className="tad-amt">{formatShort(total)}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WeeklyPanel({ chart, chartMax, formatMoney, formatShort, stats, setView }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title"><BarChart3 size={16} color="#a78bfa" /> Haftalik statistika</div>
        <button className="link" onClick={() => setView('stats')}>Barchasi →</button>
      </div>
      <div className="chart">
        {chart.map((c, i) => (
          <div key={i} className="chart-col" title={`${c.label}: ${formatMoney(c.total)}`}>
            <div className="chart-val">{c.total > 0 ? formatShort(c.total) : ''}</div>
            <div className="chart-track">
              <div
                className={`chart-bar ${c.isToday ? 'today' : ''}`}
                style={{ height: `${Math.max(4, (c.total / chartMax) * 100)}%` }}
              />
            </div>
            <div className={`chart-lbl ${c.isToday ? 'today' : ''}`}>{c.short}</div>
          </div>
        ))}
      </div>
      <div className="chart-foot">
        <span>Haftalik jami</span>
        <strong>{formatMoney(stats.week.total)}</strong>
      </div>
    </section>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
          <button onClick={onClose} className="icon-btn"><X size={16} /></button>
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
      <label className="flabel">Qurilma nomi</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="masalan: PS 7" className="finput" style={{ marginBottom: 16 }} />
      <button onClick={() => name.trim() && onAdd(name.trim())} disabled={!name.trim()} className="btn btn-primary wide">Qo'shish</button>
    </div>
  );
}

function TariffForm({ onSave, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.pricePerHour?.toString() || '');
  return (
    <div>
      <label className="flabel">Tarif nomi</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="masalan: Oddiy" className="finput" style={{ marginBottom: 13 }} />
      <label className="flabel">1 soat narxi (so'm)</label>
      <input type="number" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} placeholder="20000" className="finput" style={{ marginBottom: 16 }} />
      <button
        onClick={() => { const p = parseInt(price); if (name.trim() && p > 0) onSave(name.trim(), p); }}
        disabled={!name.trim() || !parseInt(price)}
        className="btn btn-primary wide"
      >Saqlash</button>
    </div>
  );
}

function TimerSetupForm({ tariffs, onStart }) {
  const [tariffId, setTariffId] = useState(tariffs[0]?.id || '');
  const [minutes, setMinutes] = useState(60);
  const [mode, setMode] = useState('timed'); // 'timed' | 'vip'
  const presets = [30, 60, 90, 120];
  const tariff = tariffs.find(t => t.id === tariffId);
  const vip = mode === 'vip';

  return (
    <div>
      <label className="flabel">Seans turi</label>
      <div className="mode-row">
        <button className={`mode ${!vip ? 'on timed' : ''}`} onClick={() => setMode('timed')}>
          <Clock size={17} />
          <div>
            <div className="mode-t">Vaqt bilan</div>
            <div className="mode-s">Belgilangan vaqtda tugaydi</div>
          </div>
        </button>
        <button className={`mode ${vip ? 'on vip' : ''}`} onClick={() => setMode('vip')}>
          <Crown size={17} />
          <div>
            <div className="mode-t">VIP</div>
            <div className="mode-s">Vaqt belgilanmaydi, hisoblab boradi</div>
          </div>
        </button>
      </div>

      <label className="flabel">Tarif</label>
      <select value={tariffId} onChange={e => setTariffId(e.target.value)} className="finput" style={{ marginBottom: 16 }}>
        {tariffs.map(t => <option key={t.id} value={t.id}>{t.name} — {new Intl.NumberFormat('uz-UZ').format(t.pricePerHour)} so'm/soat</option>)}
      </select>

      {!vip ? (
        <>
          <label className="flabel">Vaqt</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 9 }}>
            {presets.map(p => (
              <button
                key={p}
                onClick={() => setMinutes(p)}
                style={{
                  padding: '11px 6px', borderRadius: 12,
                  background: minutes === p ? 'linear-gradient(135deg,#2563eb,#0ea5e9)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid ' + (minutes === p ? 'transparent' : 'rgba(255,255,255,0.09)'),
                  color: '#e5edff', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                }}
              >
                {p < 60 ? `${p} daq` : `${p / 60} soat`}
              </button>
            ))}
          </div>
          <input type="number" inputMode="numeric" value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 0)} className="finput" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 12, color: '#93a7c9', marginBottom: 16, padding: '0 2px' }}>
            Taxminiy summa: <strong style={{ color: '#fff' }}>
              {tariff ? new Intl.NumberFormat('uz-UZ').format(Math.round((minutes / 60) * tariff.pricePerHour)) : 0} so'm
            </strong>
          </div>
        </>
      ) : (
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)', borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <Crown size={18} color="#fbbf24" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: '#fcd34d', lineHeight: 1.55, fontWeight: 500 }}>
            VIP rejimda aniq vaqt belgilanmaydi. Taymer va summa doimiy hisoblanib boradi, seans "To'xtatish" bosilganda yakunlanadi.
            {tariff && <div style={{ marginTop: 5, color: '#fff', fontWeight: 700 }}>{new Intl.NumberFormat('uz-UZ').format(tariff.pricePerHour)} so'm / soat</div>}
          </div>
        </div>
      )}

      <button
        onClick={() => { if (!tariffId) return; if (vip) onStart(tariffId, null, true); else if (minutes > 0) onStart(tariffId, minutes, false); }}
        disabled={!tariffId || (!vip && !minutes)}
        className={vip ? 'btn btn-warn wide' : 'btn btn-success wide'}
      >
        <Play size={16} fill="white" /> {vip ? 'VIP seansni boshlash' : 'Boshlash'}
      </button>
    </div>
  );
}

function DeviceSettingsForm({ device, onSave }) {
  const [name, setName] = useState(device.name);
  const [tuyaDeviceId, setTuyaDeviceId] = useState(device.tuyaDeviceId || '');
  const [tvAutoControl, setTvAutoControl] = useState(device.tvAutoControl !== false);
  const [maintenance, setMaintenance] = useState(!!device.maintenance);
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
      <label className="flabel">Qurilma nomi</label>
      <input value={name} onChange={e => setName(e.target.value)} className="finput" style={{ marginBottom: 16 }} />

      <label className="flabel">Tuya Smart Plug Device ID</label>
      <input
        value={tuyaDeviceId}
        onChange={e => setTuyaDeviceId(e.target.value.trim())}
        placeholder="masalan: bf1234abcd..."
        className="finput"
        style={{ marginBottom: 7, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}
      />
      <div style={{ fontSize: 11, color: '#7f93b8', marginBottom: 13, lineHeight: 1.5 }}>
        Tuya IoT Platform → Devices → Device ID ni nusxalab qo'ying
      </div>

      {tuyaDeviceId && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 11 }}>
            <button onClick={() => testConnection('on')} disabled={testing} className="btn btn-success sm"><Power size={13} /> ON test</button>
            <button onClick={() => testConnection('off')} disabled={testing} className="btn btn-danger sm"><Power size={13} /> OFF test</button>
          </div>
          {testResult === 'success' && (
            <div style={{ padding: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, color: '#86efac', fontSize: 12, marginBottom: 13, fontWeight: 700, textAlign: 'center' }}>
              ✓ TV bilan aloqa muvaffaqiyatli!
            </div>
          )}
          {testResult === 'error' && (
            <div style={{ padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5', fontSize: 12, marginBottom: 13, fontWeight: 700, textAlign: 'center' }}>
              ✗ Xatolik. Device ID va API kalitlarni tekshiring.
            </div>
          )}
        </>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 13, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={tvAutoControl} onChange={e => setTvAutoControl(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#0ea5e9' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>TV avtomatik boshqaruvi</div>
          <div style={{ fontSize: 11, color: '#7f93b8', marginTop: 2 }}>Boshlash/To'xtatish paytida TV avtomatik yoq/o'ch</div>
        </div>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 13, background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 12, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={maintenance} onChange={e => setMaintenance(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#f43f5e' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={13} color="#fda4af" /> Texnik xizmat holati</div>
          <div style={{ fontSize: 11, color: '#7f93b8', marginTop: 2 }}>Yoqilsa, bu qurilmada seans boshlab bo'lmaydi</div>
        </div>
      </label>

      <button onClick={() => onSave({ name: name.trim() || device.name, tuyaDeviceId, tvAutoControl, maintenance })} className="btn btn-primary wide">
        Saqlash
      </button>
    </div>
  );
}
