CREATE USER admin WITH PASSWORD 'admin';
CREATE DATABASE library OWNER admin;

\c library

CREATE TABLE items (
  item_id serial NOT NULL PRIMARY KEY UNIQUE,
  title varchar(512) NOT NULL,
  author varchar(512) NOT NULL,
  publisher varchar(512) DEFAULT NULL,
  issued varchar(64) DEFAULT NULL,
  fy_notes varchar(512) DEFAULT NULL,
  work_holdings integer DEFAULT 0,
  version_holdings integer DEFAULT 0,
  trove_link varchar(512) DEFAULT NULL UNIQUE,
  trove_work_id varchar(64),
  trove_version_id varchar(128),
  trove_bibrec json,
  trove_json json,
  date_added timestamp DEFAULT NOW(),
  last_modified timestamp DEFAULT NOW(),
  trove_last_modified timestamp DEFAULT NOW()
);

CREATE TABLE authors (
  author_id serial NOT NULL PRIMARY KEY UNIQUE,
  name varchar(512) NOT NULL,
  type varchar(64) NOT NULL DEFAULT '',
  UNIQUE (name, type)
);

CREATE TABLE subjects (
  subject_id serial NOT NULL PRIMARY KEY UNIQUE,
  subject varchar(512) NOT NULL UNIQUE
);

CREATE TABLE items_authors (
  item_id integer REFERENCES items(item_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  author_id integer REFERENCES authors(author_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  author_ordinal integer NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id,author_id)
);

CREATE TABLE items_subjects (
  item_id integer REFERENCES items(item_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  subject_id integer REFERENCES subjects(subject_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (item_id,subject_id)
);

CREATE FUNCTION sync_items_mod() RETURNS trigger AS $$
BEGIN
  IF OLD.trove_json != NEW.trove_json OR OLD.trove_bibrec != NEW.trove_bibrec THEN
    NEW.trove_last_modified := NOW();
  END IF;
  NEW.last_modified := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_items_mod BEFORE UPDATE ON items FOR EACH ROW EXECUTE PROCEDURE sync_items_mod();

GRANT SELECT, UPDATE, INSERT ON ALL TABLES IN SCHEMA public TO admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO admin;
