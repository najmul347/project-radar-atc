const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');

const DEFAULT_ADMIN = {
  username: 'admin1',
  password: 'corosRADAR',
  role: 'admin',
  createdAt: new Date().toISOString()
};

class UserManager {
  constructor() {
    this.users = [];
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        this.users = JSON.parse(raw);
        if (!Array.isArray(this.users) || this.users.length === 0) {
          this.users = [{ ...DEFAULT_ADMIN }];
          this.saveToFile();
        } else {
          // Ensure admin1 always exists with correct default credentials
          const adminIdx = this.users.findIndex(u => u.username.toLowerCase() === DEFAULT_ADMIN.username.toLowerCase());
          if (adminIdx === -1) {
            this.users.unshift({ ...DEFAULT_ADMIN });
            this.saveToFile();
          }
        }
      } else {
        this.users = [{ ...DEFAULT_ADMIN }];
        this.saveToFile();
      }
    } catch (err) {
      console.error('Error loading users.json, falling back to default admin:', err);
      this.users = [{ ...DEFAULT_ADMIN }];
    }
  }

  saveToFile() {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving users.json:', err);
    }
  }

  authenticate(username, password) {
    if (!username || !password) return null;
    const cleanUser = String(username).trim();
    const cleanPass = String(password);
    const found = this.users.find(u => u.username.toLowerCase() === cleanUser.toLowerCase());
    if (found && found.password === cleanPass) {
      return {
        username: found.username,
        role: found.role || 'user',
        createdAt: found.createdAt
      };
    }
    return null;
  }

  getAllUsers(includePasswords = false) {
    return this.users.map(u => {
      const item = {
        username: u.username,
        role: u.role || 'user',
        createdAt: u.createdAt || new Date().toISOString()
      };
      if (includePasswords) {
        item.password = u.password;
      }
      return item;
    });
  }

  addUser(username, password, role = 'user') {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();
    if (!cleanUser || !cleanPass) {
      throw new Error('Username and password are required');
    }
    if (cleanUser.length < 2) {
      throw new Error('Username must be at least 2 characters');
    }
    const exists = this.users.some(u => u.username.toLowerCase() === cleanUser.toLowerCase());
    if (exists) {
      throw new Error(`Username "${cleanUser}" already exists`);
    }

    const newUser = {
      username: cleanUser,
      password: cleanPass,
      role: role === 'admin' ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    };

    this.users.push(newUser);
    this.saveToFile();
    return {
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt
    };
  }

  deleteUser(username) {
    const cleanUser = String(username || '').trim();
    if (cleanUser.toLowerCase() === DEFAULT_ADMIN.username.toLowerCase()) {
      throw new Error('Cannot delete primary administrator account (admin1)');
    }
    const idx = this.users.findIndex(u => u.username.toLowerCase() === cleanUser.toLowerCase());
    if (idx === -1) {
      throw new Error(`User "${cleanUser}" not found`);
    }
    const removed = this.users.splice(idx, 1);
    this.saveToFile();
    return removed[0];
  }
}

const userManager = new UserManager();

module.exports = {
  userManager,
  DEFAULT_ADMIN
};
