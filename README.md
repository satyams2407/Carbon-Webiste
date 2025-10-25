#Carbon Footprint Tracker
A web application to track and reduce your carbon footprint.

## Setup Instructions

1. **Backend Setup**:
   - Install Node.js and MongoDB.
   - Run `npm install express mongoose bcryptjs jsonwebtoken cors`.
   - Start MongoDB: `mongod`.
   - Run the server: `node server.js`.

2. **Frontend Setup**:
   - Serve `index.html` through a static file server or open directly in a browser (uses CDN for React and Tailwind).

3. **Database**:
   - Ensure MongoDB is running and accessible at `mongodb://localhost/carbon_tracker`.

4. **Usage**:
   - Register or log in to start tracking activities.
   - Log activities (transport, electricity, food) to see your carbon score.
   - View eco-friendly suggestions and achievements on the dashboard.
   - Check the leaderboard to compare with others.

## Notes
- Carbon calculations are simplified (e.g., 0.2 kg CO₂/km for transport).
- Suggestions and achievements are rule-based.
- Authentication uses JWT for security.
