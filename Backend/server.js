console.log("SERVER FILE LOADED");

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 5000;
const DB_PATH = path.join(__dirname, "db.json");

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocal) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));
app.use(express.json());

app.use(session({
    secret: "chronosync_temporal_nexus_secret_key_2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // http only on localhost
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Mutex for database access
let dbLock = Promise.resolve();

async function acquireLock() {
    let release;
    const nextLock = new Promise(resolve => {
        release = resolve;
    });
    const currentLock = dbLock;
    dbLock = dbLock.then(() => nextLock);
    await currentLock;
    return release;
}

// DB helper functions
async function readDB() {
    const release = await acquireLock();
    try {
        const data = await fs.readFile(DB_PATH, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading database:", error);
        return { users: [], tasks: [] };
    } finally {
        release();
    }
}

async function writeDB(data) {
    const release = await acquireLock();
    try {
        const tempPath = DB_PATH + ".tmp";
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
        await fs.rename(tempPath, DB_PATH);
    } catch (error) {
        console.error("Error writing database atomically:", error);
        throw error;
    } finally {
        release();
    }
}

// Clearance level hierarchy mapping
const clearanceHierarchy = {
    "LEVEL_1": 1,
    "LEVEL_2": 2,
    "LEVEL_3": 3
};

// Clearance Guard Middleware
async function clearanceGuard(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized. Active session required." });
    }

    const userClearanceStr = req.session.user.clearance;
    const userClearanceVal = clearanceHierarchy[userClearanceStr] || 0;

    // Route-specific logic
    if (req.method === "POST" && req.path === "/api/nexus/tasks") {
        const requiredClearanceStr = req.body.clearanceRequired;
        if (!requiredClearanceStr || !clearanceHierarchy[requiredClearanceStr]) {
            return res.status(400).json({ error: "Invalid or missing clearanceRequired field." });
        }
        const requiredClearanceVal = clearanceHierarchy[requiredClearanceStr];
        if (userClearanceVal < requiredClearanceVal) {
            return res.status(403).json({ error: "Forbidden. Insufficient clearance level." });
        }
        return next();
    }

    if (req.method === "DELETE" && req.path.startsWith("/api/nexus/tasks/")) {
        const taskId = req.params.id;
        try {
            const db = await readDB();
            const task = db.tasks.find(t => t.id === taskId);
            if (!task) {
                return res.status(404).json({ error: "Task not found." });
            }
            const requiredClearanceVal = clearanceHierarchy[task.clearanceRequired] || 0;
            if (userClearanceVal < requiredClearanceVal) {
                return res.status(403).json({ error: "Forbidden. Insufficient clearance level." });
            }
            // Attach task and db to req so we don't have to read/find them again
            req.db = db;
            req.task = task;
            return next();
        } catch (error) {
            return res.status(500).json({ error: "Internal server error." });
        }
    }

    next();
}

// API Routes

// GET /api/auth/me - check session state
app.get("/api/auth/me", (req, res) => {
    if (req.session && req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false, user: null });
    }
});

// POST /api/auth/login - authenticate user
app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required." });
    }

    try {
        const db = await readDB();
        const user = db.users.find(u => u.username === username && u.password === password);
        if (!user) {
            return res.status(401).json({ error: "Invalid username or password." });
        }

        // Attach user object (minus password) to req.session.user
        const sessionUser = { ...user };
        delete sessionUser.password;
        req.session.user = sessionUser;

        res.json({ success: true, user: sessionUser });
    } catch (error) {
        res.status(500).json({ error: "Server error during login." });
    }
});

// POST /api/auth/logout - destroy session
app.post("/api/auth/logout", (req, res) => {
    if (!req.session) {
        return res.json({ success: true });
    }
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: "Could not log out." });
        }
        res.clearCookie("connect.sid"); // default cookie name
        res.json({ success: true });
    });
});

// GET /api/nexus/tasks - retrieve non-expired tasks and filter out expired ones from db.json
app.get("/api/nexus/tasks", async (req, res) => {
    try {
        const db = await readDB();
        const now = Date.now();

        const activeTasks = db.tasks.filter(t => t.expirationTimestamp >= now);
        const expiredCount = db.tasks.length - activeTasks.length;

        if (expiredCount > 0) {
            db.tasks = activeTasks;
            await writeDB(db);
            console.log(`Cleaned up ${expiredCount} expired tasks.`);
        }

        res.json(activeTasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve tasks." });
    }
});

// POST /api/nexus/tasks - add new task (Protected)
app.post("/api/nexus/tasks", clearanceGuard, async (req, res) => {
    const { description, clearanceRequired } = req.body;
    if (!description || !clearanceRequired) {
        return res.status(400).json({ error: "Description and clearanceRequired are required." });
    }

    try {
        const db = await readDB();
        const newTask = {
            id: `task_${uuidv4().replace(/-/g, "").substring(0, 8)}`,
            description,
            clearanceRequired,
            expirationTimestamp: Date.now() + 10 * 60 * 1000 // 10 minutes into the future
        };

        db.tasks.push(newTask);
        await writeDB(db);

        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ error: "Failed to create task." });
    }
});

// DELETE /api/nexus/tasks/:id - delete task (Protected)
app.delete("/api/nexus/tasks/:id", clearanceGuard, async (req, res) => {
    const db = req.db || await readDB();
    const taskId = req.params.id;

    try {
        db.tasks = db.tasks.filter(t => t.id !== taskId);
        await writeDB(db);
        res.json({ success: true, message: `Task ${taskId} successfully completed/deleted.` });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

