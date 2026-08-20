process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
const { signToken, verifyToken } = require("../../src/auth/jwt");

test("signToken produces a token verifyToken can decode back to the same payload", () => {
  const payload = { user_id: "abc-123", email: "person@example.com", role: "admin" };
  const token = signToken(payload);
  const decoded = verifyToken(token);

  expect(decoded.user_id).toBe(payload.user_id);
  expect(decoded.email).toBe(payload.email);
  expect(decoded.role).toBe(payload.role);
});

test("verifyToken throws on a tampered token", () => {
  const token = signToken({ user_id: "abc-123", email: "x@example.com", role: "admin" });
  const tampered = token.slice(0, -2) + "zz";

  expect(() => verifyToken(tampered)).toThrow();
});
