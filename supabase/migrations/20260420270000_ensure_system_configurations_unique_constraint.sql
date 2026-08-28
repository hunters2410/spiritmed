-- Ensure system_configurations has explicit unique constraint for ON CONFLICT matching
DO $$ 
BEGIN 
    -- Drop duplicate index/constraint names if existing
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'system_configurations_branch_id_config_type_config_name_key'
    ) THEN
        BEGIN
            ALTER TABLE system_configurations 
            ADD CONSTRAINT system_configurations_branch_id_config_type_config_name_key 
            UNIQUE (branch_id, config_type, config_name);
        EXCEPTION
            WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
    END IF;
END $$;
