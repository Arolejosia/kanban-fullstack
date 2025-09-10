import React, { useState, useEffect } from 'react';

// --- Helper function for API calls ---
const apiCall = async (url, method = 'GET', body = null, token = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`🔄 API Call: ${method} ${url}`);
  if (body) {
    console.log('📤 Request body:', body);
  }
  
  try {
    const response = await fetch(url, options);
    
    console.log(`📥 Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { msg: `Erreur HTTP ${response.status}: ${errorText}` };
      }
      throw new Error(errorData.msg || `Erreur HTTP: ${response.status}`);
    }

    if (response.status === 204) {
      console.log('✅ Success (No Content)');
      return null;
    }

    const responseText = await response.text();
    console.log('📄 Raw response:', responseText);
    
    try {
      const data = JSON.parse(responseText);
      console.log('✅ Parsed response:', data);
      return data;
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError);
      throw new Error('Impossible de parser la réponse JSON du serveur');
    }
    
  } catch (error) {
    console.error('❌ API call failed:', error);
    throw error;
  }
};

// --- Date formatting utilities ---
const formatDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
};

const formatDateTime = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const isDueSoon = (dueDate) => {
  if (!dueDate) return false;
  const now = new Date();
  const due = new Date(dueDate);
  const diffHours = (due - now) / (1000 * 60 * 60);
  return diffHours > 0 && diffHours <= 24;
};

function App() {
  // --- State management ---
  const [tasks, setTasks] = useState([]);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auth form state
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Task form state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    due_date: '',
    reminder_date: '',
    priority: 'medium'
  });

  // Drag and drop state
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Notifications state
  const [notifications, setNotifications] = useState([]);

 const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  // --- Effects ---
  useEffect(() => {
    const fetchTasksAndUser = async () => {
      if (token) {
        setIsLoading(true);
        setError(null);
        try {
          const decodedToken = JSON.parse(atob(token.split('.')[1]));
          setUser({ id: decodedToken.id, email: decodedToken.email });
          
          const fetchedTasks = await apiCall(`${API_BASE_URL}/api/tasks`, 'GET', null, token);
          setTasks(fetchedTasks);
          
          // Check for reminders
          checkReminders(fetchedTasks);
        } catch (err) {
          setError(`Failed to fetch tasks: ${err.message}`);
          if (err.message.includes("403")) {
            handleLogout();
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        setTasks([]);
        setUser(null);
      }
    };

    fetchTasksAndUser();
  }, [token]);

  // Check for reminders periodically
  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(() => {
      checkReminders(tasks);
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [tasks, token]);

  // --- Handlers ---
  const checkReminders = (currentTasks) => {
    const now = new Date();
    const newNotifications = [];

    currentTasks.forEach(task => {
      if (task.reminder_date && !task.is_reminder_sent && task.status !== 'done') {
        const reminderTime = new Date(task.reminder_date);
        if (reminderTime <= now) {
          newNotifications.push({
            id: task.id,
            message: `Rappel: ${task.title}`,
            type: 'reminder'
          });
        }
      }

      if (task.due_date && task.status !== 'done') {
        if (isOverdue(task.due_date)) {
          newNotifications.push({
            id: task.id,
            message: `En retard: ${task.title}`,
            type: 'overdue'
          });
        } else if (isDueSoon(task.due_date)) {
          newNotifications.push({
            id: task.id,
            message: `Échéance proche: ${task.title}`,
            type: 'due-soon'
          });
        }
      }
    });

    if (newNotifications.length > 0) {
      setNotifications(prev => [...prev, ...newNotifications]);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const url = isLoginView ? `${API_BASE_URL}/api/auth/login` : `${API_BASE_URL}/api/auth/register`;
    
    try {
      const data = await apiCall(url, 'POST', { email, password });
      
      if (isLoginView) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
      } else {
        alert('Inscription réussie ! Veuillez vous connecter.');
        setIsLoginView(true);
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      setAuthError(err.message || 'Une erreur est survenue.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;

    try {
      const taskData = {
        ...taskForm,
        due_date: taskForm.due_date || null,
        reminder_date: taskForm.reminder_date || null
      };

      let result;
      if (editingTask) {
        result = await apiCall(
          `${API_BASE_URL}/api/tasks/${editingTask.id}`,
          'PUT',
          { ...editingTask, ...taskData },
          token
        );
        setTasks(tasks.map(t => (t.id === editingTask.id ? result : t)));
      } else {
        result = await apiCall(
          `${API_BASE_URL}/api/tasks`,
          'POST',
          taskData,
          token
        );
        setTasks(prevTasks => [...prevTasks, result]);
      }
      
      resetTaskForm();
    } catch (err) {
      setError(`Erreur lors de la sauvegarde: ${err.message}`);
    }
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      due_date: '',
      reminder_date: '',
      priority: 'medium'
    });
    setEditingTask(null);
    setShowTaskModal(false);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date ? task.due_date.split('T')[0] : '',
      reminder_date: task.reminder_date ? task.reminder_date.slice(0, 16) : '',
      priority: task.priority || 'medium'
    });
    setShowTaskModal(true);
  };

  const handleDeleteTask = async (taskId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette tâche ?")) {
      try {
        await apiCall(`${API_BASE_URL}/api/tasks/${taskId}`, 'DELETE', null, token);
        setTasks(tasks.filter(t => t.id !== taskId));
      } catch (err) {
        setError(`Erreur de suppression: ${err.message}`);
      }
    }
  };

  // --- Drag and Drop handlers ---
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnStatus);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null);
      return;
    }

    try {
      const updatedTask = await apiCall(
        `${API_BASE_URL}/api/tasks/${draggedTask.id}`,
        'PUT',
        { ...draggedTask, status: newStatus },
        token
      );
      setTasks(tasks.map(t => (t.id === draggedTask.id ? updatedTask : t)));
    } catch (err) {
      setError(`Erreur de mise à jour: ${err.message}`);
    } finally {
      setDraggedTask(null);
    }
  };

  const dismissNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  // --- Render Auth Form ---
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md transform transition-all duration-300 hover:scale-105">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-2xl font-bold">K</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isLoginView ? 'Connexion' : 'Inscription'}
            </h1>
            <p className="text-gray-600">
              {isLoginView ? 'Connectez-vous à votre espace Kanban' : 'Créez votre compte Kanban'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-6">
            <div className="relative">
              <input
                type="email"
                placeholder="Adresse email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 pl-10"
              />
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </div>
            
            <div className="relative">
              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 pl-10"
              />
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            <button
              type="submit"
              disabled={authLoading || !email.trim() || !password.trim()}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-blue-600 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {authLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                  Chargement...
                </div>
              ) : (
                isLoginView ? 'Se connecter' : 'S\'inscrire'
              )}
            </button>
          </form>

          {authError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {authError}
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLoginView(!isLoginView);
                setAuthError('');
              }}
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200"
            >
              {isLoginView ? 'Pas de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Filter tasks
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  // --- Render Main App ---
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.slice(0, 3).map(notification => (
            <NotificationCard
              key={`${notification.id}-${notification.type}`}
              notification={notification}
              onDismiss={() => dismissNotification(notification.id)}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 w-10 h-10 rounded-lg flex items-center justify-center">
                <span className="text-white text-lg font-bold">G</span>
              </div>
              <div className="ml-4">
                <h1 className="text-xl font-semibold text-gray-900">
                  Gestion de tâches
                </h1>
                <p className="text-sm text-gray-500">
                  {user?.email}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-6 text-sm text-gray-600">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {tasks.length} tâches
                </span>
                {notifications.length > 0 && (
                  <span className="flex items-center text-orange-600">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {notifications.length} notification{notifications.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add Task Button */}
        <div className="mb-8">
          <button
            onClick={() => setShowTaskModal(true)}
            className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transform transition-all duration-200 hover:scale-105 shadow-lg"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Nouvelle tâche
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700 text-xl"
            >
              ×
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : (
          /* Kanban Board */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Todo Column */}
            <KanbanColumn
              title="À faire"
              count={todoTasks.length}
              tasks={todoTasks}
              color="blue"
              status="todo"
              dragOver={dragOverColumn === 'todo'}
              onDragOver={(e) => handleDragOver(e, 'todo')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'todo')}
              onDragStart={handleDragStart}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
            />

            {/* In Progress Column */}
            <KanbanColumn
              title="En cours"
              count={inProgressTasks.length}
              tasks={inProgressTasks}
              color="yellow"
              status="in-progress"
              dragOver={dragOverColumn === 'in-progress'}
              onDragOver={(e) => handleDragOver(e, 'in-progress')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'in-progress')}
              onDragStart={handleDragStart}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
            />

            {/* Done Column */}
            <KanbanColumn
              title="Terminé"
              count={doneTasks.length}
              tasks={doneTasks}
              color="green"
              status="done"
              dragOver={dragOverColumn === 'done'}
              onDragOver={(e) => handleDragOver(e, 'done')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'done')}
              onDragStart={handleDragStart}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
            />
          </div>
        )}
      </main>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          task={editingTask}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          onSubmit={handleTaskSubmit}
          onClose={resetTaskForm}
        />
      )}
    </div>
  );
}

// --- Task Modal Component ---
const TaskModal = ({ task, taskForm, setTaskForm, onSubmit, onClose }) => {
  const isEditing = !!task;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all duration-300 scale-100">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {isEditing ? 'Modifier la tâche' : 'Nouvelle tâche'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Titre *
            </label>
            <input
              type="text"
              value={taskForm.title}
              onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="Titre de la tâche"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
              placeholder="Description optionnelle"
            />
          </div>

          {/* Priority and Dates Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priorité
              </label>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Échéance
              </label>
              <input
                type="date"
                value={taskForm.due_date}
                onChange={(e) => setTaskForm(prev => ({ ...prev, due_date: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              />
            </div>

            {/* Reminder Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rappel
              </label>
              <input
                type="datetime-local"
                value={taskForm.reminder_date}
                onChange={(e) => setTaskForm(prev => ({ ...prev, reminder_date: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!taskForm.title.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditing ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Notification Component ---
const NotificationCard = ({ notification, onDismiss }) => {
  const typeStyles = {
    reminder: 'bg-blue-50 border-blue-200 text-blue-800',
    overdue: 'bg-red-50 border-red-200 text-red-800',
    'due-soon': 'bg-orange-50 border-orange-200 text-orange-800'
  };

  const typeIcons = {
    reminder: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
      </svg>
    ),
    overdue: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    'due-soon': (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <div className={`p-4 rounded-lg border-2 shadow-lg max-w-sm ${typeStyles[notification.type]} animate-slide-in`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {typeIcons[notification.type]}
          <span className="ml-2 font-medium">{notification.message}</span>
        </div>
        <button
          onClick={onDismiss}
          className="ml-4 text-current opacity-70 hover:opacity-100 transition-opacity duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// --- Kanban Column Component ---
const KanbanColumn = ({ 
  title, 
  count, 
  tasks, 
  color, 
  status, 
  dragOver, 
  onDragOver, 
  onDragLeave, 
  onDrop, 
  onDragStart, 
  onEdit, 
  onDelete 
}) => {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    green: 'border-green-200 bg-green-50 text-green-700'
  };

  const dragOverClasses = {
    blue: 'bg-blue-100 border-blue-300',
    yellow: 'bg-yellow-100 border-yellow-300',
    green: 'bg-green-100 border-green-300'
  };

  const icons = {
    blue: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    yellow: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2z" />
      </svg>
    ),
    green: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <div 
      className={`rounded-xl p-4 transition-all duration-200 ${
        dragOver 
          ? `bg-gray-200 border-2 ${dragOverClasses[color]}` 
          : 'bg-gray-100'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={`flex items-center justify-between p-3 rounded-lg border-2 ${colorClasses[color]} mb-4`}>
        <div className="flex items-center space-x-2">
          {icons[color]}
          <h3 className="font-semibold">{title}</h3>
        </div>
        <span className="text-sm font-medium px-2 py-1 bg-white rounded-full">
          {count}
        </span>
      </div>
      
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="w-16 h-16 mx-auto mb-3 opacity-20 flex items-center justify-center">
              {icons[color]}
            </div>
            <p>Aucune tâche</p>
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onDragStart={onDragStart}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
};

// --- Task Card Component ---
const TaskCard = ({ task, onDragStart, onEdit, onDelete }) => {
 

  const priorityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800'
  };

  const priorityLabels = {
    low: 'Faible',
    medium: 'Moyenne',
    high: 'Élevée'
  };

  return (
    <div 
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all duration-200 transform hover:scale-105 cursor-move"
      draggable
      onDragStart={(e) => onDragStart(e, task)}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-medium text-gray-900 leading-tight pr-2">
          {task.title}
        </h4>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <button
            onClick={() => onEdit(task)}
            className="text-gray-400 hover:text-blue-500 transition-colors duration-200 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="text-gray-400 hover:text-red-500 transition-colors duration-200 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      
      {task.description && (
        <p className="text-gray-600 text-sm mb-4 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Priority and dates */}
      <div className="space-y-2 mb-4">
        {task.priority && (
          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${priorityColors[task.priority]}`}>
            {priorityLabels[task.priority]}
          </span>
        )}
        
        {task.due_date && (
          <div className={`flex items-center text-xs ${
            isOverdue(task.due_date) 
              ? 'text-red-600' 
              : isDueSoon(task.due_date) 
                ? 'text-orange-600' 
                : 'text-gray-500'
          }`}>
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Échéance: {formatDate(task.due_date)}
            {isOverdue(task.due_date) && ' (En retard)'}
            {isDueSoon(task.due_date) && ' (Bientôt)'}
          </div>
        )}
        
        {task.reminder_date && (
          <div className="flex items-center text-xs text-blue-600">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
            </svg>
            Rappel: {formatDateTime(task.reminder_date)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center">
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(task.created_at || Date.now())}
        </div>
      </div>
    </div>
  );
};

export default App;