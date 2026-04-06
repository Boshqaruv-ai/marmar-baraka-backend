const { hashPassword, comparePassword, generateRandomToken, hashToken } = require('../../src/utils/hash');

describe('Hash Utils', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const result = await comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      const result = await comparePassword('WrongPassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateRandomToken', () => {
    it('should generate a token of correct length', () => {
      const token = generateRandomToken(32);
      expect(token.length).toBe(64);
    });

    it('should generate unique tokens', () => {
      const token1 = generateRandomToken(32);
      const token2 = generateRandomToken(32);
      expect(token1).not.toBe(token2);
    });
  });

  describe('hashToken', () => {
    it('should hash a token', () => {
      const token = 'some-raw-token';
      const hashed = hashToken(token);
      expect(hashed.length).toBe(64);
    });

    it('should produce consistent hashes', () => {
      const token = 'some-raw-token';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });
  });
});
