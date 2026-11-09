-- Sunco Walk-In CRM: initial schema.
-- Timestamps are ISO-8601 UTC strings. entry_date / entry_month are dealership-local (Australia/Brisbane).

CREATE TABLE locations (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE brands (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  colour      TEXT,
  is_used     INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0, 1)),  -- 1 = "Used Cars": make/model/stock number instead of a model list
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A franchise is one brand sold at one location. Permissions are granted per franchise.
CREATE TABLE franchises (
  id           INTEGER PRIMARY KEY,
  location_id  INTEGER NOT NULL REFERENCES locations(id),
  brand_id     INTEGER NOT NULL REFERENCES brands(id),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (location_id, brand_id)
);

CREATE TABLE models (
  id          INTEGER PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES brands(id),
  name        TEXT NOT NULL COLLATE NOCASE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (brand_id, name)
);

-- Makes offered for Used Cars enquiries. brand_id links a make to a new-car brand so its model list is reused.
CREATE TABLE used_makes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  brand_id    INTEGER REFERENCES brands(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- Extra used-car models for makes (in addition to the linked brand's models, if any).
CREATE TABLE used_models (
  id          INTEGER PRIMARY KEY,
  make_id     INTEGER NOT NULL REFERENCES used_makes(id),
  name        TEXT NOT NULL COLLATE NOCASE,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (make_id, name)
);

CREATE TABLE users (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email                 TEXT COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('salesperson', 'sales_manager', 'general_manager')),
  is_admin              INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  home_location_id      INTEGER REFERENCES locations(id),
  active                INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change_password  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  token_version         INTEGER NOT NULL DEFAULT 0,   -- bumped to sign the user out everywhere
  last_login_at         TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_franchises (
  user_id       INTEGER NOT NULL REFERENCES users(id),
  franchise_id  INTEGER NOT NULL REFERENCES franchises(id),
  PRIMARY KEY (user_id, franchise_id)
);

CREATE TABLE lookup_values (
  id          INTEGER PRIMARY KEY,
  list_type   TEXT NOT NULL CHECK (list_type IN ('source', 'lost_reason')),
  label       TEXT NOT NULL COLLATE NOCASE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (list_type, label)
);

CREATE TABLE enquiries (
  id                INTEGER PRIMARY KEY,
  franchise_id      INTEGER NOT NULL REFERENCES franchises(id),
  salesperson_id    INTEGER NOT NULL REFERENCES users(id),

  customer_name     TEXT NOT NULL,
  postcode          TEXT NOT NULL,
  phone             TEXT,              -- normalised digits, e.g. 0412345678
  email             TEXT COLLATE NOCASE,

  model_id          INTEGER REFERENCES models(id),        -- new-car brands
  used_make_id      INTEGER REFERENCES used_makes(id),    -- Used Cars
  used_model_id     INTEGER REFERENCES models(id),        -- Used Cars, make linked to a brand's model list
  used_extra_model_id INTEGER REFERENCES used_models(id), -- Used Cars, model from the used_models list
  used_model_other  TEXT,                                 -- Used Cars, "Other" free text
  stock_number      TEXT,

  source_id         INTEGER REFERENCES lookup_values(id),
  test_drive        INTEGER NOT NULL DEFAULT 0 CHECK (test_drive IN (0, 1)),
  trade_in          INTEGER NOT NULL DEFAULT 0 CHECK (trade_in IN (0, 1)),
  finance           INTEGER NOT NULL DEFAULT 0 CHECK (finance IN (0, 1)),

  outcome           TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open', 'sold', 'lost')),
  lost_reason_id    INTEGER REFERENCES lookup_values(id),
  sold_at           TEXT,
  closed_at         TEXT,
  next_followup_at  TEXT,              -- YYYY-MM-DD, required while open

  is_invalid        INTEGER NOT NULL DEFAULT 0 CHECK (is_invalid IN (0, 1)),  -- duplicate/invalid: hidden from reports, never deleted
  invalid_reason    TEXT,

  entry_date        TEXT NOT NULL,     -- YYYY-MM-DD local
  entry_month       TEXT NOT NULL,     -- YYYY-MM local
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_enquiries_franchise ON enquiries (franchise_id, entry_month);
CREATE INDEX idx_enquiries_salesperson ON enquiries (salesperson_id, outcome);
CREATE INDEX idx_enquiries_followup ON enquiries (outcome, next_followup_at);
CREATE INDEX idx_enquiries_phone ON enquiries (phone);
CREATE INDEX idx_enquiries_email ON enquiries (email);
CREATE INDEX idx_enquiries_stock ON enquiries (stock_number);

CREATE TABLE activities (
  id          INTEGER PRIMARY KEY,
  enquiry_id  INTEGER NOT NULL REFERENCES enquiries(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('created', 'comment', 'call', 'email', 'sms', 'followup_done', 'status_change', 'edited', 'reassigned', 'invalid')),
  body        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_activities_enquiry ON activities (enquiry_id, created_at);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   INTEGER,
  before_json TEXT,
  after_json  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id);
