import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = "http://localhost:5000/api";

const clearanceHierarchy = {
  "LEVEL_1": 1,
  "LEVEL_2": 2,
  "LEVEL_3": 3
};

function App() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tasks, setTasks] = useState([]);
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskClearance, setNewTaskClearance] = useState("LEVEL_1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [systemTime, setSystemTime] = useState(Date.now());

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
          fetchTasks(data.user);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Update clock every second when authenticated
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      setSystemTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [user]);

  // Fetch tasks from API
  const fetchTasks = async (currentUser = user) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE}/nexus/tasks`, { credentials: "include" });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    }
  };

  // Re-fetch tasks if any task has expired
  useEffect(() => {
    if (!user || tasks.length === 0) return;
    const hasExpired = tasks.some(t => t.expirationTimestamp < systemTime);
    if (hasExpired) {
      fetchTasks();
    }
  }, [systemTime, tasks, user]);

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Credentials required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setUsername("");
        setPassword("");
        fetchTasks(data.user);
      } else {
        setError(data.error || "Access denied.");
      }
    } catch (err) {
      setError("Access terminal offline.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      setUser(null);
      setTasks([]);
    }
  };

  // Handle Task Creation
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskDesc.trim()) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/nexus/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: newTaskDesc,
          clearanceRequired: newTaskClearance
        })
      });
      if (res.ok) {
        setNewTaskDesc("");
        setNewTaskClearance("LEVEL_1");
        fetchTasks();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to create task.");
      }
    } catch (err) {
      setError("Task initialization error.");
    }
  };

  // Handle Task Deletion (Complete)
  const handleDeleteTask = async (id) => {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/nexus/tasks/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        fetchTasks();
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to complete task.");
        alert(`ACCESS DENIED: ${errData.error || "Insufficient clearance level."}`);
      }
    } catch (err) {
      setError("Task termination error.");
      alert("SECURITY WARNING: Failed to communicate with terminal core.");
    }
  };

  // Helper to format countdown
  const formatCountdown = (expirationTimestamp) => {
    const remainingMs = expirationTimestamp - systemTime;
    if (remainingMs <= 0) return "00:00";
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Helper to check if countdown is urgent (<= 60 seconds)
  const isUrgent = (expirationTimestamp) => {
    const remainingMs = expirationTimestamp - systemTime;
    return remainingMs > 0 && remainingMs <= 60000;
  };

  const userClearanceVal = user ? clearanceHierarchy[user.clearance] || 0 : 0;

  if (loading && !user) {
    return (
      <div className="auth-container">
        <div className="terminal-card">
          <div className="terminal-header">
            <h1>CHRONOSYNC</h1>
            <div className="terminal-subheader">ESTABLISHING QUANTUM LINK...</div>
          </div>
          <div className="blink" style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--neon-cyan)" }}>
            [Scanning biometric imprint...]
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!user ? (
        <div className="auth-container">
          <div className="terminal-card">
            <div className="terminal-header">
              <h1>CHRONOSYNC</h1>
              <div className="terminal-subheader">SECURE TEMPORAL NEXUS PORTAL</div>
            </div>
            
            {error && <div className="error-terminal">ALERT: {error}</div>}

            <form onSubmit={handleLogin} className="terminal-form">
              <div className="input-group">
                <label htmlFor="username">CREW MEMBER ID</label>
                <input
                  id="username"
                  type="text"
                  className="terminal-input"
                  placeholder="Enter Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="input-group">
                <label htmlFor="password">ACCESS KEYPASS</label>
                <input
                  id="password"
                  type="password"
                  className="terminal-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="terminal-btn">
                AUTHENTICATE KEYPASS
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="dashboard-container">
          <header className="ops-header">
            <div className="ops-title-group">
              <h1>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                CHRONOSYNC OPERATIONS
              </h1>
              <p>STATUS: DIRECT LINK ACTIVE // TEMPORAL MATRIX ONLINE</p>
            </div>
            <div className="user-status-card">
              <div className={`clearance-badge clearance-${user.clearance}`}>
                {user.clearance.replace("_", " ")}
              </div>
              <div className="user-info">
                CREW: <span style={{ color: "var(--neon-cyan)", fontWeight: "bold" }}>{user.username.toUpperCase()}</span>
              </div>
              <button onClick={handleLogout} className="logout-btn">
                DE-AUTHORIZE
              </button>
            </div>
          </header>

          <main className="ops-main-content">
            {error && <div className="error-terminal" style={{ margin: 0 }}>OPERATION WARNING: {error}</div>}

            <div className="stats-grid">
              <div className="stat-panel">
                <span className="stat-label">Active Temporal Nodes</span>
                <span className="stat-val active-count">{tasks.length}</span>
              </div>
              <div className="stat-panel">
                <span className="stat-label">System Time (GMT)</span>
                <span className="stat-val" style={{ fontFamily: "var(--font-mono)", fontSize: "20px" }}>
                  {new Date(systemTime).toISOString().replace("T", " ").substring(0, 19)}
                </span>
              </div>
              <div className="stat-panel">
                <span className="stat-label">Clearance Level</span>
                <span className="stat-val" style={{ color: `var(--neon-${user.clearance === 'LEVEL_3' ? 'red' : user.clearance === 'LEVEL_2' ? 'amber' : 'cyan'})` }}>
                  {user.clearance}
                </span>
              </div>
            </div>

            <section className="task-creator-panel">
              <h2>Initialize New Time-Locked Node</h2>
              <form onSubmit={handleCreateTask} className="creator-form">
                <div className="input-group">
                  <label htmlFor="task-desc">NODE DESCRIPTION / DEPLOYMENT OBJECTIVE</label>
                  <input
                    id="task-desc"
                    type="text"
                    className="terminal-input"
                    placeholder="e.g. Recalibrate antimatter containment fields."
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    required
                  />
                </div>
                <div className="select-group">
                  <label htmlFor="task-clearance">REQUIRED CLEARANCE</label>
                  <select
                    id="task-clearance"
                    className="terminal-select"
                    value={newTaskClearance}
                    onChange={(e) => setNewTaskClearance(e.target.value)}
                  >
                    <option value="LEVEL_1">LEVEL 1 (OPERATOR)</option>
                    <option value="LEVEL_2">LEVEL 2 (OFFICER)</option>
                    <option value="LEVEL_3">LEVEL 3 (COMMANDER)</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  className="terminal-btn submit-btn"
                  disabled={userClearanceVal < clearanceHierarchy[newTaskClearance]}
                >
                  DEPLOY NODE
                </button>
              </form>
            </section>

            <section className="operations-dashboard">
              <h2>Active Temporal Matrix Grid</h2>
              {tasks.length === 0 ? (
                <div className="empty-tasks">
                  <div className="empty-tasks-icon">🎛️</div>
                  <div className="empty-tasks-title">ALL TEMPORAL NODES SECURED</div>
                  <div className="empty-tasks-desc">
                    There are currently no active tasks requiring synchronization. All systems operating within nominal temporal parameters.
                  </div>
                </div>
              ) : (
                <div className="tasks-grid">
                  {tasks.map((task) => {
                    const taskClearanceVal = clearanceHierarchy[task.clearanceRequired] || 0;
                    const canDelete = userClearanceVal >= taskClearanceVal;
                    const urgent = isUrgent(task.expirationTimestamp);

                    return (
                      <div key={task.id} className={`task-card border-${task.clearanceRequired}`}>
                        <div className="task-card-header">
                          <span className="task-id">{task.id.toUpperCase()}</span>
                          <span className={`clearance-badge clearance-${task.clearanceRequired}`}>
                            {task.clearanceRequired.replace("_", " ")}
                          </span>
                        </div>
                        <div className="task-desc">{task.description}</div>
                        <div className="task-card-footer">
                          <div className="countdown-box">
                            <span className="countdown-label">EXPIRY countdown</span>
                            <span className={`countdown-time ${urgent ? 'urgent' : ''}`}>
                              {formatCountdown(task.expirationTimestamp)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="action-btn"
                            title="Terminate/Complete task"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            COMPLETE
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </main>
        </div>
      )}
    </>
  );
}

export default App;
