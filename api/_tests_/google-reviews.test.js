const httpMocks = require('node-mocks-http');
const googleReviewsHandler = require('../_lib/google-reviews');
const googleReviewsReplyHandler = require('../_lib/google-reviews-reply');

// Mock the db module
jest.mock('../_lib/db', () => ({
  ensureTables: jest.fn().mockResolvedValue(),
  getPool: jest.fn().mockReturnValue({
    query: jest.fn()
  })
}));

const db = require('../_lib/db');

describe('Google Reviews API', () => {
  let pool;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = db.getPool();
  });

  describe('GET /api/google-reviews', () => {
    it('should return a list of reviews', async () => {
      const mockReviews = [
        { id: 1, review_id: 'rev1', rating: 5, author_name: 'Test User' }
      ];
      pool.query.mockResolvedValue({ rows: mockReviews });

      const req = httpMocks.createRequest({
        method: 'GET',
        url: '/api/google-reviews'
      });
      const res = httpMocks.createResponse();

      await googleReviewsHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockReviews);
    });

    it('should filter by channel_id if provided', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const req = httpMocks.createRequest({
        method: 'GET',
        url: '/api/google-reviews',
        query: { channel_id: '10' }
      });
      const res = httpMocks.createResponse();

      await googleReviewsHandler(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE gr.channel_id = $1'),
        ['10']
      );
      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe('POST /api/google-reviews-reply', () => {
    it('should require review_id and reply_text', async () => {
      const req = httpMocks.createRequest({
        method: 'POST',
        url: '/api/google-reviews-reply',
        body: {}
      });
      const res = httpMocks.createResponse();

      await googleReviewsReplyHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBeDefined();
    });

    it('should simulate a successful reply', async () => {
      // Mock the database query for fetching the channel
      pool.query.mockResolvedValue({
        rows: [{
          access_token: 'fake_token',
          account_email: 'accounts/123',
          avatar_url: 'locations/456'
        }]
      });

      const req = httpMocks.createRequest({
        method: 'POST',
        url: '/api/google-reviews-reply',
        body: {
          channel_id: 10,
          review_id: 'rev1',
          reply_text: 'Thank you for your feedback!'
        }
      });
      const res = httpMocks.createResponse();

      await googleReviewsReplyHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.message).toContain('simulated successfully');
    });
  });
});
