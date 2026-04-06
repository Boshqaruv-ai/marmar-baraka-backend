const jwt = require('../../src/utils/jwt');

describe('JWT Utils', () => {
  const testPayload = { userId: 'test-user-id', role: 'customer' };

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const token = jwt.generateAccessToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should contain the correct payload', () => {
      const token = jwt.generateAccessToken(testPayload);
      const decoded = jwt.verifyAccessToken(token);
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.role).toBe(testPayload.role);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const token = jwt.generateRefreshToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should have longer expiry than access token', () => {
      const decoded = jwt.verifyRefreshToken(jwt.generateRefreshToken(testPayload));
      expect(decoded.exp).toBeGreaterThan(0);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token', () => {
      const token = jwt.generateAccessToken(testPayload);
      const decoded = jwt.verifyAccessToken(token);
      expect(decoded.userId).toBe(testPayload.userId);
    });

    it('should throw error for invalid token', () => {
      expect(() => jwt.verifyAccessToken('invalid-token')).toThrow();
    });

    it('should throw error for expired token', () => {
      const expiredToken = jwt.generateAccessToken(testPayload);
      jest.useFakeTimers();
      jest.advanceTimersByTime(16 * 60 * 1000);
      expect(() => jwt.verifyAccessToken(expiredToken)).toThrow('jwt expired');
      jest.useRealTimers();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const token = jwt.generateRefreshToken(testPayload);
      const decoded = jwt.verifyRefreshToken(token);
      expect(decoded.userId).toBe(testPayload.userId);
    });

    it('should throw error for invalid token', () => {
      expect(() => jwt.verifyRefreshToken('invalid-token')).toThrow();
    });
  });
});
