-- Create a table to store doctor availability preferences (templates)
CREATE TABLE IF NOT EXISTS doctor_availability (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    doctor_id UUID REFERENCES auth.users(id) NOT NULL,
    branch_id UUID, -- Optional, to link to specific branch
    day_of_week INTEGER NOT NULL, -- 0=Sun, 1=Mon, ... 6=Sat
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start_time TIME,
    break_end_time TIME,
    slot_duration INTEGER DEFAULT 30, -- in minutes
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(doctor_id, day_of_week)
);

-- Create a table to store actual generateable/bookable slots
CREATE TABLE IF NOT EXISTS appointment_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    doctor_id UUID REFERENCES auth.users(id) NOT NULL,
    branch_id UUID,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_booked BOOLEAN DEFAULT false,
    appointment_id UUID REFERENCES appointments(id), -- Link if booked
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(doctor_id, start_time)
);

-- Enable RLS
ALTER TABLE doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for doctor_availability
CREATE POLICY "Public read access for availability"
    ON doctor_availability FOR SELECT
    USING (true);

CREATE POLICY "Doctors/Admins can insert/update availability"
    ON doctor_availability FOR ALL
    USING (
        auth.uid() = doctor_id OR 
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('super_admin', 'admin')
        )
    );

-- RLS Policies for appointment_slots
CREATE POLICY "Public read access for slots"
    ON appointment_slots FOR SELECT
    USING (true);

CREATE POLICY "Doctors/Admins can manage slots"
    ON appointment_slots FOR ALL
    USING (
        auth.uid() = doctor_id OR 
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('super_admin', 'admin')
        )
    );

-- Create an index for faster queries on slots
CREATE INDEX idx_appointment_slots_doctor_date ON appointment_slots(doctor_id, start_time);
