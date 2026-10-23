
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3001;

if (!process.env.VK_APP_ID ||
    !process.env.VK_PROTECTED_KEY ||
    !process.env.SESSION_SECRET) {
  throw new Error("Заполни VK_APP_ID, VK_PROTECTED_KEY и SESSION_SECRET в .env");
}

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "50kb" }));

const db = new Database("methodicheskaya-map.db");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    vk_user_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    x REAL NOT NULL,
    y REAL NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Первоначальные администраторы задаются в .env.
const adminIds = (process.env.ADMIN_VK_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => /^\d+$/.test(id));

const insertAdmin = db.prepare(
  "INSERT OR IGNORE INTO admins (vk_user_id) VALUES (?)"
);

for (const id of adminIds) {
  insertAdmin.run(id);
}

// Проверяем подпись параметров запуска VK Mini Apps.
function verifyLaunchParams(rawParams) {
  if (typeof rawParams !== "string" || rawParams.length > 20000) {
    return null;
  }

  const params = new URLSearchParams(rawParams.replace(/^\?/, ""));
  const sign = params.get("sign");
  const appId = params.get("vk_app_id");
  const userId = params.get("vk_user_id");

  if (!sign || appId !== process.env.VK_APP_ID ||
      !userId || !/^\d+$/.test(userId)) {
    return null;
  }

  
    
const signedParams = [...params.entries()]
  .filter(([key]) => key.startsWith("vk_"))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
  .join("&");



  const expected = crypto
    .createHmac("sha256", process.env.VK_PROTECTED_KEY)
    .update(signedParams)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const a = Buffer.from(sign);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  return { userId };
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  try {
    const payload = jwt.verify(token, process.env.SESSION_SECRET);

    if (!/^\d+$/.test(String(payload.vkUserId))) {
      return res.status(401).json({ error: "Недействительная сессия" });
    }

    req.user = {
      vkUserId: String(payload.vkUserId),
      isAdmin: Boolean(
        db.prepare("SELECT 1 FROM admins WHERE vk_user_id = ?")
          .get(String(payload.vkUserId))
      ),
    };

    next();
  } catch {
    return res.status(401).json({ error: "Войдите через ВКонтакте" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Требуются права администратора" });
  }
  next();
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "methodicheskaya-karta" });
});

// Обмен подписанных параметров VK на короткую серверную сессию.
app.post("/api/auth/vk", (req, res) => {
  const launch = verifyLaunchParams(req.body?.launchParams);

  if (!launch) {
    return res.status(401).json({
      error: "Не удалось проверить подпись VK. Откройте приложение через ВКонтакте.",
    });
  }

  const token = jwt.sign(
    { vkUserId: launch.userId },
    process.env.SESSION_SECRET,
    { expiresIn: "8h", issuer: "methodicheskaya-karta" }
  );

  res.json({
    token,
    user: {
      vkUserId: launch.userId,
      isAdmin: Boolean(
        db.prepare("SELECT 1 FROM admins WHERE vk_user_id = ?")
          .get(launch.userId)
      ),
    },
  });
});

app.get("/api/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Публичный просмотр городов.
app.get("/api/cities", (req, res) => {
  res.json(
    db.prepare("SELECT id, name, x, y FROM cities ORDER BY name").all()
  );
});

// Добавлять город может пользователь с действительной сессией VK.
app.post("/api/cities", authenticate, (req, res) => {
  const { name, x, y } = req.body || {};

  if (typeof name !== "string" || !name.trim() ||
      name.trim().length > 100 ||
      !Number.isFinite(x) || !Number.isFinite(y) ||
      x < 0 || x > 960 || y < 0 || y > 410) {
    return res.status(400).json({ error: "Проверьте название и координаты города" });
  }

  try {
    const result = db.prepare(`
      INSERT INTO cities (name, x, y, created_by)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), x, y, req.user.vkUserId);

    res.status(201).json(
      db.prepare("SELECT id, name, x, y FROM cities WHERE id = ?")
        .get(result.lastInsertRowid)
    );
  } catch (error) {
    if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: "Такой город уже существует" });
    }
    throw error;
  }
});

// Удалять город и его материалы может только администратор.
app.delete("/api/cities/:id", authenticate, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM cities WHERE id = ?")
    .run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Город не найден" });
  }

  res.json({ ok: true });
});

// Публичный просмотр материалов.
app.get("/api/materials", (req, res) => {
  const cityId = req.query.cityId;

  const query = `
    SELECT m.id, m.city_id AS cityId, c.name AS city,
           m.title, m.author, m.url, m.description, m.created_at AS createdAt
    FROM materials m
    JOIN cities c ON c.id = m.city_id
    ${cityId ? "WHERE m.city_id = ?" : ""}
    ORDER BY m.created_at DESC
  `;

  res.json(
    cityId
      ? db.prepare(query).all(Number(cityId))
      : db.prepare(query).all()
  );
});

// Добавлять материал может пользователь с действительной сессией VK.
app.post("/api/materials", authenticate, (req, res) => {
  const { cityId, title, author, url, description = "" } = req.body || {};

  if (!Number.isInteger(Number(cityId)) ||
      typeof title !== "string" || !title.trim() || title.length > 200 ||
      typeof author !== "string" || !author.trim() || author.length > 150 ||
      typeof url !== "string" || !validHttpUrl(url) ||
      typeof description !== "string" || description.length > 3000) {
    return res.status(400).json({ error: "Проверьте поля материала" });
  }

  const city = db.prepare("SELECT id FROM cities WHERE id = ?")
    .get(Number(cityId));

  if (!city) {
    return res.status(400).json({ error: "Сначала добавьте город" });
  }

  const result = db.prepare(`
    INSERT INTO materials (city_id, title, author, url, description, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(cityId), title.trim(), author.trim(), url.trim(),
    description.trim(), req.user.vkUserId
  );

  res.status(201).json(
    db.prepare("SELECT * FROM materials WHERE id = ?")
      .get(result.lastInsertRowid)
  );
});

// Удаление материала доступно только администраторам.
app.delete("/api/materials/:id", authenticate, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM materials WHERE id = ?")
    .run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Материал не найден" });
  }

  res.json({ ok: true });
});

// Управление списком администраторов.
app.get("/api/admins", authenticate, requireAdmin, (req, res) => {
  res.json(db.prepare(
    "SELECT vk_user_id AS vkUserId, created_at AS createdAt FROM admins ORDER BY created_at"
  ).all());
});

app.post("/api/admins", authenticate, requireAdmin, (req, res) => {
  const id = String(req.body?.vkUserId || "");

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Укажите числовой VK ID" });
  }

  db.prepare("INSERT OR IGNORE INTO admins (vk_user_id) VALUES (?)").run(id);
  res.status(201).json({ ok: true });
});

app.delete("/api/admins/:vkUserId", authenticate, requireAdmin, (req, res) => {
  const id = String(req.params.vkUserId);

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Неверный VK ID" });
  }

  const count = db.prepare("SELECT COUNT(*) AS count FROM admins").get().count;

  if (count <= 1) {
    return res.status(400).json({ error: "Нельзя удалить последнего администратора" });
  }

  db.prepare("DELETE FROM admins WHERE vk_user_id = ?").run(id);
  res.json({ ok: true });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
