// Who can see and do what. Every enquiry query and change goes through these functions,
// so the rules are enforced on the server, not just hidden in the UI.
//
//   general_manager / admin : every franchise, every enquiry
//   sales_manager           : every enquiry in their assigned franchises
//   salesperson             : only enquiries assigned to them, within their assigned franchises

const ROLES = ['salesperson', 'sales_manager', 'general_manager'];
const ROLE_RANK = { salesperson: 1, sales_manager: 2, general_manager: 3 };

function hasFullAccess(user) {
  return user.role === 'general_manager' || user.is_admin === 1;
}

function isManager(user) {
  return hasFullAccess(user) || user.role === 'sales_manager';
}

// Franchise ids the user is assigned to, or null meaning "all".
function franchiseIds(db, user) {
  if (hasFullAccess(user)) return null;
  return db
    .prepare('SELECT franchise_id FROM user_franchises WHERE user_id = ? ORDER BY franchise_id')
    .all(user.id)
    .map((r) => r.franchise_id);
}

function hasFranchise(db, user, franchiseId) {
  if (hasFullAccess(user)) return true;
  return !!db.prepare('SELECT 1 FROM user_franchises WHERE user_id = ? AND franchise_id = ?').get(user.id, franchiseId);
}

// SQL fragment restricting an enquiries query (aliased `e`) to what the user may see.
function enquiryFilter(db, user) {
  const ids = franchiseIds(db, user);
  if (ids === null) return { sql: '1 = 1', params: [] };
  if (ids.length === 0) return { sql: '0 = 1', params: [] };
  const placeholders = ids.map(() => '?').join(', ');
  if (user.role === 'salesperson') {
    return { sql: `e.franchise_id IN (${placeholders}) AND e.salesperson_id = ?`, params: [...ids, user.id] };
  }
  return { sql: `e.franchise_id IN (${placeholders})`, params: ids };
}

function canViewEnquiry(db, user, enquiry) {
  if (hasFullAccess(user)) return true;
  if (!hasFranchise(db, user, enquiry.franchise_id)) return false;
  return user.role !== 'salesperson' || enquiry.salesperson_id === user.id;
}

// Editing follows the same rule as viewing for now (own enquiries for salespeople, team for managers).
const canEditEnquiry = canViewEnquiry;

// Can `user` assign an enquiry in `franchiseId` to `targetUserId`?
function canAssignTo(db, user, franchiseId, targetUserId) {
  const target = db.prepare('SELECT id, role, is_admin, active FROM users WHERE id = ?').get(targetUserId);
  if (!target || target.active !== 1) return false;
  if (user.role === 'salesperson') return target.id === user.id;
  if (!hasFranchise(db, user, franchiseId)) return false;
  return hasFranchise(db, target, franchiseId);
}

// ---- User management ----

// Can `actor` see/manage the user record `target`?
function canManageUser(db, actor, target) {
  if (hasFullAccess(actor)) {
    // Only admins can manage admin accounts.
    return target.is_admin !== 1 || actor.is_admin === 1;
  }
  if (actor.role !== 'sales_manager') return false;
  if (target.role !== 'salesperson' || target.is_admin === 1) return false;
  // A sales manager manages salespeople who work in at least one of the manager's franchises.
  const row = db
    .prepare(
      `SELECT 1 FROM user_franchises a JOIN user_franchises b ON a.franchise_id = b.franchise_id
       WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`
    )
    .get(actor.id, target.id);
  return !!row;
}

// Roles `actor` may give to a user.
function assignableRoles(actor) {
  if (hasFullAccess(actor)) return ROLES;
  if (actor.role === 'sales_manager') return ['salesperson'];
  return [];
}

module.exports = {
  ROLES,
  ROLE_RANK,
  hasFullAccess,
  isManager,
  franchiseIds,
  hasFranchise,
  enquiryFilter,
  canViewEnquiry,
  canEditEnquiry,
  canAssignTo,
  canManageUser,
  assignableRoles,
};
