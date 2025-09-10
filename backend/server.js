import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();
const { Pool } = pkg;

// Fix pour __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre-super-secret-long-et-complexe';

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Connexion PostgreSQL ---
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'kanban_app',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 5432,
        ssl: false,
      }
);

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ ERREUR DE CONNEXION À LA BASE DE DONNÉES:', err.stack);
    return;
  }
  console.log('✅ Connexion PostgreSQL réussie !');
  client.release();
});

// --- Middleware d’auth ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- Route de test ---
app.get('/api/health', (req, res) => {
  console.log('ℹ️ Requête reçue sur /api/health');
  res.json({ 
    status: '🎉 Le serveur backend Kanban est en ligne !',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// --- Routes d'Authentification ---

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  console.log('ℹ️ Requête reçue sur POST /api/auth/register');
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ msg: "Email et mot de passe requis." });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, password_hash]
    );
    res.status(201).json(newUser.rows[0]);
  } catch (err) {
    console.error('❌ Erreur sur /api/auth/register:', err.message);
    res.status(500).json({ msg: "Erreur serveur ou l'email existe déjà." });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  console.log('ℹ️ Requête reçue sur POST /api/auth/login');
  try {
    const { email, password } = req.body;
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ msg: "Email ou mot de passe incorrect." });
    }
    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ msg: "Email ou mot de passe incorrect." });
    }
    const payload = { id: user.id, email: user.email };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: payload });
  } catch (err) {
    console.error('❌ Erreur sur /api/auth/login:', err.message);
    res.status(500).send("Erreur serveur");
  }
});

// --- Routes des Tâches (Protégées) ---

// GET /api/tasks - Récupère les tâches de l'utilisateur connecté
app.get('/api/tasks', authenticateToken, async (req, res) => {
  console.log(`ℹ️ Requête reçue sur GET /api/tasks pour l'utilisateur ${req.user.id}`);
  try {
    const userTasks = await pool.query("SELECT * FROM tasks WHERE user_id = $1 ORDER BY id ASC", [req.user.id]);
    res.json(userTasks.rows);
  } catch (err) {
    console.error('❌ Erreur sur /api/tasks:', err.message);
    res.status(500).send("Erreur serveur");
  }
});

// POST /api/tasks - Crée une tâche pour l'utilisateur connecté
app.post('/api/tasks', authenticateToken, async (req, res) => {
    console.log(`ℹ️ Requête reçue sur POST /api/tasks pour l'utilisateur ${req.user.id}`);
    console.log('📤 Données reçues:', req.body);
    
    const { title, description, due_date, reminder_date, priority } = req.body;
    
    try {
        const newTask = await pool.query(
            `INSERT INTO tasks (title, description, user_id, status, due_date, reminder_date, priority) 
             VALUES ($1, $2, $3, 'todo', $4, $5, $6) RETURNING *`,
            [
                title, 
                description || '', 
                req.user.id,
                due_date || null,
                reminder_date || null,
                priority || 'medium'
            ]
        );
        console.log('✅ Tâche créée:', newTask.rows[0]);
        res.status(201).json(newTask.rows[0]);
    } catch (err) {
        console.error('❌ Erreur détaillée sur POST /api/tasks:');
        console.error('- Message:', err.message);
        console.error('- Code:', err.code);
        console.error('- Detail:', err.detail);
        console.error('- Stack:', err.stack);
        res.status(500).json({ msg: "Erreur serveur lors de la création de la tâche" });
    }
});

// PUT /api/tasks/:id - Met à jour une tâche de l'utilisateur connecté
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
    console.log(`ℹ️ Requête reçue sur PUT /api/tasks/${req.params.id} pour l'utilisateur ${req.user.id}`);
    console.log('📤 Données reçues pour mise à jour:', req.body);
    
    const { id } = req.params;
    const { title, description, status, due_date, reminder_date, priority } = req.body;
    
    // Validation des données reçues
    if (!title || !title.trim()) {
        console.error('❌ Titre manquant ou vide');
        return res.status(400).json({ msg: "Le titre est requis." });
    }

    if (!status || !['todo', 'in-progress', 'done'].includes(status)) {
        console.error('❌ Statut invalide:', status);
        return res.status(400).json({ msg: "Statut invalide." });
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
        console.error('❌ Priorité invalide:', priority);
        return res.status(400).json({ msg: "Priorité invalide." });
    }

    // Validation des dates
    let parsedDueDate = null;
    let parsedReminderDate = null;

    if (due_date) {
        parsedDueDate = new Date(due_date);
        if (isNaN(parsedDueDate.getTime())) {
            console.error('❌ Date d\'échéance invalide:', due_date);
            return res.status(400).json({ msg: "Date d'échéance invalide." });
        }
    }

    if (reminder_date) {
        parsedReminderDate = new Date(reminder_date);
        if (isNaN(parsedReminderDate.getTime())) {
            console.error('❌ Date de rappel invalide:', reminder_date);
            return res.status(400).json({ msg: "Date de rappel invalide." });
        }
    }
    
    try {
        // Vérifier que la tâche existe et appartient à l'utilisateur
        const existingTask = await pool.query("SELECT * FROM tasks WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        
        if (existingTask.rows.length === 0) {
            console.error('❌ Tâche non trouvée ou non autorisée:', id);
            return res.status(404).json({ msg: "Tâche non trouvée ou non autorisée." });
        }

        console.log('📋 Tâche existante:', existingTask.rows[0]);

        const result = await pool.query(
            `UPDATE tasks SET 
                title = $1, 
                description = $2, 
                status = $3, 
                due_date = $4, 
                reminder_date = $5, 
                priority = $6,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 AND user_id = $8 RETURNING *`,
            [
                title.trim(), 
                description || '', 
                status, 
                parsedDueDate, 
                parsedReminderDate, 
                priority || 'medium', 
                id, 
                req.user.id
            ]
        );
        
        if (result.rows.length === 0) {
            console.error('❌ Aucune ligne mise à jour');
            return res.status(404).json({ msg: "Tâche non trouvée ou non autorisée." });
        }

        console.log('✅ Tâche mise à jour:', result.rows[0]);
        res.json(result.rows[0]);
        
    } catch (err) {
        console.error('❌ Erreur détaillée sur PUT /api/tasks:');
        console.error('- Message:', err.message);
        console.error('- Code:', err.code);
        console.error('- Detail:', err.detail);
        console.error('- Stack:', err.stack);
        console.error('- Requête SQL échouée pour:', { id, user_id: req.user.id, title, status });
        
        res.status(500).json({ msg: "Erreur serveur lors de la mise à jour de la tâche" });
    }
});

// DELETE /api/tasks/:id - Supprime une tâche de l'utilisateur connecté
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    console.log(`ℹ️ Requête reçue sur DELETE /api/tasks/${req.params.id} pour l'utilisateur ${req.user.id}`);
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [id, req.user.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ msg: "Tâche non trouvée ou non autorisée." });
        }
        res.status(204).send();
    } catch (err) {
        console.error(`❌ Erreur détaillée sur DELETE /api/tasks/${id}:`, {
            message: err.message,
            code: err.code,
            detail: err.detail
        });
        res.status(500).json({ msg: "Erreur serveur lors de la suppression" });
    }
});

// GET /api/tasks/due-soon - Récupère les tâches avec échéance proche
app.get('/api/tasks/due-soon', authenticateToken, async (req, res) => {
    console.log(`ℹ️ Requête reçue sur GET /api/tasks/due-soon pour l'utilisateur ${req.user.id}`);
    try {
        const dueSoonTasks = await pool.query(
            `SELECT * FROM tasks 
             WHERE user_id = $1 
             AND due_date IS NOT NULL 
             AND due_date <= NOW() + INTERVAL '24 hours'
             AND status != 'done'
             ORDER BY due_date ASC`,
            [req.user.id]
        );
        res.json(dueSoonTasks.rows);
    } catch (err) {
        console.error('❌ Erreur sur /api/tasks/due-soon:', err.message);
        res.status(500).send("Erreur serveur");
    }
});

// GET /api/tasks/reminders - Récupère les tâches nécessitant un rappel
app.get('/api/tasks/reminders', authenticateToken, async (req, res) => {
    console.log(`ℹ️ Requête reçue sur GET /api/tasks/reminders pour l'utilisateur ${req.user.id}`);
    try {
        const reminderTasks = await pool.query(
            `SELECT * FROM tasks 
             WHERE user_id = $1 
             AND reminder_date IS NOT NULL 
             AND reminder_date <= NOW()
             AND is_reminder_sent = false
             AND status != 'done'
             ORDER BY reminder_date ASC`,
            [req.user.id]
        );
        res.json(reminderTasks.rows);
    } catch (err) {
        console.error('❌ Erreur sur /api/tasks/reminders:', err.message);
        res.status(500).send("Erreur serveur");
    }
});

// POST /api/tasks/:id/mark-reminder-sent - Marque un rappel comme envoyé
app.post('/api/tasks/:id/mark-reminder-sent', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            "UPDATE tasks SET is_reminder_sent = true WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: "Tâche non trouvée ou non autorisée." });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`❌ Erreur sur POST /api/tasks/${id}/mark-reminder-sent:`, err.message);
        res.status(500).send("Erreur serveur");
    }
});


// --- Démarrage ---
app.listen(PORT, () => {
  console.log(`🚀 Backend démarré sur http://localhost:${PORT}`);
  console.log(`🌍 Mode: ${process.env.NODE_ENV || 'development'}`);
});