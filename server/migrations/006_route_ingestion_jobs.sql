-- 创建路线导入作业表
CREATE TABLE route_ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
    source_file TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
    error_message TEXT,
    validation_report JSONB,
    cleaning_report JSONB,
    import_report JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 添加索引优化查询
CREATE INDEX idx_route_ingestion_jobs_status ON route_ingestion_jobs(status);
CREATE INDEX idx_route_ingestion_jobs_source_file ON route_ingestion_jobs(source_file);

-- 添加注释
COMMENT ON TABLE route_ingestion_jobs IS '记录路线数据导入的审计信息和状态';
COMMENT ON COLUMN route_ingestion_jobs.source_file IS '原始数据文件路径';
COMMENT ON COLUMN route_ingestion_jobs.status IS '作业状态：pending, processing, success, failed';
COMMENT ON COLUMN route_ingestion_jobs.validation_report IS '验证阶段的详细报告';
COMMENT ON COLUMN route_ingestion_jobs.cleaning_report IS '清洗阶段的详细报告';
COMMENT ON COLUMN route_ingestion_jobs.import_report IS '导入阶段的详细报告';

-- 创建触发器函数，自动更新 updated_at
CREATE OR REPLACE FUNCTION update_route_ingestion_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用触发器
CREATE TRIGGER route_ingestion_jobs_updated_at
BEFORE UPDATE ON route_ingestion_jobs
FOR EACH ROW
EXECUTE FUNCTION update_route_ingestion_jobs_updated_at();