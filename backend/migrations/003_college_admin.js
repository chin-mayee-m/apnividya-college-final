// Convert the old coaching "mentor" role into the college-focused admin role.
module.exports = {
  name: '003_college_admin',
  sql: `
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'admin' WHERE role = 'mentor';
UPDATE users SET email = 'admin@apnividya.in', name = 'College Admin', department = 'Academic Administration' WHERE email = 'mentor@apnividya.in';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','student'));
`
};
