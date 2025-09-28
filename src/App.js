// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import './App.css';

// const API_BASE = 'http://localhost:4000'; // hardcoded as you requested (no .env)
const API_BASE = 'https://backend-real-time-multi-camera-face.onrender.com';

export default function App() {
  const [route, setRoute] = useState('login');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [ws, setWs] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (token) {
      connectWS(token);
      fetchCameras();
      fetchAlerts();
      setRoute('dashboard');
    } else {
      setRoute('login');
    }
    // eslint-disable-next-line
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token); setUser(data.user);
    } else alert(data.error);
  };

  const register = async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token); setUser(data.user);
    } else alert(data.error);
  };

  const logout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setToken(''); setUser(null); setRoute('login');
    if (ws) ws.close();
  };

  const connectWS = (token) => {
    const socket = new WebSocket(`${API_BASE.replace(/^http/, 'ws')}/ws?token=${token}`);
    socket.onopen = () => setStatusMsg('Realtime connected');
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'alert') setAlerts(prev => [msg.alert, ...prev].slice(0,300));
      if (msg.type === 'cam_stats') setCameras(prev => prev.map(c => c.id === msg.camera_id ? { ...c, liveFps: msg.fps, processing: msg.processing } : c));
      if (msg.type === 'cam_error') setCameras(prev => prev.map(c => c.id === msg.camera_id ? { ...c, processing: false, error: msg.error } : c));
    };
    socket.onclose = () => setStatusMsg('Realtime disconnected');
    setWs(socket);
  };

  const fetchCameras = async () => {
    const res = await fetch(`${API_BASE}/api/cameras`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) setCameras(data.cameras);
  };

  const fetchAlerts = async () => {
    const res = await fetch(`${API_BASE}/api/alerts?limit=50`, { headers: { Authorization: `Bearer ${token}` }});
    const data = await res.json();
    if (res.ok) setAlerts(data.alerts);
  };

  const addCamera = async (cam) => {
    const res = await fetch(`${API_BASE}/api/cameras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(cam)
    });
    const data = await res.json();
    if (res.ok) setCameras(prev => [data.camera, ...prev]);
    else alert(data.error);
  };

  const startCamera = async (id) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, processing: true, error: null } : c));
    const res = await fetch(`${API_BASE}/api/cameras/${id}/start`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }});
    const data = await res.json();
    if (res.ok) setCameras(prev => prev.map(c => c.id === id ? data.camera : c));
    else setCameras(prev => prev.map(c => c.id === id ? { ...c, processing: false, error: data.error } : c));
  };

  const stopCamera = async (id) => {
    const res = await fetch(`${API_BASE}/api/cameras/${id}/stop`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }});
    const data = await res.json();
    if (res.ok) setCameras(prev => prev.map(c => c.id === id ? data.camera : c));
  };

  if (route === 'login') return <LoginForm onLogin={login} onRegister={register} />;

  return (
    <div className="app-container">
      <header className="topbar">
        <div className="title">Surveillance Dashboard</div>
        <div className="controls">
          <span className="user">Hello, {user?.username}</span>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="main-grid">
        <section className="left-col">
          <CameraManager cameras={cameras} onAdd={addCamera} onStart={startCamera} onStop={stopCamera} />
        </section>

        <section className="right-col">
          <h3>Alerts</h3>
          <div className="alerts-list">
            {alerts.map(a => (
              <div className="alert-card" key={a.id}>
                <div>Camera: {a.camera_id}</div>
                <div>{new Date(a.detected_at).toLocaleString()}</div>
                <div>Snapshot: {a.has_snapshot ? 'Yes' : 'No'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="footer">
        <div>{statusMsg}</div>
      </footer>
    </div>
  );
}

// Login component
function LoginForm({ onLogin, onRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="app-container login-form">
      <h2>Login / Register</h2>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <div style={{ display:'flex', gap: '10px' }}>
        <button className="btn" onClick={() => onLogin(username, password)}>Login</button>
        <button className="btn" onClick={() => onRegister(username, password)}>Register</button>
      </div>
    </div>
  );
}

// Camera manager + previews (grid)
function CameraManager({ cameras, onAdd, onStart, onStop }) {
  const [newCam, setNewCam] = useState({ name: '', rtsp_url: '', location: '', fps: 5 });

  // Cameras that are active (processing) and have RTSP will auto-create previews
  const activeCameras = cameras.filter(c => c.processing && c.rtsp_url);

  return (
    <div className="camera-panel">
      <h3>Cameras</h3>

      <div className="card add-card">
        <input placeholder="Name" value={newCam.name} onChange={e => setNewCam({...newCam, name: e.target.value})} />
        <input placeholder="RTSP URL" value={newCam.rtsp_url} onChange={e => setNewCam({...newCam, rtsp_url: e.target.value})} />
        <input placeholder="Location" value={newCam.location} onChange={e => setNewCam({...newCam, location: e.target.value})} />
        <input placeholder="FPS" type="number" value={newCam.fps} onChange={e => setNewCam({...newCam, fps: Number(e.target.value)})} />
        <button className="btn" onClick={() => { onAdd(newCam); setNewCam({ name:'', rtsp_url:'', location:'', fps:5 }); }}>Add Camera</button>
      </div>

      <div className="camera-list">
        {cameras.map(cam => (
          <div key={cam.id} className="camera-card">
            <div className="camera-title">{cam.name} <span className="small">#{cam.id}</span></div>
            <div className="camera-meta">{cam.location} | FPS: {cam.liveFps ?? cam.fps} | {cam.processing ? 'Processing' : 'Stopped'}</div>
            <div className="camera-actions">
              <button className="btn small" onClick={() => onStart(cam.id)}>Start</button>
              <button className="btn small" onClick={() => onStop(cam.id)}>Stop</button>
            </div>
          </div>
        ))}
      </div>

      <h4>Live Previews (active cameras)</h4>
      <div className="preview-grid">
        {/* For each active camera with RTSP show a preview tile */}
        {activeCameras.length === 0 && <div className="placeholder">No active RTSP streams. Started cameras with RTSP will appear here.</div>}
        {activeCameras.map(cam => (
          <CameraTile key={cam.id} camera={cam} />
        ))}
      </div>
    </div>
  );
}

// Each camera tile = its own HLS player (or shows 'loading' / error)
function CameraTile({ camera }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // cleanup previous
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.src = '';
    video.srcObject = null;
    setError(null);
    setLoading(true);

    // Use HLS from backend per camera
    const hlsUrl = `${API_BASE}/streams/cam_${camera.id}/index.m3u8`;

    // small timeout to allow ffmpeg to create playlist
    let started = false;
    const tryAttach = () => {
      if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 3, maxMaxBufferLength: 5 });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          video.play().catch(()=>{});
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          // handle network/other errors cleanly
          if (data && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // reload a couple times
            console.warn(`HLS network error for cam ${camera.id}`, data);
          }
          if (data && data.fatal) {
            try { hls.destroy(); } catch(e){}
            setError('Playback error');
            setLoading(false);
          }
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        started = true;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          setLoading(false);
          video.play().catch(()=>{});
        });
        started = true;
      } else {
        setError('HLS not supported in this browser');
        setLoading(false);
      }
    };

    // Try immediately, but if playlist not yet present try again a few times
    let attempts = 0;
    const intervalId = setInterval(async () => {
      attempts++;
      // fetch the playlist to check presence (faster UX/failure detection)
      try {
        const resp = await fetch(hlsUrl, { method: 'HEAD' });
        if (resp.ok || resp.status === 200) {
          // playlist exists, attach player
          clearInterval(intervalId);
          tryAttach();
        } else {
          if (attempts >= 8) {
            clearInterval(intervalId);
            // still try to attach once anyway
            tryAttach();
          }
        }
      } catch (e) {
        if (attempts >= 8) {
          clearInterval(intervalId);
          tryAttach();
        }
      }
    }, 800);

    return () => {
      clearInterval(intervalId);
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (e) {}
        hlsRef.current = null;
      }
      try { video.pause(); } catch(e){}
      video.src = '';
      video.srcObject = null;
    };
    // eslint-disable-next-line
  }, [camera.id, camera.rtsp_url, camera.processing]);

  return (
    <div className="preview-tile card">
      <div className="preview-header">
        <div><strong>{camera.name}</strong> <span className="small">#{camera.id}</span></div>
        <div className="small muted">{camera.location}</div>
      </div>
      <div className="preview-body">
        {loading && <div className="preview-loading">Loading...</div>}
        {error && <div className="preview-error">{error}</div>}
        <video ref={videoRef} className="preview-video" controls muted playsInline style={{ width: '100%', height: 'auto', background: 'black' }} />
      </div>
    </div>
  );
}
