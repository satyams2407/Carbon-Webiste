const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
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

// Carbon Calculation
const calculateCarbon = (type, value, unit) => {
  const factors = {
    transport: { km: 0.2 },
    electricity: { kWh: 0.5 },
    food: { kg: 2.5 },
  };
  return value * (factors[type]?.[unit] || 1);
};

// Suggestions
const getSuggestions = (activities) => {
  const suggestions = [];
  const transport = activities.filter(a => a.type === 'transport').reduce((sum, a) => sum + a.value, 0);
  const electricity = activities.filter(a => a.type === 'electricity').reduce((sum, a) => sum + a.value, 0);

  if (transport > 100) suggestions.push('Consider carpooling or using public transport.');
  if (electricity > 200) suggestions.push('Switch to LED bulbs or unplug devices.');
  return suggestions;
};

// Achievements
const getAchievements = (activities) => {
  const achievements = [];
  const totalCarbon = activities.reduce((sum, a) => sum + a.carbon, 0);
  if (activities.length > 10) achievements.push('Consistent Tracker: Logged 10+ activities!');
  if (totalCarbon < 50) achievements.push('Eco Warrior: Kept footprint below 50kg CO₂!');
  return achievements;
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
  console.log(`Login attempt: ${email}`);

  const user = await User.findOne({ email });  // <== This line defines user

  if (!user) {
    console.log("❌ User not found");
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Now safely log
  console.log('Entered password:', password);
  console.log('Stored hashed password:', user.password);

  const isMatch = await bcrypt.compare(password, user.password);
  console.log('Password match:', isMatch);

  if (!isMatch) {
    console.log("❌ Password incorrect");
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  console.log("✅ Login successful");
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
  const carbon = calculateCarbon(type, value, unit);
  const activity = new Activity({ userId: req.userId, type, value, unit, carbon });
  await activity.save();
  res.status(201).json(activity);
});

// 📊 Carbon score
app.get('/api/carbon-score', authMiddleware, async (req, res) => {
  const activities = await Activity.find({ userId: req.userId });
  const score = activities.reduce((sum, a) => sum + a.carbon, 0);
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
    const activities = await Activity.find({ userId: user._id });
    const score = activities.reduce((sum, a) => sum + a.carbon, 0);
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
