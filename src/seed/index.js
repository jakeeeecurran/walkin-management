const data = require('./data');

// Loads the starting reference data. Only runs on an empty database, so Admin edits are never overwritten.
function seedReferenceData(db) {
  const already = db.prepare('SELECT COUNT(*) AS n FROM locations').get().n;
  if (already > 0) return false;

  const insertLocation = db.prepare('INSERT INTO locations (name, sort_order) VALUES (?, ?)');
  const insertBrand = db.prepare('INSERT INTO brands (name, colour, is_used, sort_order) VALUES (?, ?, ?, ?)');
  const insertModel = db.prepare('INSERT INTO models (brand_id, name, sort_order) VALUES (?, ?, ?)');
  const insertFranchise = db.prepare('INSERT INTO franchises (location_id, brand_id) VALUES (?, ?)');
  const insertMake = db.prepare('INSERT INTO used_makes (name, brand_id, sort_order) VALUES (?, ?, ?)');
  const insertUsedModel = db.prepare('INSERT INTO used_models (make_id, name) VALUES (?, ?)');
  const insertLookup = db.prepare('INSERT INTO lookup_values (list_type, label, sort_order) VALUES (?, ?, ?)');
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  const locationIds = {};
  data.locations.forEach((name, i) => {
    locationIds[name] = Number(insertLocation.run(name, i).lastInsertRowid);
  });

  const brandIds = {};
  // Alphabetical, with Used Cars last.
  const brandNames = Object.keys(data.brands).sort((a, b) => {
    if (a === data.USED) return 1;
    if (b === data.USED) return -1;
    return a.localeCompare(b);
  });
  brandNames.forEach((name, i) => {
    const b = data.brands[name];
    const id = Number(insertBrand.run(name, b.colour, b.isUsed ? 1 : 0, i).lastInsertRowid);
    brandIds[name] = id;
    b.models.forEach((model, j) => insertModel.run(id, model, j));
  });

  for (const [location, brandList] of Object.entries(data.franchises)) {
    for (const brand of brandList) {
      if (!brandIds[brand]) throw new Error(`Seed franchise references unknown brand ${brand}`);
      insertFranchise.run(locationIds[location], brandIds[brand]);
    }
  }

  Object.keys(data.usedMakes)
    .sort((a, b) => a.localeCompare(b))
    .forEach((make, i) => {
      const linkedBrand = brandIds[make] && make !== data.USED ? brandIds[make] : null;
      const makeId = Number(insertMake.run(make, linkedBrand, i).lastInsertRowid);
      for (const model of data.usedMakes[make]) insertUsedModel.run(makeId, model);
    });

  data.sources.forEach((label, i) => insertLookup.run('source', label, i));
  data.lostReasons.forEach((label, i) => insertLookup.run('lost_reason', label, i));

  for (const [key, value] of Object.entries(data.settings)) insertSetting.run(key, value);

  return true;
}

module.exports = { seedReferenceData };
