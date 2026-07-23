import { Pool } from 'pg';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedbackCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}

export interface FeedbackItem {
  id: string;
  customerId: string;
  customerName: string;
  reviewText: string;
  rating: number;
  source: string;
  reviewDate: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  confidenceScore: number;
  categories: string[];
  createdAt: string;
}

export interface Category {
  id: string;
  categoryName: string;
}

export interface WeeklySummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalReviews: number;
  positiveReviews: number;
  neutralReviews: number;
  negativeReviews: number;
  averageRating: number;
  topCategory: string;
  trendingMetric: string;
  generatedAt: string;
}

export interface FeedbackAnalytics {
  // Overview KPIs
  totalReviews: number;
  averageRating: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
  recentReviews: FeedbackItem[];
  reviewGrowthPercent: number;

  // Distributions
  ratingDistribution: { rating: number; count: number }[];
  reviewsBySource: { source: string; count: number; avgRating: number }[];
  reviewsByCustomer: { customerName: string; count: number; avgRating: number }[];

  // Categories
  categoryDistribution: { categoryName: string; count: number; avgRating: number }[];
  topCategory: string;
  leastCategory: string;

  // Trends
  monthlyReviews: { month: string; count: number; avgRating: number }[];
  weeklyReviews: { week: string; count: number }[];
  ratingTrend: { month: string; avgRating: number }[];
  sentimentTrend: { month: string; positive: number; negative: number; neutral: number }[];
  peakReviewDays: { dayName: string; count: number }[];
  categoryTrend: { month: string; categoryName: string; count: number }[];
  topImprovingCategory: string;
  topDecliningCategory: string;

  // Satisfaction
  monthlySatisfaction: { month: string; positive: number; neutral: number; negative: number; total: number }[];

  // Reputation
  reputationScore: number;
  ratingTrendDirection: 'up' | 'down' | 'stable';
  oneStarCount: number;
  fiveStarCount: number;
  negativeGrowthPercent: number;
}

// ── Sentiment Analysis (DistilBERT-style rule-based, same output schema) ──────

const POS_WORDS = [
  'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'delicious', 'love', 'loved',
  'perfect', 'best', 'awesome', 'outstanding', 'superb', 'tasty', 'fresh', 'friendly',
  'quick', 'fast', 'clean', 'recommend', 'happy', 'satisfied', 'enjoy', 'enjoyed',
  'pleasant', 'cozy', 'warm', 'good', 'nice', 'polite', 'helpful', 'beautiful',
  'impressed', 'generous', 'rich', 'flavorful', 'crispy', 'authentic', 'reasonable',
  'value', 'yummy', 'scrumptious', 'prompt', 'efficient', 'courteous', 'neat', 'spotless',
];

const NEG_WORDS = [
  'terrible', 'awful', 'bad', 'worst', 'horrible', 'disgusting', 'slow', 'cold', 'rude',
  'dirty', 'expensive', 'overpriced', 'disappointed', 'disappointing', 'poor',
  'unacceptable', 'bland', 'stale', 'undercooked', 'overcooked', 'waited', 'never',
  'wrong', 'mistake', 'complaint', 'issue', 'problem', 'pathetic', 'mediocre',
  'unhygienic', 'tasteless', 'salty', 'burnt', 'dry', 'soggy', 'oily', 'greasy',
  'avoid', 'refund', 'ignored', 'inattentive', 'filthy', 'noisy', 'overcrowded',
];

export function analyzeSentiment(text: string): { sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; confidence: number } {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  POS_WORDS.forEach(w => { if (lower.includes(w)) pos++; });
  NEG_WORDS.forEach(w => { if (lower.includes(w)) neg++; });

  const total = pos + neg;
  if (total === 0) return { sentiment: 'NEUTRAL', confidence: 0.61 };

  const ratio = pos / total;
  if (ratio >= 0.65) return { sentiment: 'POSITIVE', confidence: Math.min(0.98, 0.68 + ratio * 0.30) };
  if (ratio <= 0.35) return { sentiment: 'NEGATIVE', confidence: Math.min(0.98, 0.68 + (1 - ratio) * 0.30) };
  return { sentiment: 'NEUTRAL', confidence: 0.55 + Math.abs(ratio - 0.5) * 0.5 };
}

// ── Review Categorization (facebook/bart-large-mnli-style, keyword-based) ─────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food Quality': [
    'food', 'taste', 'flavor', 'delicious', 'dish', 'meal', 'fresh', 'cuisine', 'cooked',
    'chef', 'menu', 'portion', 'crispy', 'bland', 'spicy', 'sweet', 'salty', 'rich',
    'authentic', 'stale', 'undercooked', 'overcooked', 'soggy', 'oily', 'burnt', 'dry',
    'biryani', 'curry', 'tandoori', 'bread', 'dessert', 'appetizer', 'starter', 'main',
  ],
  'Service': [
    'service', 'waiter', 'waitress', 'server', 'attended', 'helpful', 'courteous',
    'attentive', 'polite', 'rude', 'ignored', 'inattentive', 'responsive',
  ],
  'Ambiance': [
    'ambiance', 'atmosphere', 'decor', 'interior', 'cozy', 'music', 'lighting',
    'vibe', 'setting', 'environment', 'view', 'outdoor', 'indoor', 'noisy', 'quiet',
    'romantic', 'crowded', 'spacious',
  ],
  'Price / Value': [
    'price', 'expensive', 'cheap', 'value', 'worth', 'affordable', 'cost', 'bill',
    'overpriced', 'reasonable', 'budget', 'money', 'pricey',
  ],
  'Delivery': [
    'delivery', 'delivered', 'courier', 'packaging', 'packed', 'takeout', 'takeaway',
    'swiggy', 'zomato', 'online order',
  ],
  'Cleanliness': [
    'clean', 'hygiene', 'dirty', 'sanitation', 'tidy', 'unhygienic', 'spotless', 'filthy',
    'washroom', 'restroom', 'toilet',
  ],
  'Wait Time': [
    'wait', 'waited', 'waiting', 'slow', 'delay', 'long time', 'minutes', 'hours',
    'took forever', 'quickly', 'prompt',
  ],
};

export function categorizeReview(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) matched.push(category);
  }
  return matched.length > 0 ? matched : ['Food Quality'];
}

// ── Seed data ─────────────────────────────────────────────────────────────────

interface SeedReview {
  customerId: string;
  reviewText: string;
  rating: number;
  source: string;
  daysAgo: number;
}

const SEED_REVIEWS: SeedReview[] = [
  { customerId: 'cust1', reviewText: 'Amazing food! The biryani was absolutely delicious and the service was outstanding. Will definitely come back for more.', rating: 5, source: 'Google', daysAgo: 60 },
  { customerId: 'cust2', reviewText: 'Terrible experience. Waited 45 minutes for food and it arrived cold. The staff was rude and completely ignored us.', rating: 1, source: 'Yelp', daysAgo: 58 },
  { customerId: 'cust3', reviewText: 'Good ambiance and cozy setting. The food was decent but a bit overpriced for the portion size you get.', rating: 3, source: 'Zomato', daysAgo: 56 },
  { customerId: 'cust4', reviewText: 'The tandoori chicken was outstanding! Best I have had in the city. Friendly and attentive staff made the experience perfect.', rating: 5, source: 'TripAdvisor', daysAgo: 55 },
  { customerId: 'cust5', reviewText: 'Food was okay but nothing special. Service was slow and the place was not very clean. Expected better hygiene.', rating: 2, source: 'Google', daysAgo: 53 },
  { customerId: 'cust6', reviewText: 'Excellent dal makhani and fresh naan! The rich flavors were authentic and the cozy atmosphere made it a lovely evening.', rating: 5, source: 'Yelp', daysAgo: 51 },
  { customerId: 'cust1', reviewText: 'Mediocre meal overall. The dish was bland and the waiter seemed disinterested. Portion was small for the price.', rating: 2, source: 'Zomato', daysAgo: 49 },
  { customerId: 'cust2', reviewText: 'Fantastic lunch experience! The menu had great variety, staff were polite and the food arrived quickly. Highly recommend!', rating: 5, source: 'Google', daysAgo: 47 },
  { customerId: 'cust3', reviewText: 'The curry was overcooked and tasteless. Very disappointing for the price. The restroom was dirty too.', rating: 1, source: 'TripAdvisor', daysAgo: 46 },
  { customerId: 'cust4', reviewText: 'Wonderful ambiance and good value for money. The chef clearly takes pride in authentic preparation. Pleasant evening!', rating: 4, source: 'Yelp', daysAgo: 44 },
  { customerId: 'cust5', reviewText: 'The biryani delivery packaging was poor and food was soggy. Taste was acceptable though. Delivery was delayed by an hour.', rating: 2, source: 'Zomato', daysAgo: 42 },
  { customerId: 'cust6', reviewText: 'Really enjoyed the meal. Fresh ingredients, crispy starters, and generous portions. Great service and clean environment.', rating: 5, source: 'Google', daysAgo: 40 },
  { customerId: 'cust1', reviewText: 'Average experience. The food took a long time to arrive and the waiter was not very helpful when we asked questions.', rating: 3, source: 'Yelp', daysAgo: 38 },
  { customerId: 'cust2', reviewText: 'Best restaurant in town! Outstanding food quality, spotless cleanliness, and the staff went above and beyond. Love this place!', rating: 5, source: 'TripAdvisor', daysAgo: 37 },
  { customerId: 'cust3', reviewText: 'The paneer tikka was dry and burnt. The bill was also incorrect and the manager was unhelpful. Avoid this place.', rating: 1, source: 'Google', daysAgo: 35 },
  { customerId: 'cust4', reviewText: 'Nice cozy place with good music and pleasant lighting. Food was tasty and reasonably priced. Will visit again.', rating: 4, source: 'Zomato', daysAgo: 33 },
  { customerId: 'cust5', reviewText: 'Excellent service from the entire team. The menu variety is impressive and every dish we tried was fresh and flavorful.', rating: 5, source: 'Google', daysAgo: 31 },
  { customerId: 'cust6', reviewText: 'Waited over an hour for our order. The food was cold when it arrived and the waiter was rude. Terrible experience.', rating: 1, source: 'Yelp', daysAgo: 30 },
  { customerId: 'cust1', reviewText: 'Good food but the ambiance is too noisy and crowded. Could work on seating arrangement. The staff was friendly though.', rating: 3, source: 'Zomato', daysAgo: 28 },
  { customerId: 'cust2', reviewText: 'Amazing value for money! The portions are generous, food is fresh and the customer service is top notch. Highly recommend!', rating: 5, source: 'TripAdvisor', daysAgo: 26 },
  { customerId: 'cust3', reviewText: 'The fish curry was undercooked and greasy. Not impressed at all. The price is too high for such poor quality food.', rating: 2, source: 'Google', daysAgo: 25 },
  { customerId: 'cust4', reviewText: 'Scrumptious meal from start to finish! The chef is clearly talented, everything was perfectly cooked and beautifully presented.', rating: 5, source: 'Yelp', daysAgo: 23 },
  { customerId: 'cust5', reviewText: 'Decent place for a quick lunch. The menu is average, nothing extraordinary. Service was prompt and the place was tidy.', rating: 3, source: 'Zomato', daysAgo: 21 },
  { customerId: 'cust6', reviewText: 'Had a wonderful birthday dinner here! The staff was attentive, the food was delicious and the ambiance was romantic. Perfect!', rating: 5, source: 'Google', daysAgo: 19 },
  { customerId: 'cust1', reviewText: 'Pathetic delivery service. Food arrived an hour late, packaging was damaged. Taste was okay but the experience was horrible.', rating: 2, source: 'Yelp', daysAgo: 18 },
  { customerId: 'cust2', reviewText: 'Fresh ingredients and authentic flavors. The helpful staff suggested great dishes and the meal was outstanding. Loved it!', rating: 5, source: 'TripAdvisor', daysAgo: 16 },
  { customerId: 'cust3', reviewText: 'The food was just okay. Nothing special but not bad either. Ambiance is pleasant and prices are reasonable. Average overall.', rating: 3, source: 'Google', daysAgo: 14 },
  { customerId: 'cust4', reviewText: 'Excellent food! The butter chicken was rich and creamy, service was fast and efficient. Clean restaurant. Will recommend to friends.', rating: 5, source: 'Zomato', daysAgo: 12 },
  { customerId: 'cust5', reviewText: 'Disgusting food and unhygienic conditions. Found something in the curry. Complained to the manager who was dismissive. Never going back.', rating: 1, source: 'Yelp', daysAgo: 11 },
  { customerId: 'cust6', reviewText: 'Great place for family dining! Kids menu available, staff are patient and helpful, food is tasty and fresh. Recommended!', rating: 4, source: 'Google', daysAgo: 9 },
  { customerId: 'cust1', reviewText: 'The grilled dishes were amazing and the service was prompt. Good value for money. The outdoor seating area is very pleasant.', rating: 4, source: 'TripAdvisor', daysAgo: 8 },
  { customerId: 'cust2', reviewText: 'Disappointed with the meal. The biryani was dry and saltier than expected. The wait time was too long for a weekday lunch.', rating: 2, source: 'Zomato', daysAgo: 7 },
  { customerId: 'cust3', reviewText: 'Wonderful experience! Every dish was flavorful and freshly prepared. The cozy interior and friendly staff made it memorable.', rating: 5, source: 'Google', daysAgo: 5 },
  { customerId: 'cust4', reviewText: 'Good restaurant with decent food. Service could be quicker but overall a pleasant dining experience. Would come back.', rating: 4, source: 'Yelp', daysAgo: 4 },
  { customerId: 'cust5', reviewText: 'The lamb rogan josh was outstanding — rich, aromatic and perfectly spiced. Excellent portion size and affordable price. Highly recommended!', rating: 5, source: 'TripAdvisor', daysAgo: 3 },
  { customerId: 'cust6', reviewText: 'Mediocre at best. The food was neither hot nor fresh, the ambiance was mediocre and service was average. Not value for money.', rating: 2, source: 'Google', daysAgo: 2 },
  { customerId: 'cust1', reviewText: 'Fantastic dinner! The menu has great variety, the chef clearly has talent. Clean premises and very courteous staff. Amazing experience!', rating: 5, source: 'Zomato', daysAgo: 1 },
  { customerId: 'cust2', reviewText: 'The appetizers were crispy and delicious but the main course was bland. The friendly waiter helped us choose better next time.', rating: 3, source: 'Google', daysAgo: 1 },
  { customerId: 'cust3', reviewText: 'Really bad delivery. Food was cold and packaging was poor. This is the second time this has happened. Very disappointed.', rating: 1, source: 'Yelp', daysAgo: 0 },
  { customerId: 'cust4', reviewText: 'Absolutely loved the desserts! The gulab jamun and kheer were perfectly sweet. Staff was warm and the ambiance was beautiful.', rating: 5, source: 'TripAdvisor', daysAgo: 0 },
];

// ── Store ─────────────────────────────────────────────────────────────────────

export class FeedbackDbStore {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    // feedback_customers
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS feedback_customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // customer_feedback
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS customer_feedback (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        review_text TEXT NOT NULL,
        rating INT NOT NULL,
        source TEXT NOT NULL DEFAULT 'Direct',
        review_date TEXT NOT NULL,
        sentiment TEXT NOT NULL DEFAULT 'NEUTRAL',
        confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // categories
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS feedback_categories (
        id TEXT PRIMARY KEY,
        category_name TEXT NOT NULL UNIQUE
      )
    `);

    // feedback_category_mapping
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS feedback_category_mapping (
        feedback_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (feedback_id, category_id)
      )
    `);

    // weekly_feedback_summary
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_feedback_summary (
        id TEXT PRIMARY KEY,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        total_reviews INT NOT NULL DEFAULT 0,
        positive_reviews INT NOT NULL DEFAULT 0,
        neutral_reviews INT NOT NULL DEFAULT 0,
        negative_reviews INT NOT NULL DEFAULT 0,
        average_rating NUMERIC(4,2) NOT NULL DEFAULT 0,
        top_category TEXT NOT NULL DEFAULT '',
        trending_metric TEXT NOT NULL DEFAULT '',
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Seed categories
    const cats = Object.keys(CATEGORY_KEYWORDS);
    for (let i = 0; i < cats.length; i++) {
      const catId = `cat${i + 1}`;
      await this.pool.query(
        `INSERT INTO feedback_categories (id, category_name) VALUES ($1, $2) ON CONFLICT (category_name) DO NOTHING`,
        [catId, cats[i]]
      );
    }

    // Seed customers + reviews if empty
    const count = await this.pool.query('SELECT COUNT(*)::int AS c FROM customer_feedback');
    if ((count.rows[0]?.c ?? 0) > 0) return;

    const customers = [
      { id: 'cust1', name: 'Arjun Sharma', email: 'arjun@example.com', phone: '9876501001' },
      { id: 'cust2', name: 'Priya Mehta', email: 'priya@example.com', phone: '9876501002' },
      { id: 'cust3', name: 'Rahul Verma', email: 'rahul@example.com', phone: '9876501003' },
      { id: 'cust4', name: 'Sneha Patel', email: 'sneha@example.com', phone: '9876501004' },
      { id: 'cust5', name: 'Vikram Rao', email: 'vikram@example.com', phone: '9876501005' },
      { id: 'cust6', name: 'Ananya Singh', email: 'ananya@example.com', phone: '9876501006' },
    ];

    for (const c of customers) {
      await this.pool.query(
        `INSERT INTO feedback_customers (id, name, email, phone) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [c.id, c.name, c.email, c.phone]
      );
    }

    const catRows = await this.pool.query('SELECT id, category_name FROM feedback_categories');
    const catMap: Record<string, string> = {};
    catRows.rows.forEach((r: any) => { catMap[r.category_name] = r.id; });

    for (let i = 0; i < SEED_REVIEWS.length; i++) {
      const sr = SEED_REVIEWS[i];
      if (!sr) continue;
      const date = new Date();
      date.setDate(date.getDate() - sr.daysAgo);
      const reviewDate = date.toISOString().split('T')[0];
      const id = `fb${String(i + 1).padStart(3, '0')}`;

      const { sentiment, confidence } = analyzeSentiment(sr.reviewText);
      const categories = categorizeReview(sr.reviewText);

      await this.pool.query(
        `INSERT INTO customer_feedback (id, customer_id, review_text, rating, source, review_date, sentiment, confidence_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, sr.customerId, sr.reviewText, sr.rating, sr.source, reviewDate, sentiment, confidence]
      );

      for (const cat of categories) {
        const catId = catMap[cat];
        if (catId) {
          await this.pool.query(
            `INSERT INTO feedback_category_mapping (feedback_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [id, catId]
          );
        }
      }
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getFeedback(): Promise<FeedbackItem[]> {
    const r = await this.pool.query(`
      SELECT cf.id, cf.customer_id AS "customerId", fc.name AS "customerName",
             cf.review_text AS "reviewText", cf.rating, cf.source,
             cf.review_date AS "reviewDate", cf.sentiment,
             cf.confidence_score::float AS "confidenceScore",
             cf.created_at AS "createdAt",
             COALESCE(
               ARRAY_AGG(fcat.category_name ORDER BY fcat.category_name) FILTER (WHERE fcat.category_name IS NOT NULL),
               '{}'
             ) AS categories
      FROM customer_feedback cf
      JOIN feedback_customers fc ON fc.id = cf.customer_id
      LEFT JOIN feedback_category_mapping fcm ON fcm.feedback_id = cf.id
      LEFT JOIN feedback_categories fcat ON fcat.id = fcm.category_id
      GROUP BY cf.id, fc.name
      ORDER BY cf.review_date DESC, cf.created_at DESC
    `);
    return r.rows as FeedbackItem[];
  }

  async addFeedback(data: {
    customerId?: string;
    customerName?: string;
    reviewText: string;
    rating: number;
    source: string;
    reviewDate?: string;
  }): Promise<FeedbackItem> {
    const id = `fb${Date.now()}`;

    // Resolve or create customer
    let customerId = data.customerId ?? '';
    if (!customerId && data.customerName) {
      const existing = await this.pool.query(
        'SELECT id FROM feedback_customers WHERE name = $1 LIMIT 1', [data.customerName]
      );
      if (existing.rows[0]) {
        customerId = existing.rows[0].id;
      } else {
        customerId = `cust${Date.now()}`;
        await this.pool.query(
          'INSERT INTO feedback_customers (id, name) VALUES ($1,$2)',
          [customerId, data.customerName]
        );
      }
    }

    const reviewDate = data.reviewDate ?? new Date().toISOString().split('T')[0];
    const { sentiment, confidence } = analyzeSentiment(data.reviewText);
    const categories = categorizeReview(data.reviewText);

    await this.pool.query(
      `INSERT INTO customer_feedback (id, customer_id, review_text, rating, source, review_date, sentiment, confidence_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, customerId, data.reviewText, data.rating, data.source, reviewDate, sentiment, confidence]
    );

    // Map categories
    const catRows = await this.pool.query('SELECT id, category_name FROM feedback_categories');
    const catMap: Record<string, string> = {};
    catRows.rows.forEach((r: any) => { catMap[r.category_name] = r.id; });

    for (const cat of categories) {
      const catId = catMap[cat];
      if (catId) {
        await this.pool.query(
          `INSERT INTO feedback_category_mapping (feedback_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, catId]
        );
      }
    }

    const feedbackRow = await this.pool.query(
      `SELECT cf.id, cf.customer_id AS "customerId", fc.name AS "customerName",
              cf.review_text AS "reviewText", cf.rating, cf.source,
              cf.review_date AS "reviewDate", cf.sentiment,
              cf.confidence_score::float AS "confidenceScore",
              cf.created_at AS "createdAt",
              COALESCE(
                ARRAY_AGG(fcat.category_name ORDER BY fcat.category_name) FILTER (WHERE fcat.category_name IS NOT NULL),
                '{}'
              ) AS categories
       FROM customer_feedback cf
       JOIN feedback_customers fc ON fc.id = cf.customer_id
       LEFT JOIN feedback_category_mapping fcm ON fcm.feedback_id = cf.id
       LEFT JOIN feedback_categories fcat ON fcat.id = fcm.category_id
       WHERE cf.id = $1
       GROUP BY cf.id, fc.name`, [id]
    );
    return feedbackRow.rows[0] as FeedbackItem;
  }

  async getCustomers(): Promise<FeedbackCustomer[]> {
    const r = await this.pool.query(
      `SELECT id, name, email, phone, created_at AS "createdAt"
       FROM feedback_customers ORDER BY name`
    );
    return r.rows as FeedbackCustomer[];
  }

  async getCategories(): Promise<Category[]> {
    const r = await this.pool.query(
      'SELECT id, category_name AS "categoryName" FROM feedback_categories ORDER BY category_name'
    );
    return r.rows as Category[];
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  async getAnalytics(): Promise<FeedbackAnalytics> {
    const [
      totals,
      ratingDist,
      bySource,
      byCustomer,
      catDist,
      monthly,
      weekly,
      ratingTrend,
      sentimentTrend,
      peakDays,
      catTrend,
    ] = await Promise.all([
      // Totals
      this.pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(AVG(rating), 0)::float AS avg_rating,
          COUNT(*) FILTER (WHERE sentiment = 'POSITIVE')::int AS pos,
          COUNT(*) FILTER (WHERE sentiment = 'NEUTRAL')::int AS neu,
          COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE')::int AS neg,
          COUNT(*) FILTER (WHERE rating = 1)::int AS one_star,
          COUNT(*) FILTER (WHERE rating = 5)::int AS five_star
        FROM customer_feedback
      `),
      // Rating distribution
      this.pool.query(`
        SELECT rating, COUNT(*)::int AS count
        FROM customer_feedback
        GROUP BY rating ORDER BY rating
      `),
      // By source
      this.pool.query(`
        SELECT source, COUNT(*)::int AS count, COALESCE(AVG(rating),0)::float AS "avgRating"
        FROM customer_feedback
        GROUP BY source ORDER BY count DESC
      `),
      // By customer
      this.pool.query(`
        SELECT fc.name AS "customerName", COUNT(cf.id)::int AS count,
               COALESCE(AVG(cf.rating),0)::float AS "avgRating"
        FROM customer_feedback cf
        JOIN feedback_customers fc ON fc.id = cf.customer_id
        GROUP BY fc.name ORDER BY count DESC
      `),
      // Category distribution with avg rating
      this.pool.query(`
        SELECT fcat.category_name AS "categoryName",
               COUNT(DISTINCT fcm.feedback_id)::int AS count,
               COALESCE(AVG(cf.rating),0)::float AS "avgRating"
        FROM feedback_categories fcat
        LEFT JOIN feedback_category_mapping fcm ON fcm.category_id = fcat.id
        LEFT JOIN customer_feedback cf ON cf.id = fcm.feedback_id
        GROUP BY fcat.category_name
        ORDER BY count DESC
      `),
      // Monthly reviews
      this.pool.query(`
        SELECT TO_CHAR(review_date::date, 'YYYY-MM') AS month,
               COUNT(*)::int AS count,
               COALESCE(AVG(rating),0)::float AS "avgRating"
        FROM customer_feedback
        GROUP BY month ORDER BY month DESC LIMIT 12
      `),
      // Weekly reviews
      this.pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('week', review_date::date), 'YYYY-MM-DD') AS week,
               COUNT(*)::int AS count
        FROM customer_feedback
        GROUP BY week ORDER BY week DESC LIMIT 8
      `),
      // Rating trend (monthly avg)
      this.pool.query(`
        SELECT TO_CHAR(review_date::date, 'YYYY-MM') AS month,
               COALESCE(AVG(rating),0)::float AS "avgRating"
        FROM customer_feedback
        GROUP BY month ORDER BY month ASC LIMIT 12
      `),
      // Sentiment trend (monthly)
      this.pool.query(`
        SELECT TO_CHAR(review_date::date, 'YYYY-MM') AS month,
               COUNT(*) FILTER (WHERE sentiment = 'POSITIVE')::int AS positive,
               COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE')::int AS negative,
               COUNT(*) FILTER (WHERE sentiment = 'NEUTRAL')::int AS neutral
        FROM customer_feedback
        GROUP BY month ORDER BY month ASC LIMIT 12
      `),
      // Peak review days (day of week)
      this.pool.query(`
        SELECT TO_CHAR(review_date::date, 'Day') AS "dayName",
               EXTRACT(DOW FROM review_date::date)::int AS dow,
               COUNT(*)::int AS count
        FROM customer_feedback
        GROUP BY "dayName", dow ORDER BY count DESC
      `),
      // Category trend (last 3 months)
      this.pool.query(`
        SELECT TO_CHAR(cf.review_date::date, 'YYYY-MM') AS month,
               fcat.category_name AS "categoryName",
               COUNT(*)::int AS count
        FROM customer_feedback cf
        JOIN feedback_category_mapping fcm ON fcm.feedback_id = cf.id
        JOIN feedback_categories fcat ON fcat.id = fcm.category_id
        WHERE cf.review_date::date >= (CURRENT_DATE - INTERVAL '90 days')
        GROUP BY month, fcat.category_name ORDER BY month ASC, count DESC
      `),
    ]);

    const tot = totals.rows[0];
    const total = tot?.total ?? 0;
    const pos = tot?.pos ?? 0;
    const neu = tot?.neu ?? 0;
    const neg = tot?.neg ?? 0;

    // Recent reviews (last 10 with categories)
    const recentRes = await this.pool.query(`
      SELECT cf.id, cf.customer_id AS "customerId", fc.name AS "customerName",
             cf.review_text AS "reviewText", cf.rating, cf.source,
             cf.review_date AS "reviewDate", cf.sentiment,
             cf.confidence_score::float AS "confidenceScore",
             cf.created_at AS "createdAt",
             COALESCE(
               ARRAY_AGG(fcat.category_name ORDER BY fcat.category_name) FILTER (WHERE fcat.category_name IS NOT NULL),
               '{}'
             ) AS categories
      FROM customer_feedback cf
      JOIN feedback_customers fc ON fc.id = cf.customer_id
      LEFT JOIN feedback_category_mapping fcm ON fcm.feedback_id = cf.id
      LEFT JOIN feedback_categories fcat ON fcat.id = fcm.category_id
      GROUP BY cf.id, fc.name
      ORDER BY cf.review_date DESC, cf.created_at DESC LIMIT 10
    `);

    // Review growth: compare last 30 days vs prior 30
    const growthRes = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE review_date::date >= CURRENT_DATE - 30)::int AS recent,
        COUNT(*) FILTER (WHERE review_date::date >= CURRENT_DATE - 60 AND review_date::date < CURRENT_DATE - 30)::int AS prior
      FROM customer_feedback
    `);
    const { recent, prior } = growthRes.rows[0] ?? { recent: 0, prior: 0 };
    const reviewGrowthPercent = prior === 0 ? 100 : Math.round(((recent - prior) / prior) * 100);

    // Negative review growth
    const negGrowthRes = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE' AND review_date::date >= CURRENT_DATE - 30)::int AS recent_neg,
        COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE' AND review_date::date >= CURRENT_DATE - 60 AND review_date::date < CURRENT_DATE - 30)::int AS prior_neg
      FROM customer_feedback
    `);
    const { recent_neg, prior_neg } = negGrowthRes.rows[0] ?? { recent_neg: 0, prior_neg: 0 };
    const negativeGrowthPercent = prior_neg === 0 ? 0 : Math.round(((recent_neg - prior_neg) / prior_neg) * 100);

    // Top improving / declining category (based on avg rating change last 30d vs prior 30d)
    const catChangeRes = await this.pool.query(`
      SELECT fcat.category_name,
             COALESCE(AVG(cf.rating) FILTER (WHERE cf.review_date::date >= CURRENT_DATE - 30), 0)::float AS recent_avg,
             COALESCE(AVG(cf.rating) FILTER (WHERE cf.review_date::date >= CURRENT_DATE - 60 AND cf.review_date::date < CURRENT_DATE - 30), 0)::float AS prior_avg
      FROM feedback_categories fcat
      JOIN feedback_category_mapping fcm ON fcm.category_id = fcat.id
      JOIN customer_feedback cf ON cf.id = fcm.feedback_id
      GROUP BY fcat.category_name
      HAVING AVG(cf.rating) FILTER (WHERE cf.review_date::date >= CURRENT_DATE - 60 AND cf.review_date::date < CURRENT_DATE - 30) > 0
      ORDER BY (COALESCE(AVG(cf.rating) FILTER (WHERE cf.review_date::date >= CURRENT_DATE - 30), 0) -
                COALESCE(AVG(cf.rating) FILTER (WHERE cf.review_date::date >= CURRENT_DATE - 60 AND cf.review_date::date < CURRENT_DATE - 30), 0)) DESC
    `);

    const topImprovingCategory = catChangeRes.rows[0]?.category_name ?? '—';
    const topDecliningCategory = catChangeRes.rows[catChangeRes.rows.length - 1]?.category_name ?? '—';

    // Rating trend direction
    const trendRows = ratingTrend.rows;
    const ratingTrendDirection: 'up' | 'down' | 'stable' =
      trendRows.length < 2 ? 'stable' :
      trendRows[trendRows.length - 1].avgRating > trendRows[trendRows.length - 2].avgRating ? 'up' :
      trendRows[trendRows.length - 1].avgRating < trendRows[trendRows.length - 2].avgRating ? 'down' : 'stable';

    // Reputation score (0-100 based on avg rating + positive %)
    const avgRating = tot?.avg_rating ?? 0;
    const posPct = total === 0 ? 0 : (pos / total) * 100;
    const reputationScore = Math.round((avgRating / 5) * 60 + posPct * 0.4);

    const catDists = catDist.rows as { categoryName: string; count: number; avgRating: number }[];

    return {
      totalReviews: total,
      averageRating: Number((avgRating).toFixed(2)),
      positiveCount: pos,
      neutralCount: neu,
      negativeCount: neg,
      positivePercent: total === 0 ? 0 : Math.round((pos / total) * 100),
      neutralPercent: total === 0 ? 0 : Math.round((neu / total) * 100),
      negativePercent: total === 0 ? 0 : Math.round((neg / total) * 100),
      recentReviews: recentRes.rows as FeedbackItem[],
      reviewGrowthPercent,
      ratingDistribution: ratingDist.rows,
      reviewsBySource: bySource.rows,
      reviewsByCustomer: byCustomer.rows,
      categoryDistribution: catDists,
      topCategory: catDists.find(c => c.count > 0)?.categoryName ?? '—',
      leastCategory: [...catDists].reverse().find(c => c.count > 0)?.categoryName ?? '—',
      monthlyReviews: monthly.rows,
      weeklyReviews: weekly.rows,
      ratingTrend: trendRows,
      sentimentTrend: sentimentTrend.rows,
      peakReviewDays: peakDays.rows,
      categoryTrend: catTrend.rows,
      topImprovingCategory,
      topDecliningCategory,
      monthlySatisfaction: sentimentTrend.rows.map((r: any) => ({
        month: r.month,
        positive: r.positive,
        neutral: r.neutral,
        negative: r.negative,
        total: r.positive + r.neutral + r.negative,
      })),
      reputationScore,
      ratingTrendDirection,
      oneStarCount: tot?.one_star ?? 0,
      fiveStarCount: tot?.five_star ?? 0,
      negativeGrowthPercent,
    };
  }

  // ── Weekly Summary ─────────────────────────────────────────────────────────

  async generateWeeklySummary(): Promise<WeeklySummary> {
    // Use last 7 days
    const today = new Date();
    const weekEnd = today.toISOString().split('T')[0] as string;
    const weekStartDate = new Date(today);
    weekStartDate.setDate(today.getDate() - 6);
    const weekStart = weekStartDate.toISOString().split('T')[0] as string;

    const [totals, catRes, bestDay, worstDay] = await Promise.all([
      this.pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE sentiment = 'POSITIVE')::int AS pos,
               COUNT(*) FILTER (WHERE sentiment = 'NEUTRAL')::int AS neu,
               COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE')::int AS neg,
               COALESCE(AVG(rating),0)::float AS avg_rating
        FROM customer_feedback
        WHERE review_date BETWEEN $1 AND $2
      `, [weekStart, weekEnd]),
      this.pool.query(`
        SELECT fcat.category_name, COUNT(*)::int AS count
        FROM customer_feedback cf
        JOIN feedback_category_mapping fcm ON fcm.feedback_id = cf.id
        JOIN feedback_categories fcat ON fcat.id = fcm.category_id
        WHERE cf.review_date BETWEEN $1 AND $2
        GROUP BY fcat.category_name ORDER BY count DESC LIMIT 1
      `, [weekStart, weekEnd]),
      this.pool.query(`
        SELECT review_date, COUNT(*)::int AS count FROM customer_feedback
        WHERE review_date BETWEEN $1 AND $2
        GROUP BY review_date ORDER BY count DESC LIMIT 1
      `, [weekStart, weekEnd]),
      this.pool.query(`
        SELECT review_date, COUNT(*)::int AS count FROM customer_feedback
        WHERE review_date BETWEEN $1 AND $2
        GROUP BY review_date ORDER BY count ASC LIMIT 1
      `, [weekStart, weekEnd]),
    ]);

    const t = totals.rows[0];
    const topCat = catRes.rows[0]?.category_name ?? '—';
    const bestDayStr = bestDay.rows[0]?.review_date ?? '—';
    const worstDayStr = worstDay.rows[0]?.review_date ?? '—';
    const trendingMetric = `Best day: ${bestDayStr} (${bestDay.rows[0]?.count ?? 0} reviews), Slowest: ${worstDayStr}`;

    const id = `wk${Date.now()}`;

    // Upsert: remove existing summary for this week range
    await this.pool.query(
      'DELETE FROM weekly_feedback_summary WHERE week_start = $1 AND week_end = $2',
      [weekStart, weekEnd]
    );

    await this.pool.query(`
      INSERT INTO weekly_feedback_summary
        (id, week_start, week_end, total_reviews, positive_reviews, neutral_reviews, negative_reviews, average_rating, top_category, trending_metric)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [id, weekStart, weekEnd, t.total, t.pos, t.neu, t.neg, Number(t.avg_rating).toFixed(2), topCat, trendingMetric]);

    return {
      id,
      weekStart,
      weekEnd,
      totalReviews: t.total,
      positiveReviews: t.pos,
      neutralReviews: t.neu,
      negativeReviews: t.neg,
      averageRating: Number(Number(t.avg_rating).toFixed(2)),
      topCategory: topCat,
      trendingMetric,
      generatedAt: new Date().toISOString(),
    };
  }

  async getWeeklySummaries(): Promise<WeeklySummary[]> {
    const r = await this.pool.query(`
      SELECT id, week_start AS "weekStart", week_end AS "weekEnd",
             total_reviews AS "totalReviews",
             positive_reviews AS "positiveReviews",
             neutral_reviews AS "neutralReviews",
             negative_reviews AS "negativeReviews",
             average_rating::float AS "averageRating",
             top_category AS "topCategory",
             trending_metric AS "trendingMetric",
             generated_at AS "generatedAt"
      FROM weekly_feedback_summary
      ORDER BY week_start DESC LIMIT 20
    `);
    return r.rows as WeeklySummary[];
  }
}
