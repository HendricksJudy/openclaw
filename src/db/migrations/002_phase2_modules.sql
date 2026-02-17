-- ClawHospital: Phase 2 Schema Migration
-- Adds pharmacy, laboratory, scheduling, and finance tables.

-- ══════════════════════════════════════════════════════════════
-- Pharmacy: Drug Catalog & Inventory
-- ══════════════════════════════════════════════════════════════

CREATE TABLE drugs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) UNIQUE NOT NULL,
    generic_name    VARCHAR(200) NOT NULL,
    brand_name      VARCHAR(200),
    dosage_form     VARCHAR(50) NOT NULL,
    strength        VARCHAR(50) NOT NULL,
    unit            VARCHAR(20) NOT NULL,
    manufacturer    VARCHAR(200),
    category        VARCHAR(50),
    control_level   VARCHAR(10) DEFAULT 'normal',
    requires_review BOOLEAN DEFAULT FALSE NOT NULL,
    contraindications JSONB DEFAULT '[]',
    interactions    JSONB DEFAULT '[]',
    unit_price      DECIMAL(10,2),
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_drugs_generic_name ON drugs(generic_name);
CREATE INDEX idx_drugs_category ON drugs(category);
CREATE INDEX idx_drugs_control_level ON drugs(control_level);

CREATE TABLE drug_inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id         UUID NOT NULL REFERENCES drugs(id),
    location_id     UUID NOT NULL,
    location_type   VARCHAR(20) NOT NULL,
    batch_no        VARCHAR(50) NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 0,
    expiry_date     DATE NOT NULL,
    min_stock       INTEGER DEFAULT 10,
    max_stock       INTEGER DEFAULT 1000,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(drug_id, location_id, batch_no)
);
CREATE INDEX idx_drug_inv_drug_id ON drug_inventory(drug_id);
CREATE INDEX idx_drug_inv_location ON drug_inventory(location_id);
CREATE INDEX idx_drug_inv_expiry ON drug_inventory(expiry_date);

CREATE TABLE dispensing_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    drug_id         UUID NOT NULL REFERENCES drugs(id),
    quantity        DECIMAL(10,2) NOT NULL,
    dispensed_by    UUID NOT NULL REFERENCES staff(id),
    verified_by     UUID REFERENCES staff(id),
    status          VARCHAR(20) DEFAULT 'dispensed' NOT NULL,
    return_reason   TEXT,
    dispensed_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_disp_order_id ON dispensing_records(order_id);
CREATE INDEX idx_disp_patient_id ON dispensing_records(patient_id);
CREATE INDEX idx_disp_drug_id ON dispensing_records(drug_id);
CREATE INDEX idx_disp_dispensed_at ON dispensing_records(dispensed_at);

-- ══════════════════════════════════════════════════════════════
-- Laboratory: Test Catalog, Specimens, Results
-- ══════════════════════════════════════════════════════════════

CREATE TABLE lab_tests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) UNIQUE NOT NULL,
    name            VARCHAR(200) NOT NULL,
    category        VARCHAR(50) NOT NULL,
    specimen_type   VARCHAR(50) NOT NULL,
    container_type  VARCHAR(50),
    unit            VARCHAR(30),
    reference_range JSONB DEFAULT '{}',
    critical_low    DECIMAL(10,4),
    critical_high   DECIMAL(10,4),
    turnaround_minutes VARCHAR(10),
    price           DECIMAL(10,2),
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_lab_tests_category ON lab_tests(category);
CREATE INDEX idx_lab_tests_specimen ON lab_tests(specimen_type);

CREATE TABLE specimens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode         VARCHAR(30) UNIQUE NOT NULL,
    order_id        UUID NOT NULL REFERENCES orders(id),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    lab_test_id     UUID NOT NULL REFERENCES lab_tests(id),
    specimen_type   VARCHAR(50) NOT NULL,
    collected_by    UUID REFERENCES staff(id),
    collected_at    TIMESTAMPTZ,
    received_by     UUID REFERENCES staff(id),
    received_at     TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'ordered' NOT NULL,
    rejection_reason TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_specimens_order_id ON specimens(order_id);
CREATE INDEX idx_specimens_patient_id ON specimens(patient_id);
CREATE INDEX idx_specimens_status ON specimens(status);
CREATE INDEX idx_specimens_collected_at ON specimens(collected_at);

CREATE TABLE lab_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specimen_id     UUID NOT NULL REFERENCES specimens(id),
    order_id        UUID NOT NULL REFERENCES orders(id),
    lab_test_id     UUID NOT NULL REFERENCES lab_tests(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    value           VARCHAR(100),
    numeric_value   DECIMAL(15,6),
    unit            VARCHAR(30),
    reference_range VARCHAR(100),
    abnormal_flag   VARCHAR(5),
    is_critical     BOOLEAN DEFAULT FALSE NOT NULL,
    critical_notified_at TIMESTAMPTZ,
    critical_notified_to UUID REFERENCES staff(id),
    resulted_by     UUID REFERENCES staff(id),
    resulted_at     TIMESTAMPTZ,
    verified_by     UUID REFERENCES staff(id),
    verified_at     TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'pending' NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_lab_results_specimen_id ON lab_results(specimen_id);
CREATE INDEX idx_lab_results_order_id ON lab_results(order_id);
CREATE INDEX idx_lab_results_patient_id ON lab_results(patient_id);
CREATE INDEX idx_lab_results_is_critical ON lab_results(is_critical);
CREATE INDEX idx_lab_results_status ON lab_results(status);

-- ══════════════════════════════════════════════════════════════
-- Scheduling: Templates, Staff Schedules, Appointments
-- ══════════════════════════════════════════════════════════════

CREATE TABLE schedule_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    department_id   UUID NOT NULL REFERENCES departments(id),
    schedule_type   VARCHAR(20) NOT NULL,
    day_of_week     INTEGER NOT NULL,
    start_time      VARCHAR(5) NOT NULL,
    end_time        VARCHAR(5) NOT NULL,
    max_slots       INTEGER DEFAULT 30 NOT NULL,
    slot_duration_minutes INTEGER DEFAULT 15 NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE staff_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID NOT NULL REFERENCES staff(id),
    department_id   UUID NOT NULL REFERENCES departments(id),
    template_id     UUID REFERENCES schedule_templates(id),
    schedule_date   DATE NOT NULL,
    schedule_type   VARCHAR(20) NOT NULL,
    start_time      VARCHAR(5) NOT NULL,
    end_time        VARCHAR(5) NOT NULL,
    max_slots       INTEGER DEFAULT 30 NOT NULL,
    booked_slots    INTEGER DEFAULT 0 NOT NULL,
    status          VARCHAR(15) DEFAULT 'active' NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(staff_id, schedule_date, start_time)
);
CREATE INDEX idx_staff_sched_staff_id ON staff_schedules(staff_id);
CREATE INDEX idx_staff_sched_date ON staff_schedules(schedule_date);
CREATE INDEX idx_staff_sched_dept ON staff_schedules(department_id);

CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_no  VARCHAR(20) UNIQUE NOT NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id),
    staff_id        UUID NOT NULL REFERENCES staff(id),
    department_id   UUID NOT NULL REFERENCES departments(id),
    schedule_id     UUID REFERENCES staff_schedules(id),
    appointment_date DATE NOT NULL,
    start_time      VARCHAR(5) NOT NULL,
    end_time        VARCHAR(5),
    appointment_type VARCHAR(20) NOT NULL,
    status          VARCHAR(20) DEFAULT 'booked' NOT NULL,
    chief_complaint TEXT,
    booking_channel VARCHAR(20),
    queue_number    INTEGER,
    checked_in_at   TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_appt_patient_id ON appointments(patient_id);
CREATE INDEX idx_appt_staff_id ON appointments(staff_id);
CREATE INDEX idx_appt_date ON appointments(appointment_date);
CREATE INDEX idx_appt_status ON appointments(status);
CREATE INDEX idx_appt_dept ON appointments(department_id);

-- ══════════════════════════════════════════════════════════════
-- Finance: Charges, Bills, Payments, Insurance Claims
-- ══════════════════════════════════════════════════════════════

CREATE TABLE charge_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) UNIQUE NOT NULL,
    name            VARCHAR(200) NOT NULL,
    category        VARCHAR(50) NOT NULL,
    unit_price      DECIMAL(12,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD' NOT NULL,
    cpt_code        VARCHAR(10),
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_charge_items_category ON charge_items(category);
CREATE INDEX idx_charge_items_cpt ON charge_items(cpt_code);

CREATE TABLE bills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_no         VARCHAR(20) UNIQUE NOT NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    total_amount    DECIMAL(12,2) DEFAULT 0 NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    insurance_covered DECIMAL(12,2) DEFAULT 0,
    patient_owes    DECIMAL(12,2) DEFAULT 0,
    paid_amount     DECIMAL(12,2) DEFAULT 0,
    currency        VARCHAR(3) DEFAULT 'USD' NOT NULL,
    status          VARCHAR(20) DEFAULT 'draft' NOT NULL,
    insurance_claim_id UUID,
    created_by      UUID NOT NULL REFERENCES staff(id),
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_bills_patient_id ON bills(patient_id);
CREATE INDEX idx_bills_visit_id ON bills(visit_id);
CREATE INDEX idx_bills_status ON bills(status);

CREATE TABLE bill_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id         UUID NOT NULL REFERENCES bills(id),
    charge_item_id  UUID REFERENCES charge_items(id),
    description     VARCHAR(300) NOT NULL,
    quantity        DECIMAL(10,2) DEFAULT 1 NOT NULL,
    unit_price      DECIMAL(12,2) NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    category        VARCHAR(50),
    order_id        UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_bill_items_bill_id ON bill_items(bill_id);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_no      VARCHAR(20) UNIQUE NOT NULL,
    bill_id         UUID NOT NULL REFERENCES bills(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    amount          DECIMAL(12,2) NOT NULL,
    payment_method  VARCHAR(20) NOT NULL,
    reference_no    VARCHAR(100),
    received_by     UUID NOT NULL REFERENCES staff(id),
    status          VARCHAR(15) DEFAULT 'completed' NOT NULL,
    notes           TEXT,
    paid_at         TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_payments_bill_id ON payments(bill_id);
CREATE INDEX idx_payments_patient_id ON payments(patient_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

CREATE TABLE insurance_claims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_no        VARCHAR(30) UNIQUE NOT NULL,
    bill_id         UUID NOT NULL REFERENCES bills(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    insurance_type  VARCHAR(30) NOT NULL,
    insurance_no    VARCHAR(50) NOT NULL,
    claimed_amount  DECIMAL(12,2) NOT NULL,
    approved_amount DECIMAL(12,2),
    status          VARCHAR(20) DEFAULT 'submitted' NOT NULL,
    diagnosis_codes JSONB DEFAULT '[]',
    procedure_codes JSONB DEFAULT '[]',
    denial_reason   TEXT,
    submitted_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_claims_bill_id ON insurance_claims(bill_id);
CREATE INDEX idx_claims_patient_id ON insurance_claims(patient_id);
CREATE INDEX idx_claims_status ON insurance_claims(status);

-- ══════════════════════════════════════════════════════════════
-- Additional Permissions for new modules
-- ══════════════════════════════════════════════════════════════

INSERT INTO permissions (resource, action, description) VALUES
    ('appointments', 'create', 'Book appointments'),
    ('appointments', 'read', 'View appointments'),
    ('appointments', 'update', 'Modify appointments'),
    ('appointments', 'cancel', 'Cancel appointments'),
    ('pharmacy', 'read', 'View drug catalog'),
    ('pharmacy', 'manage', 'Manage drug catalog'),
    ('lab', 'read', 'View lab tests and results'),
    ('lab', 'manage', 'Manage lab test catalog'),
    ('finance', 'read', 'View billing information'),
    ('finance', 'manage', 'Manage billing and payments'),
    ('insurance', 'submit', 'Submit insurance claims'),
    ('insurance', 'manage', 'Manage insurance claims')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign new permissions to superadmin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'superadmin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Assign physician permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'physician'
  AND p.resource || '.' || p.action IN (
    'patients.read', 'patients.create', 'patients.update',
    'visits.create', 'visits.read', 'visits.update',
    'orders.create', 'orders.read', 'orders.cancel',
    'emr.create', 'emr.read', 'emr.update', 'emr.sign',
    'lab.read', 'pharmacy.read', 'finance.read',
    'appointments.create', 'appointments.read', 'appointments.update',
    'schedule.read'
  )
ON CONFLICT DO NOTHING;

-- Assign nurse permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'nurse'
  AND p.resource || '.' || p.action IN (
    'patients.read', 'visits.read',
    'orders.read', 'orders.execute',
    'emr.create', 'emr.read',
    'lab.collect', 'lab.read',
    'appointments.read', 'appointments.update',
    'schedule.read'
  )
ON CONFLICT DO NOTHING;

-- Assign pharmacist permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'pharmacist'
  AND p.resource || '.' || p.action IN (
    'patients.read', 'orders.read', 'orders.approve',
    'pharmacy.dispense', 'pharmacy.inventory', 'pharmacy.read', 'pharmacy.manage'
  )
ON CONFLICT DO NOTHING;

-- Assign lab_tech permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'lab_tech'
  AND p.resource || '.' || p.action IN (
    'patients.read', 'orders.read',
    'lab.collect', 'lab.report', 'lab.verify', 'lab.read', 'lab.manage'
  )
ON CONFLICT DO NOTHING;

-- Assign billing permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'billing'
  AND p.resource || '.' || p.action IN (
    'patients.read', 'visits.read',
    'finance.charge', 'finance.refund', 'finance.settle', 'finance.report',
    'finance.read', 'finance.manage',
    'insurance.submit', 'insurance.manage'
  )
ON CONFLICT DO NOTHING;

-- Assign receptionist permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'receptionist'
  AND p.resource || '.' || p.action IN (
    'patients.create', 'patients.read', 'patients.update',
    'appointments.create', 'appointments.read', 'appointments.update', 'appointments.cancel',
    'visits.create', 'visits.read',
    'schedule.read',
    'finance.charge', 'finance.read'
  )
ON CONFLICT DO NOTHING;
