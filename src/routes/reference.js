const express = require('express');
const scope = require('../lib/scope');

// Lists the form needs: sites, brands, models, used-car makes/models, sources, lost reasons,
// plus which franchises this user can log enquiries for and who they can assign to.
module.exports = function referenceRoutes({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const user = req.user;
    const assigned = scope.franchiseIds(db, user);
    const assignedSet = assigned === null ? null : new Set(assigned);

    const locations = db.prepare('SELECT id, name, active FROM locations ORDER BY sort_order, name').all();
    const brands = db.prepare('SELECT id, name, colour, is_used, active FROM brands ORDER BY sort_order, name').all();
    const franchises = db
      .prepare(
        `SELECT f.id, f.location_id, f.brand_id, f.active, l.active AS location_active, b.active AS brand_active
         FROM franchises f JOIN locations l ON l.id = f.location_id JOIN brands b ON b.id = f.brand_id`
      )
      .all()
      .filter((f) => assignedSet === null || assignedSet.has(f.id))
      .map((f) => ({
        id: f.id,
        location_id: f.location_id,
        brand_id: f.brand_id,
        active: f.active,
        // Can log new enquiries here (franchise, location and brand all active).
        can_create: f.active === 1 && f.location_active === 1 && f.brand_active === 1,
      }));

    const visibleBrandIds = new Set(franchises.map((f) => f.brand_id));
    const visibleLocationIds = new Set(franchises.map((f) => f.location_id));

    const models = db
      .prepare('SELECT id, brand_id, name, active FROM models ORDER BY brand_id, sort_order, name')
      .all()
      .filter((m) => visibleBrandIds.has(m.brand_id));

    const usedMakes = db.prepare('SELECT id, name, brand_id, active FROM used_makes ORDER BY name').all();
    const usedModels = db.prepare('SELECT id, make_id, name, active FROM used_models ORDER BY make_id, name').all();
    // Models of brands linked to a used make, so used-car dropdowns can show them too.
    const linkedBrandIds = new Set(usedMakes.filter((m) => m.brand_id).map((m) => m.brand_id));
    const linkedModels = db
      .prepare('SELECT id, brand_id, name, active FROM models ORDER BY sort_order, name')
      .all()
      .filter((m) => linkedBrandIds.has(m.brand_id));

    const lookups = db.prepare('SELECT id, list_type, label, active FROM lookup_values ORDER BY list_type, sort_order, label').all();

    // People this user can assign enquiries to, with the franchises each covers.
    let assignees = [];
    if (scope.isManager(user)) {
      const rows = db
        .prepare(
          `SELECT u.id, u.name, u.role, uf.franchise_id FROM users u
           JOIN user_franchises uf ON uf.user_id = u.id
           WHERE u.active = 1 ORDER BY u.name`
        )
        .all();
      const byUser = new Map();
      for (const r of rows) {
        if (assignedSet !== null && !assignedSet.has(r.franchise_id)) continue;
        if (!byUser.has(r.id)) byUser.set(r.id, { id: r.id, name: r.name, role: r.role, franchise_ids: [] });
        byUser.get(r.id).franchise_ids.push(r.franchise_id);
      }
      assignees = [...byUser.values()];
    }

    res.json({
      locations: locations.filter((l) => assignedSet === null || visibleLocationIds.has(l.id)),
      brands: brands.filter((b) => assignedSet === null || visibleBrandIds.has(b.id)),
      franchises,
      models,
      used_makes: usedMakes,
      used_models: usedModels,
      used_linked_models: linkedModels,
      sources: lookups.filter((l) => l.list_type === 'source'),
      lost_reasons: lookups.filter((l) => l.list_type === 'lost_reason'),
      assignees,
    });
  });

  return router;
};
