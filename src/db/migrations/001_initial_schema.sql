-- ClawHospital: Initial Schema Migration
-- This file is automatically loaded by PostgreSQL on first container start.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════════
-- Departments & Wards
-- ══════════════════════════════════════════════════════════════

CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    parent_id       UUID REFERENCES departments(id),
    dept_type       VARCHAR(20) NOT NULL, -- clinical, nursing, pharmacy, lab, radiology, admin, finance
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_departments_code ON departments(code);
CREATE INDEX idx_departments_parent_id ON departments(parent_id);
CREATE INDEX idx_departments_dept_type ON departments(dept_type);

CREATE TABLE wards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    department_id   UUID NOT NULL REFERENCES departments(id),
    floor           VARCHAR(10),
    building        VARCHAR(50),
    total_beds      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_wards_department_id ON wards(department_id);

CREATE TABLE beds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id         UUID NOT NULL REFERENCES wards(id),
    bed_no          VARCHAR(10) NOT NULL,
    bed_type        VARCHAR(20) DEFAULT 'standard',
    status          VARCHAR(15) DEFAULT 'available' NOT NULL,
    current_patient_id UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_beds_ward_id ON beds(ward_id);
CREATE INDEX idx_beds_status ON beds(status);

-- ══════════════════════════════════════════════════════════════
-- Staff
-- ══════════════════════════════════════════════════════════════

CREATE TABLE staff (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_no        VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    department_id   UUID REFERENCES departments(id),
    role_type       VARCHAR(20) NOT NULL,
    title           VARCHAR(50),
    speciality      VARCHAR(100),
    license_no      VARCHAR(50),
    phone           VARCHAR(20),
    email           VARCHAR(100),
    locale          VARCHAR(10) DEFAULT 'en',
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    channel_bindings JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_staff_department_id ON staff(department_id);
CREATE INDEX idx_staff_role_type ON staff(role_type);
CREATE INDEX idx_staff_email ON staff(email);

-- ══════════════════════════════════════════════════════════════
-- Patients
-- ══════════════════════════════════════════════════════════════

CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_no VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    gender          SMALLINT NOT NULL,
    birth_date      DATE NOT NULL,
    national_id     VARCHAR(50),
    national_id_type VARCHAR(20),
    phone           VARCHAR(20),
    email           VARCHAR(100),
    insurance_type  VARCHAR(30),
    insurance_no    VARCHAR(50),
    locale          VARCHAR(10) DEFAULT 'en',
    address         TEXT,
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(20),
    channel_bindings JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_national_id ON patients(national_id);
CREATE INDEX idx_patients_insurance_no ON patients(insurance_no);

-- ══════════════════════════════════════════════════════════════
-- Visits
-- ══════════════════════════════════════════════════════════════

CREATE TABLE visits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    visit_no        VARCHAR(20) UNIQUE NOT NULL,
    visit_type      VARCHAR(15) NOT NULL,
    department_id   UUID NOT NULL REFERENCES departments(id),
    doctor_id       UUID NOT NULL REFERENCES staff(id),
    visit_date      TIMESTAMPTZ NOT NULL,
    chief_complaint TEXT,
    diagnosis_codes JSONB DEFAULT '[]',
    status          VARCHAR(20) DEFAULT 'active' NOT NULL,
    ai_session_id   VARCHAR(100),
    bed_id          UUID REFERENCES beds(id),
    admission_date  TIMESTAMPTZ,
    discharge_date  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_visits_patient_id ON visits(patient_id);
CREATE INDEX idx_visits_doctor_id ON visits(doctor_id);
CREATE INDEX idx_visits_department_id ON visits(department_id);
CREATE INDEX idx_visits_visit_date ON visits(visit_date);
CREATE INDEX idx_visits_status ON visits(status);

-- ══════════════════════════════════════════════════════════════
-- Orders
-- ══════════════════════════════════════════════════════════════

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    order_no        VARCHAR(20) UNIQUE NOT NULL,
    order_type      VARCHAR(20) NOT NULL,
    order_category  VARCHAR(15),
    item_code       VARCHAR(50) NOT NULL,
    item_name       VARCHAR(200) NOT NULL,
    specification   VARCHAR(200),
    dosage          VARCHAR(50),
    frequency       VARCHAR(50),
    route           VARCHAR(50),
    quantity        DECIMAL(10,2),
    unit            VARCHAR(20),
    doctor_id       UUID NOT NULL REFERENCES staff(id),
    pharmacist_id   UUID REFERENCES staff(id),
    status          VARCHAR(20) DEFAULT 'pending' NOT NULL,
    ai_review_result JSONB,
    notes           TEXT,
    start_time      TIMESTAMPTZ,
    stop_time       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_orders_visit_id ON orders(visit_id);
CREATE INDEX idx_orders_doctor_id ON orders(doctor_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_type ON orders(order_type);
CREATE INDEX idx_orders_item_code ON orders(item_code);

CREATE TABLE order_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    executor_id     UUID NOT NULL REFERENCES staff(id),
    action          VARCHAR(30) NOT NULL,
    notes           TEXT,
    executed_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_order_exec_order_id ON order_executions(order_id);

-- ══════════════════════════════════════════════════════════════
-- EMR (Electronic Medical Records)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE emr_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    doc_type        VARCHAR(50) NOT NULL,
    department_id   UUID REFERENCES departments(id),
    structure       JSONB NOT NULL,
    is_active       VARCHAR(5) DEFAULT 'true' NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE emr_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    doc_type        VARCHAR(50) NOT NULL,
    template_id     UUID REFERENCES emr_templates(id),
    content         JSONB NOT NULL,
    content_text    TEXT,
    author_id       UUID NOT NULL REFERENCES staff(id),
    sign_status     VARCHAR(20) DEFAULT 'draft' NOT NULL,
    signed_at       TIMESTAMPTZ,
    countersigned_by UUID REFERENCES staff(id),
    countersigned_at TIMESTAMPTZ,
    quality_score   DECIMAL(5,2),
    quality_issues  JSONB DEFAULT '[]',
    version         VARCHAR(10) DEFAULT '1' NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_emr_visit_id ON emr_documents(visit_id);
CREATE INDEX idx_emr_doc_type ON emr_documents(doc_type);
CREATE INDEX idx_emr_author_id ON emr_documents(author_id);
CREATE INDEX idx_emr_sign_status ON emr_documents(sign_status);

-- ══════════════════════════════════════════════════════════════
-- Auth (RBAC)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID UNIQUE NOT NULL REFERENCES staff(id),
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    last_login_at   TIMESTAMPTZ,
    failed_login_attempts VARCHAR(5) DEFAULT '0',
    locked_until    TIMESTAMPTZ,
    refresh_token   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_users_staff_id ON users(staff_id);

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN DEFAULT FALSE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource        VARCHAR(50) NOT NULL,
    action          VARCHAR(30) NOT NULL,
    description     TEXT,
    UNIQUE(resource, action)
);

CREATE TABLE role_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

CREATE TABLE user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    department_scope UUID REFERENCES departments(id),
    granted_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    granted_by      UUID,
    UNIQUE(user_id, role_id, department_scope)
);

CREATE TABLE data_access_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource        VARCHAR(50) NOT NULL,
    scope_type      VARCHAR(20) NOT NULL,
    scope_value     JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ══════════════════════════════════════════════════════════════
-- Audit Logs
-- ══════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    operator_id     UUID NOT NULL,
    operator_name   VARCHAR(100),
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     VARCHAR(100),
    detail          JSONB,
    channel         VARCHAR(30),
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_audit_operator_id ON audit_logs(operator_id);
CREATE INDEX idx_audit_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- ══════════════════════════════════════════════════════════════
-- Seed: Default Roles
-- ══════════════════════════════════════════════════════════════

INSERT INTO roles (code, name, description, is_system) VALUES
  ('superadmin', 'Super Administrator', 'Full system access', TRUE),
  ('admin', 'Administrator', 'System administration', TRUE),
  ('physician', 'Physician', 'Attending/Resident Doctor', TRUE),
  ('head_nurse', 'Head Nurse', 'Nursing unit manager', TRUE),
  ('nurse', 'Nurse', 'Registered Nurse', TRUE),
  ('pharmacist', 'Pharmacist', 'Pharmacy staff', TRUE),
  ('lab_tech', 'Lab Technician', 'Laboratory staff', TRUE),
  ('radiologist', 'Radiologist', 'Radiology/Imaging staff', TRUE),
  ('billing', 'Billing Clerk', 'Financial/billing staff', TRUE),
  ('receptionist', 'Receptionist', 'Front desk registration', TRUE);

-- ══════════════════════════════════════════════════════════════
-- Seed: Default Permissions
-- ══════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, description) VALUES
  ('patients', 'create', 'Register new patients'),
  ('patients', 'read', 'View patient records'),
  ('patients', 'update', 'Update patient information'),
  ('patients', 'delete', 'Delete patient records'),
  ('visits', 'create', 'Create visit/encounter'),
  ('visits', 'read', 'View visits'),
  ('visits', 'update', 'Update visit details'),
  ('orders', 'create', 'Place medical orders'),
  ('orders', 'read', 'View orders'),
  ('orders', 'approve', 'Approve/review orders'),
  ('orders', 'execute', 'Execute orders'),
  ('orders', 'cancel', 'Cancel orders'),
  ('emr', 'create', 'Create clinical documents'),
  ('emr', 'read', 'View clinical documents'),
  ('emr', 'update', 'Edit clinical documents'),
  ('emr', 'sign', 'Sign clinical documents'),
  ('emr', 'countersign', 'Countersign clinical documents'),
  ('pharmacy', 'dispense', 'Dispense medications'),
  ('pharmacy', 'inventory', 'Manage pharmacy inventory'),
  ('lab', 'collect', 'Collect lab specimens'),
  ('lab', 'report', 'Enter lab results'),
  ('lab', 'verify', 'Verify lab results'),
  ('finance', 'charge', 'Create charges'),
  ('finance', 'refund', 'Process refunds'),
  ('finance', 'settle', 'Settlement operations'),
  ('finance', 'report', 'View financial reports'),
  ('schedule', 'create', 'Create schedules'),
  ('schedule', 'read', 'View schedules'),
  ('schedule', 'update', 'Modify schedules'),
  ('users', 'manage', 'Manage user accounts'),
  ('roles', 'manage', 'Manage roles and permissions'),
  ('config', 'manage', 'System configuration'),
  ('audit', 'read', 'View audit logs');

-- Assign all permissions to superadmin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'superadmin';
