require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const app = express();

app.use(cors({ origin: 'http://localhost:3000' })); // Adjust origin for production
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Schemas
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const ActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  value: Number,
  unit: String,
  carbon: Number,
  date: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);
const Activity = mongoose.model('Activity', ActivitySchema);

// JWT Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, 'secret_key');
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Carbon Calculation with Weather Adjustment
const calculateCarbon = async (type, value, unit, weatherImpact) => {
  const baseFactors = { transport: 0.2, electricity: 0.5, food: 2.5 };
  return value * (baseFactors[type] || 1) * (weatherImpact || 1.0);
};

// Fetch Weather Impact
const getWeatherImpact = async () => {
  try {
    const weatherRes = await axios.get('https://api.openweathermap.org/data/2.5/weather?q=Delhi&appid=YOUR_API_KEY&units=metric');
    const temp = weatherRes.data.main.temp;
    return temp > 30 ? 1.2 : temp < 15 ? 0.8 : 1.0;
  } catch (err) {
    console.error('Weather API error:', err);
    return 1.0;
  }
};

// Suggestions
const getSuggestions = (activities) => {
  const suggestions = [];
  const transport = activities.filter(a => a.type === 'transport').reduce((sum, a) => sum + a.value, 0);
  const electricity = activities.filter(a => a.type === 'electricity').reduce((sum, a) => sum + a.value, 0);
  if (transport > 100) suggestions.push({ text: 'Consider carpooling or using public transport.', notified: false });
  if (electricity > 200) suggestions.push({ text: 'Switch to LED bulbs or unplug devices.', notified: false });
  return suggestions;
};

// Achievements
const getAchievements = (activities) => {
  const achievements = [];
  const totalCarbon = activities.reduce((sum, a) => sum + a.carbon, 0);
  if (activities.length > 10) achievements.push({ text: 'Consistent Tracker: Logged 10+ activities!', notified: false });
  if (totalCarbon < 50) achievements.push({ text: 'Eco Warrior: Kept footprint below 50kg CO₂!', notified: false });
  return achievements;
};

// SSE Event Stream
app.get('/api/events', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };

  const updateLoop = async () => {
    try {
      const activities = await Activity.find({ userId: req.userId });
      const score = await calculateCarbonScore(req.userId);
      const suggestions = getSuggestions(activities);
      const achievements = getAchievements(activities);
      const weatherImpact = await getWeatherImpact();
      sendEvent('activities', activities);
      sendEvent('carbonScore', score);
      sendEvent('suggestions', suggestions);
      sendEvent('achievements', achievements);
      sendEvent('weatherImpact', weatherImpact);
    } catch (err) {
      console.error('SSE update error:', err);
    }
  };

  updateLoop();
  const interval = setInterval(updateLoop, 5000);
  req.on('close', () => clearInterval(interval));
});

// Helper to calculate carbon score
const calculateCarbonScore = async (userId) => {
  const activities = await Activity.find({ userId });
  return activities.reduce((sum, a) => sum + a.carbon, 0);
};

// 👤 Register
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ message: err.code === 11000 ? 'Email already exists' : 'Registration failed' });
  }
});

// 🔐 Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ userId: user._id }, 'secret_key', { expiresIn: '1h' });
  res.json({ token, user: { email: user.email } });
});

// 👤 Get logged-in user
app.get('/api/user', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({ email: user.email });
});

// 📋 Activities
app.get('/api/activities', authMiddleware, async (req, res) => {
  const activities = await Activity.find({ userId: req.userId });
  res.json(activities);
});

app.post('/api/activities', authMiddleware, async (req, res) => {
  const { type, value, unit } = req.body;
  const weatherImpact = await getWeatherImpact();
  const carbon = await calculateCarbon(type, value, unit, weatherImpact);
  const activity = new Activity({ userId: req.userId, type, value, unit, carbon });
  await activity.save();
  res.status(201).json(activity);
});

// 📊 Carbon score
app.get('/api/carbon-score', authMiddleware, async (req, res) => {
  const score = await calculateCarbonScore(req.userId);
  res.json({ score });
});

// 💡 Suggestions
app.get('/api/suggestions', authMiddleware, async (req, res) => {
  const activities = await Activity.find({ userId: req.userId });
  res.json(getSuggestions(activities));
});

// 🏆 Achievements
app.get('/api/achievements', authMiddleware, async (req, res) => {
  const activities = await Activity.find({ userId: req.userId });
  res.json(getAchievements(activities));
});

// 🥇 Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find();
  const leaderboard = await Promise.all(users.map(async (user) => {
    const score = await calculateCarbonScore(user._id);
    return { email: user.email, score };
  }));
  res.json(leaderboard.sort((a, b) => a.score - b.score));
});

// 🌍 Home route
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 🔊 Start server
app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
