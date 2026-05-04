import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Plus, Trash2, Settings, BarChart3, Clock, DollarSign, Gamepad2, X, Edit2, Bell, Calendar, TrendingUp } from 'lucide-react';

export default function PlayStationClub() {
  // ==================== STATE ====================
  const [view, setView] = useState('devices'); // devices, tariffs, stats, settings
  const [devices, setDevices] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [sessions, setSessions] = useState([]); // completed sessions log
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddTariff, setShowAddTariff] = useState(false);
  const [showTimerSetup, setShowTimerSetup] = useState(null); // device id when setting timer
  const [showCompleteSession, setShowCompleteSession] = useState(null); // session result modal
  const [editingTariff, setEditingTariff] = useState(null);
  const [, forceUpdate] = useState(0);
  const audioCtxRef = useRef(null);

  // ==================== STORAGE LOAD ====================
  useEffect(() => {
    (async () => {
      try {
        const dRes = await window.storage.get('devices');
        if (dRes) setDevices(JSON.parse(dRes.value));
        else {
          const initial = Array.from({length: 6}, (_, i) => ({
            id: `dev_${Date.now()}_${i}`,
            name: `PS ${i+1}`,
            running: false,
            startTime: null,
            tariffId: null,
            scheduledMinutes: null, // for timed sessions
            alerted: false,
          }));
          setDevices(initial);
          await window.storage.set('devices', JSON.stringify(initial));
        }
      } catch (e) {
        const initial = Array.from({length: 6}, (_, i) => ({
          id: `dev_${Date.now()}_${i}`,
          name: `PS ${i+1}`,
          running: false,
          startTime: null,
          tariffId: null,
          scheduledMinutes: null,
          alerted: false,
        }));
        setDevices(initial);
      }

      try {
        const tRes = await window.storage.get('tariffs');
        if (tRes) setTariffs(JSON.parse(tRes.value));
        else {
          const initial = [
            { id: 't1', name: 'Oddiy', pricePerHour: 20000 },
            { id: 't2', name: 'Premium', pricePerHour: 30000 },
          ];
          setTariffs(initial);
          await window.storage.set('tariffs', JSON.stringify(initial));
        }
      } catch (e) {
        setTariffs([
          { id: 't1', name: 'Oddiy', pricePerHour: 20000 },
          { id: 't2', name: 'Premium', pricePerHour: 30000 },
        ]);
      }

      try {
        const sRes = await window.storage.get('sessions');
        if (sRes) setSessions(JSON.parse(sRes.value));
      } catch (e) {}
    })();
  }, []);

  // ==================== AUTOSAVE ====================
  const saveDevices = async (newDevices) => {
    setDevices(newDevices);
    try { await window.storage.set('devices', JSON.stringify(newDevices)); } catch(e) {}
  };
  const saveTariffs = async (newTariffs) => {
    setTariffs(newTariffs);
    try { await window.storage.set('tariffs', JSON.stringify(newTariffs)); } catch(e) {}
  };
  const saveSessions = async (newSessions) => {
    setSessions(newSessions);
    try { await window.storage.set('sessions', JSON.stringify(newSessions)); } catch(e) {}
  };

  // ==================== TICKER (live timer + alarm trigger) ====================
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(n => n+1);
      // Check scheduled sessions
      devices.forEach(d => {
        if (d.running && d.scheduledMinutes && !d.alerted) {
          const elapsedMs = Date.now() - d.startTime;
          const targetMs = d.scheduledMinutes * 60 * 1000;
          if (elapsedMs >= targetMs) {
            triggerAlarm(d);
          }
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [devices]);

  // ==================== ALARM (sound + vibrate + visual) ====================
  const triggerAlarm = (device) => {
    // Mark alerted
    const updated = devices.map(d => d.id === device.id ? {...d, alerted: true} : d);
    setDevices(updated);
    window.storage.set('devices', JSON.stringify(updated)).catch(()=>{});

    // Sound (Web Audio API beeping pattern)
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const playBeep = (when, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + when);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + when + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + when + 0.4);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + 0.45);
      };
      for (let i = 0; i < 3; i++) {
        playBeep(i * 0.5, 880);
        playBeep(i * 0.5 + 0.2, 1100);
      }
    } catch(e) {}

    // Vibration
    try {
      if (navigator.vibrate) {
        navigator.vibrate([300, 150, 300, 150, 600]);
      }
    } catch(e) {}
  };

  // ==================== DEVICE CONTROLS ====================
  const startDevice = (deviceId, tariffId, minutes = null) => {
    const updated = devices.map(d => d.id === deviceId ? {
      ...d,
      running: true,
      startTime: Date.now(),
      tariffId,
      scheduledMinutes: minutes,
      alerted: false,
    } : d);
    saveDevices(updated);
  };

  const stopDevice = (deviceId) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.running) return;
    const tariff = tariffs.find(t => t.id === device.tariffId);
    if (!tariff) return;

    const elapsedMs = Date.now() - device.startTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const amount = Math.round(elapsedHours * tariff.pricePerHour);

    // Save session
    const session = {
      id: `s_${Date.now()}`,
      deviceId,
      deviceName: device.name,
      tariffName: tariff.name,
      pricePerHour: tariff.pricePerHour,
      startTime: device.startTime,
      endTime: Date.now(),
      durationMs: elapsedMs,
      amount,
    };
    saveSessions([session, ...sessions]);

    // Reset device
    const updated = devices.map(d => d.id === deviceId ? {
      ...d,
      running: false,
      startTime: null,
      tariffId: null,
      scheduledMinutes: null,
      alerted: false,
    } : d);
    saveDevices(updated);

    // Show summary
    setShowCompleteSession(session);
  };

  const addDevice = (name) => {
    const newDevice = {
      id: `dev_${Date.now()}`,
      name,
      running: false,
      startTime: null,
      tariffId: null,
      scheduledMinutes: null,
      alerted: false,
    };
    saveDevices([...devices, newDevice]);
  };

  const removeDevice = (deviceId) => {
    if (!confirm('Bu qurilmani o\'chirmoqchimisiz?')) return;
    saveDevices(devices.filter(d => d.id !== deviceId));
  };

  // ==================== TARIFF CONTROLS ====================
  const addTariff = (name, price) => {
    const newTariff = { id: `t_${Date.now()}`, name, pricePerHour: price };
    saveTariffs([...tariffs, newTariff]);
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

  // ==================== HELPERS ====================
  const formatMoney = (n) => {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(n)) + ' so\'m';
  };

  const formatDuration = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  const getCurrentAmount = (device) => {
    if (!device.running) return 0;
    const tariff = tariffs.find(t => t.id === device.tariffId);
    if (!tariff) return 0;
    const elapsedHours = (Date.now() - device.startTime) / (1000 * 60 * 60);
    return Math.round(elapsedHours * tariff.pricePerHour);
  };

  const getRemainingTime = (device) => {
    if (!device.running || !device.scheduledMinutes) return null;
    const elapsedMs = Date.now() - device.startTime;
    const targetMs = device.scheduledMinutes * 60 * 1000;
    const remaining = targetMs - elapsedMs;
    return remaining;
  };

  // ==================== STATS ====================
  const calcStats = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const today = sessions.filter(s => s.endTime >= todayStart);
    const week = sessions.filter(s => s.endTime >= weekStart);
    const month = sessions.filter(s => s.endTime >= monthStart);

    const sum = (arr) => arr.reduce((a,b) => a + b.amount, 0);

    return {
      today: { count: today.length, total: sum(today) },
      week: { count: week.length, total: sum(week) },
      month: { count: month.length, total: sum(month) },
      sessions,
    };
  };

  const calcDeviceStats = (deviceId) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const deviceSessions = sessions.filter(s => s.deviceId === deviceId);
    const today = deviceSessions.filter(s => s.endTime >= todayStart);
    const week = deviceSessions.filter(s => s.endTime >= weekStart);
    const month = deviceSessions.filter(s => s.endTime >= monthStart);
    const sum = (arr) => arr.reduce((a,b) => a + b.amount, 0);

    return {
      today: sum(today),
      week: sum(week),
      month: sum(month),
      total: sum(deviceSessions),
    };
  };

  const stats = calcStats();

  // ==================== RENDER ====================
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1240 50%, #2d1b4e 100%)',
      fontFamily: '"Manrope", system-ui, sans-serif',
      color: '#e8e6f3',
      paddingBottom: '90px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .card-glow {
          background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.04) 100%);
          border: 1px solid rgba(168,85,247,0.18);
          backdrop-filter: blur(10px);
        }
        .running-glow {
          background: linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(16,185,129,0.06) 100%);
          border: 1px solid rgba(34,197,94,0.4);
          box-shadow: 0 0 24px rgba(34,197,94,0.15);
        }
        .alerted-glow {
          background: linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.08) 100%);
          border: 1px solid rgba(239,68,68,0.6);
          animation: pulse-red 1s infinite;
        }
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 24px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 40px rgba(239,68,68,0.8); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .slide-up { animation: slide-up 0.3s ease-out; }
        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          color: white;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
        .btn-primary:active { transform: translateY(0); }
        .btn-danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border: none;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-success {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
          border: none;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-ghost {
          background: rgba(168,85,247,0.1);
          border: 1px solid rgba(168,85,247,0.3);
          color: #e8e6f3;
          cursor: pointer;
        }
        input, select {
          background: rgba(10,14,39,0.6);
          border: 1px solid rgba(168,85,247,0.3);
          color: #e8e6f3;
          font-family: inherit;
          outline: none;
        }
        input:focus, select:focus { border-color: #a855f7; }
        select option { background: #1a1240; }
        .nav-btn {
          flex: 1;
          background: transparent;
          border: none;
          color: #6b6b8c;
          padding: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          transition: color 0.2s;
        }
        .nav-btn.active { color: #a855f7; }
        .scrollable { overflow-y: auto; }
      `}</style>

      {/* HEADER */}
      <div style={{
        padding: '24px 20px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'linear-gradient(180deg, #0a0e27 0%, rgba(10,14,39,0.95) 80%, transparent 100%)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
          <div style={{
            width: '44px', height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
          }}>
            <Gamepad2 size={24} color="white"/>
          </div>
          <div>
            <div style={{fontSize:'20px', fontWeight:800, letterSpacing:'-0.02em'}}>PS Klub</div>
            <div style={{fontSize:'12px', color:'#8b87a8'}}>
              {view === 'devices' && 'Qurilmalar boshqaruvi'}
              {view === 'tariffs' && 'Tariflar ro\'yxati'}
              {view === 'stats' && 'Daromad statistikasi'}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{padding: '0 16px'}}>
        {view === 'devices' && (
          <div className="slide-up">
            {/* Quick stats */}
            <div className="card-glow" style={{
              borderRadius: '16px',
              padding: '14px 16px',
              marginBottom: '16px',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <div>
                <div style={{fontSize:'11px', color:'#8b87a8', textTransform:'uppercase', letterSpacing:'0.08em'}}>Bugungi daromad</div>
                <div style={{fontSize:'22px', fontWeight:800, color:'#22c55e', marginTop:'2px'}}>
                  {formatMoney(stats.today.total)}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'11px', color:'#8b87a8'}}>Faol</div>
                <div style={{fontSize:'18px', fontWeight:700}}>
                  {devices.filter(d => d.running).length} / {devices.length}
                </div>
              </div>
            </div>

            {/* Devices grid */}
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:'12px'}}>
              {devices.map(device => {
                const tariff = tariffs.find(t => t.id === device.tariffId);
                const remaining = getRemainingTime(device);
                const isAlerted = device.alerted;
                const elapsedMs = device.running ? Date.now() - device.startTime : 0;

                return (
                  <div
                    key={device.id}
                    className={isAlerted ? 'alerted-glow' : (device.running ? 'running-glow' : 'card-glow')}
                    style={{
                      borderRadius: '18px',
                      padding: '18px',
                      transition: 'all 0.3s',
                    }}
                  >
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px'}}>
                      <div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <div style={{
                            width:'10px', height:'10px', borderRadius:'50%',
                            background: device.running ? '#22c55e' : '#4b4b6b',
                            boxShadow: device.running ? '0 0 8px #22c55e' : 'none',
                          }}/>
                          <div style={{fontSize:'17px', fontWeight:700}}>{device.name}</div>
                        </div>
                        {device.running && tariff && (
                          <div style={{fontSize:'12px', color:'#8b87a8', marginTop:'4px'}}>
                            {tariff.name} · {formatMoney(tariff.pricePerHour)}/soat
                          </div>
                        )}
                        {!device.running && (
                          <div style={{fontSize:'12px', color:'#6b6b8c', marginTop:'4px'}}>Bo'sh</div>
                        )}
                      </div>
                      {!device.running && (
                        <button
                          onClick={() => removeDevice(device.id)}
                          style={{
                            background:'transparent', border:'none', color:'#6b6b8c',
                            cursor:'pointer', padding:'4px',
                          }}
                        ><Trash2 size={16}/></button>
                      )}
                    </div>

                    {device.running && (
                      <>
                        <div style={{
                          background:'rgba(0,0,0,0.3)', borderRadius:'12px', padding:'14px',
                          marginBottom:'12px', textAlign:'center',
                        }}>
                          <div style={{fontSize:'11px', color:'#8b87a8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'4px'}}>
                            {isAlerted ? '⏰ VAQT TUGADI!' : 'O\'tgan vaqt'}
                          </div>
                          <div className="mono" style={{
                            fontSize:'28px', fontWeight:700,
                            color: isAlerted ? '#ef4444' : '#22c55e',
                            letterSpacing:'-0.02em',
                          }}>
                            {formatDuration(elapsedMs)}
                          </div>
                          {remaining !== null && !isAlerted && (
                            <div style={{fontSize:'12px', color:'#a855f7', marginTop:'4px'}}>
                              Qolgan: {formatDuration(Math.max(0, remaining))}
                            </div>
                          )}
                          <div style={{
                            marginTop:'10px', paddingTop:'10px',
                            borderTop:'1px dashed rgba(168,85,247,0.2)',
                            fontSize:'13px', color:'#8b87a8',
                          }}>
                            Joriy summa
                          </div>
                          <div style={{fontSize:'20px', fontWeight:800, color:'#fff', marginTop:'2px'}}>
                            {formatMoney(getCurrentAmount(device))}
                          </div>
                        </div>
                        <button
                          onClick={() => stopDevice(device.id)}
                          className="btn-danger"
                          style={{
                            width:'100%', padding:'12px', borderRadius:'12px',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                            fontSize:'15px',
                          }}
                        >
                          <Square size={18}/> Yopish
                        </button>
                      </>
                    )}

                    {!device.running && (
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'}}>
                        <button
                          onClick={() => {
                            if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; }
                            startDevice(device.id, tariffs[0].id);
                          }}
                          className="btn-success"
                          style={{
                            padding:'12px', borderRadius:'12px',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
                            fontSize:'14px',
                          }}
                        >
                          <Play size={16}/> Ochish
                        </button>
                        <button
                          onClick={() => {
                            if (tariffs.length === 0) { alert('Avval tarif qo\'shing!'); return; }
                            setShowTimerSetup(device.id);
                          }}
                          className="btn-primary"
                          style={{
                            padding:'12px', borderRadius:'12px',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
                            fontSize:'14px',
                          }}
                        >
                          <Clock size={16}/> Vaqt
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowAddDevice(true)}
              className="btn-ghost"
              style={{
                width:'100%', padding:'14px', borderRadius:'14px',
                marginTop:'12px',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                fontSize:'14px', fontWeight:600,
              }}
            >
              <Plus size={18}/> Yangi qurilma qo'shish
            </button>
          </div>
        )}

        {view === 'tariffs' && (
          <div className="slide-up">
            <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
              {tariffs.map(t => (
                <div key={t.id} className="card-glow" style={{
                  borderRadius:'16px', padding:'16px',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                }}>
                  <div>
                    <div style={{fontSize:'16px', fontWeight:700}}>{t.name}</div>
                    <div style={{fontSize:'14px', color:'#a855f7', fontWeight:600, marginTop:'2px'}}>
                      {formatMoney(t.pricePerHour)} / soat
                    </div>
                  </div>
                  <div style={{display:'flex', gap:'8px'}}>
                    <button
                      onClick={() => setEditingTariff(t)}
                      className="btn-ghost"
                      style={{padding:'8px', borderRadius:'10px'}}
                    ><Edit2 size={16}/></button>
                    <button
                      onClick={() => removeTariff(t.id)}
                      style={{
                        background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                        color:'#ef4444', padding:'8px', borderRadius:'10px', cursor:'pointer',
                      }}
                    ><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAddTariff(true)}
              className="btn-primary"
              style={{
                width:'100%', padding:'14px', borderRadius:'14px',
                marginTop:'14px',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                fontSize:'14px',
              }}
            >
              <Plus size={18}/> Yangi tarif qo'shish
            </button>
          </div>
        )}

        {view === 'stats' && (
          <div className="slide-up">
            {/* Period summary cards */}
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:'12px', marginBottom:'20px'}}>
              {[
                {label:'Bugun', icon: Calendar, data: stats.today, color:'#22c55e'},
                {label:'Haftalik (7 kun)', icon: TrendingUp, data: stats.week, color:'#a855f7'},
                {label:'Oylik', icon: BarChart3, data: stats.month, color:'#6366f1'},
              ].map((p, i) => {
                const Icon = p.icon;
                return (
                  <div key={i} className="card-glow" style={{
                    borderRadius:'16px', padding:'18px',
                  }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                        <Icon size={18} color={p.color}/>
                        <div style={{fontSize:'13px', color:'#8b87a8', fontWeight:600}}>{p.label}</div>
                      </div>
                      <div style={{fontSize:'12px', color:'#6b6b8c'}}>{p.data.count} sessiya</div>
                    </div>
                    <div style={{fontSize:'26px', fontWeight:800, color: p.color, letterSpacing:'-0.02em'}}>
                      {formatMoney(p.data.total)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-device breakdown */}
            <div style={{fontSize:'14px', color:'#8b87a8', fontWeight:600, marginBottom:'10px', padding:'0 4px'}}>
              QURILMALAR BO'YICHA
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              {devices.map(d => {
                const dStats = calcDeviceStats(d.id);
                return (
                  <div key={d.id} className="card-glow" style={{borderRadius:'14px', padding:'14px'}}>
                    <div style={{fontSize:'15px', fontWeight:700, marginBottom:'10px'}}>{d.name}</div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px'}}>
                      <div>
                        <div style={{fontSize:'10px', color:'#6b6b8c', textTransform:'uppercase', letterSpacing:'0.05em'}}>Kunlik</div>
                        <div style={{fontSize:'13px', fontWeight:700, color:'#22c55e', marginTop:'2px'}}>
                          {formatMoney(dStats.today)}
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:'10px', color:'#6b6b8c', textTransform:'uppercase', letterSpacing:'0.05em'}}>Haftalik</div>
                        <div style={{fontSize:'13px', fontWeight:700, color:'#a855f7', marginTop:'2px'}}>
                          {formatMoney(dStats.week)}
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:'10px', color:'#6b6b8c', textTransform:'uppercase', letterSpacing:'0.05em'}}>Oylik</div>
                        <div style={{fontSize:'13px', fontWeight:700, color:'#6366f1', marginTop:'2px'}}>
                          {formatMoney(dStats.month)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent sessions */}
            {sessions.length > 0 && (
              <>
                <div style={{fontSize:'14px', color:'#8b87a8', fontWeight:600, marginTop:'24px', marginBottom:'10px', padding:'0 4px'}}>
                  SO'NGGI SESSIYALAR
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                  {sessions.slice(0, 10).map(s => (
                    <div key={s.id} className="card-glow" style={{
                      borderRadius:'12px', padding:'12px',
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                    }}>
                      <div>
                        <div style={{fontSize:'14px', fontWeight:600}}>{s.deviceName}</div>
                        <div style={{fontSize:'11px', color:'#8b87a8', marginTop:'2px'}}>
                          {new Date(s.endTime).toLocaleString('uz-UZ', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})} · {formatDuration(s.durationMs)}
                        </div>
                      </div>
                      <div style={{fontSize:'14px', fontWeight:700, color:'#22c55e'}}>
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

      {/* BOTTOM NAV */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        background:'rgba(10,14,39,0.95)',
        backdropFilter:'blur(12px)',
        borderTop:'1px solid rgba(168,85,247,0.2)',
        display:'flex',
        padding:'8px 8px 16px',
      }}>
        <button onClick={() => setView('devices')} className={`nav-btn ${view==='devices'?'active':''}`}>
          <Gamepad2 size={22}/>
          <span>Qurilmalar</span>
        </button>
        <button onClick={() => setView('tariffs')} className={`nav-btn ${view==='tariffs'?'active':''}`}>
          <DollarSign size={22}/>
          <span>Tariflar</span>
        </button>
        <button onClick={() => setView('stats')} className={`nav-btn ${view==='stats'?'active':''}`}>
          <BarChart3 size={22}/>
          <span>Statistika</span>
        </button>
      </div>

      {/* MODAL: Add Device */}
      {showAddDevice && (
        <Modal onClose={() => setShowAddDevice(false)} title="Yangi qurilma">
          <AddDeviceForm onAdd={(name) => { addDevice(name); setShowAddDevice(false); }}/>
        </Modal>
      )}

      {/* MODAL: Add Tariff */}
      {showAddTariff && (
        <Modal onClose={() => setShowAddTariff(false)} title="Yangi tarif">
          <TariffForm onSave={(name, price) => { addTariff(name, price); setShowAddTariff(false); }}/>
        </Modal>
      )}

      {/* MODAL: Edit Tariff */}
      {editingTariff && (
        <Modal onClose={() => setEditingTariff(null)} title="Tarifni tahrirlash">
          <TariffForm
            initial={editingTariff}
            onSave={(name, price) => { updateTariff(editingTariff.id, name, price); setEditingTariff(null); }}
          />
        </Modal>
      )}

      {/* MODAL: Timer Setup */}
      {showTimerSetup && (
        <Modal onClose={() => setShowTimerSetup(null)} title="Vaqt belgilash">
          <TimerSetupForm
            tariffs={tariffs}
            onStart={(tariffId, minutes) => {
              startDevice(showTimerSetup, tariffId, minutes);
              setShowTimerSetup(null);
            }}
          />
        </Modal>
      )}

      {/* MODAL: Session Complete */}
      {showCompleteSession && (
        <Modal onClose={() => setShowCompleteSession(null)} title="✓ Sessiya yakunlandi">
          <div style={{textAlign:'center', padding:'10px 0'}}>
            <div style={{fontSize:'14px', color:'#8b87a8', marginBottom:'4px'}}>
              {showCompleteSession.deviceName} · {showCompleteSession.tariffName}
            </div>
            <div style={{fontSize:'14px', color:'#a855f7', marginBottom:'18px'}}>
              {formatDuration(showCompleteSession.durationMs)}
            </div>
            <div style={{
              background:'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.08))',
              border:'1px solid rgba(34,197,94,0.3)',
              borderRadius:'16px',
              padding:'24px',
              marginBottom:'18px',
            }}>
              <div style={{fontSize:'12px', color:'#8b87a8', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'6px'}}>
                Jami summa
              </div>
              <div style={{fontSize:'34px', fontWeight:800, color:'#22c55e', letterSpacing:'-0.02em'}}>
                {formatMoney(showCompleteSession.amount)}
              </div>
            </div>
            <button
              onClick={() => setShowCompleteSession(null)}
              className="btn-primary"
              style={{width:'100%', padding:'14px', borderRadius:'12px', fontSize:'15px'}}
            >
              Yopish
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==================== MODAL COMPONENT ====================
function Modal({ children, onClose, title }) {
  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0,
        background:'rgba(0,0,0,0.7)',
        backdropFilter:'blur(4px)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
        zIndex:100,
        animation:'slide-up 0.25s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:'100%', maxWidth:'500px',
          background:'linear-gradient(180deg, #1a1240 0%, #0a0e27 100%)',
          borderTop:'1px solid rgba(168,85,247,0.3)',
          borderRadius:'24px 24px 0 0',
          padding:'20px',
          paddingBottom:'32px',
        }}
      >
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px'}}>
          <div style={{fontSize:'18px', fontWeight:700}}>{title}</div>
          <button onClick={onClose} style={{
            background:'rgba(168,85,247,0.1)', border:'none',
            width:'32px', height:'32px', borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', color:'#e8e6f3',
          }}><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ==================== ADD DEVICE FORM ====================
function AddDeviceForm({ onAdd }) {
  const [name, setName] = useState('');
  return (
    <div>
      <label style={{display:'block', fontSize:'13px', color:'#8b87a8', marginBottom:'6px'}}>Qurilma nomi</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="masalan: PS5 #1"
        style={{
          width:'100%', padding:'12px 14px', borderRadius:'12px',
          fontSize:'15px', marginBottom:'16px',
        }}
      />
      <button
        onClick={() => name.trim() && onAdd(name.trim())}
        disabled={!name.trim()}
        className="btn-primary"
        style={{
          width:'100%', padding:'14px', borderRadius:'12px',
          fontSize:'15px', opacity: name.trim() ? 1 : 0.5,
        }}
      >
        Qo'shish
      </button>
    </div>
  );
}

// ==================== TARIFF FORM ====================
function TariffForm({ onSave, initial }) {
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.pricePerHour?.toString() || '');

  return (
    <div>
      <label style={{display:'block', fontSize:'13px', color:'#8b87a8', marginBottom:'6px'}}>Tarif nomi</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="masalan: Oddiy"
        style={{width:'100%', padding:'12px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'12px'}}
      />
      <label style={{display:'block', fontSize:'13px', color:'#8b87a8', marginBottom:'6px'}}>1 soat narxi (so'm)</label>
      <input
        type="number"
        value={price}
        onChange={e => setPrice(e.target.value)}
        placeholder="20000"
        style={{width:'100%', padding:'12px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'16px'}}
      />
      <button
        onClick={() => {
          const p = parseInt(price);
          if (name.trim() && p > 0) onSave(name.trim(), p);
        }}
        disabled={!name.trim() || !parseInt(price)}
        className="btn-primary"
        style={{
          width:'100%', padding:'14px', borderRadius:'12px',
          fontSize:'15px', opacity: (name.trim() && parseInt(price)) ? 1 : 0.5,
        }}
      >
        Saqlash
      </button>
    </div>
  );
}

// ==================== TIMER SETUP FORM ====================
function TimerSetupForm({ tariffs, onStart }) {
  const [tariffId, setTariffId] = useState(tariffs[0]?.id || '');
  const [minutes, setMinutes] = useState(60);
  const presets = [30, 60, 90, 120];

  return (
    <div>
      <label style={{display:'block', fontSize:'13px', color:'#8b87a8', marginBottom:'6px'}}>Tarif</label>
      <select
        value={tariffId}
        onChange={e => setTariffId(e.target.value)}
        style={{width:'100%', padding:'12px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'16px'}}
      >
        {tariffs.map(t => (
          <option key={t.id} value={t.id}>{t.name} — {new Intl.NumberFormat('uz-UZ').format(t.pricePerHour)} so'm/soat</option>
        ))}
      </select>

      <label style={{display:'block', fontSize:'13px', color:'#8b87a8', marginBottom:'6px'}}>Vaqt (daqiqa)</label>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'10px'}}>
        {presets.map(p => (
          <button
            key={p}
            onClick={() => setMinutes(p)}
            style={{
              padding:'10px',
              borderRadius:'10px',
              background: minutes===p ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'rgba(168,85,247,0.1)',
              border: '1px solid ' + (minutes===p ? 'transparent' : 'rgba(168,85,247,0.3)'),
              color:'#e8e6f3',
              cursor:'pointer',
              fontWeight:600,
              fontSize:'13px',
            }}
          >
            {p < 60 ? `${p} daq` : `${p/60} soat`}
          </button>
        ))}
      </div>
      <input
        type="number"
        value={minutes}
        onChange={e => setMinutes(parseInt(e.target.value) || 0)}
        style={{width:'100%', padding:'12px 14px', borderRadius:'12px', fontSize:'15px', marginBottom:'16px'}}
      />

      <div style={{
        background:'rgba(168,85,247,0.08)', border:'1px solid rgba(168,85,247,0.2)',
        borderRadius:'12px', padding:'12px', marginBottom:'16px',
        display:'flex', alignItems:'center', gap:'10px',
      }}>
        <Bell size={16} color="#a855f7"/>
        <div style={{fontSize:'12px', color:'#a855f7'}}>
          Vaqt tugaganda ovoz va vibratsiya signali keladi
        </div>
      </div>

      <button
        onClick={() => minutes > 0 && tariffId && onStart(tariffId, minutes)}
        disabled={!minutes || !tariffId}
        className="btn-success"
        style={{
          width:'100%', padding:'14px', borderRadius:'12px',
          fontSize:'15px', opacity: (minutes && tariffId) ? 1 : 0.5,
          display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        }}
      >
        <Play size={18}/> Boshlash
      </button>
    </div>
  );
}
