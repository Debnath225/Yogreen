export const publicUser = (user) => ({
  id: user.id,
  phone: user.phone,
  name: user.name || '',
  email: user.email || '',
  role: user.role,
  setupCompleted: user.setupCompleted,
  prefs: user.prefs,
  createdAt: user.createdAt,
});
