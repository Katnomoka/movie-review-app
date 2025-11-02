 const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// 🔥 Use Realtime Database instead of Firestore
const db = admin.database(); // <-- Changed to Realtime Database

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ========== MOVIE API ROUTES ==========

// Get popular movies from TMDB
app.get('/api/movies/popular', async (req, res) => {
  try {
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.TMDB_API_KEY}&language=en-US&page=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Popular movies error:', error.message);
    res.status(500).json({ error: 'Failed to fetch popular movies' });
  }
});

// Search movies from TMDB
app.get('/api/movies/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&language=en-US&query=${encodedQuery}&page=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

// Get movie details from TMDB
app.get('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.TMDB_API_KEY}&language=en-US`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB error: ${response.status}`);
    const data = await response.json();
    if (data.success === false) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Movie detail error:', error.message);
    res.status(500).json({ error: 'Failed to fetch movie details' });
  }
});

// ========== REVIEW CRUD ROUTES (Realtime Database) ==========

// Create a review
app.post('/api/reviews', async (req, res) => {
  try {
    const { movieId, userId, userName, rating, reviewText, movieTitle, moviePoster } = req.body;

    if (!movieId || !userId || rating == null) {
      return res.status(400).json({ error: 'Missing required fields: movieId, userId, rating' });
    }

    const reviewData = {
      movieId,
      userId,
      userName: userName || 'Anonymous',
      rating,
      reviewText: reviewText || '',
      movieTitle: movieTitle || '',
      moviePoster: moviePoster || '',
      createdAt: Date.now(), // Realtime DB uses timestamps (number)
      updatedAt: Date.now()
    };

    const newReviewRef = await db.ref('reviews').push(reviewData);
    res.status(201).json({ id: newReviewRef.key, ...reviewData });
  } catch (error) {
    console.error('Create review error:', error.message);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// Get all reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const snapshot = await db.ref('reviews')
      .orderByChild('createdAt')
      .limitToLast(20)
      .once('value');

    const reviews = [];
    snapshot.forEach(child => {
      reviews.push({ id: child.key, ...child.val() });
    });
    reviews.reverse(); // newest first
    res.json(reviews);
  } catch (error) {
    console.error('Get all reviews error:', error.message);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get all reviews for a specific movie
app.get('/api/reviews/movie/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const snapshot = await db.ref('reviews')
      .orderByChild('movieId')
      .equalTo(movieId)
      .once('value');

    const reviews = [];
    snapshot.forEach(child => {
      reviews.push({ id: child.key, ...child.val() });
    });
    // Sort by createdAt (newest first)
    reviews.sort((a, b) => b.createdAt - a.createdAt);
    res.json(reviews);
  } catch (error) {
    console.error('Get reviews by movie error:', error.message);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get all reviews by a user
app.get('/api/reviews/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const snapshot = await db.ref('reviews')
      .orderByChild('userId')
      .equalTo(userId)
      .once('value');

    const reviews = [];
    snapshot.forEach(child => {
      reviews.push({ id: child.key, ...child.val() });
    });
    reviews.sort((a, b) => b.createdAt - a.createdAt);
    res.json(reviews);
  } catch (error) {
    console.error('Get reviews by user error:', error.message);
    res.status(500).json({ error: 'Failed to fetch user reviews' });
  }
});

// Update a review
app.put('/api/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, reviewText } = req.body;

    // Check if review exists
    const reviewRef = db.ref(`reviews/${id}`);
    const snapshot = await reviewRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const updateData = {
      updatedAt: Date.now()
    };
    if (rating !== undefined) updateData.rating = rating;
    if (reviewText !== undefined) updateData.reviewText = reviewText;

    await reviewRef.update(updateData);
    res.json({ message: 'Review updated successfully' });
  } catch (error) {
    console.error('Update review error:', error.message);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Delete a review
app.delete('/api/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reviewRef = db.ref(`reviews/${id}`);
    const snapshot = await reviewRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Review not found' });
    }

    await reviewRef.remove();
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error.message);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('✅ TMDB_API_KEY loaded:', process.env.TMDB_API_KEY ? 'Yes!' : 'NO!');
});