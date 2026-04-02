const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

// 初始化 Supabase 客户端
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * 导入候选路线到数据库
 * @param {string} jsonPath - 候选路线 JSON 文件路径
 * @param {boolean} dryRun - 是否执行空运行（不实际写入数据库）
 * @returns {Object} - 导入结果报告
 */
async function seedRouteCandidate(jsonPath, dryRun = true) {
    const report = {
        file: path.basename(jsonPath),
        timestamp: new Date().toISOString(),
        dryRun: dryRun,
        routeUpserted: false,
        spotUpserted: 0,
        errors: [],
        warnings: []
    };
    
    try {
        // 读取 JSON 文件
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        // 检查验证状态
        if (jsonData.validation_status !== 'valid') {
            report.errors.push('路线验证状态无效，不能导入');
            return report;
        }
        
        // 准备路线数据（排除 spots）
        const routeData = { ...jsonData };
        delete routeData.spots;
        
        // 准备景点数据
        const spotData = jsonData.spots.map(spot => {
            const spotCopy = { ...spot };
            delete spotCopy.validation_errors; // 移除验证错误字段
            spotCopy.route_id = routeData.id; // 设置外键
            return spotCopy;
        });
        
        // 执行空运行
        if (dryRun) {
            report.warnings.push('空运行模式：不会实际写入数据库');
            report.routeData = routeData;
            report.spotData = spotData;
            return report;
        }
        
        // 启动事务
        const { data: transaction, error: transactionError } = await supabase.rpc('begin');
        if (transactionError) throw transactionError;
        
        try {
            // 插入/更新路线
            const { error: routeError } = await supabase
                .from('routes')
                .upsert(routeData, { onConflict: 'id' });
            
            if (routeError) {
                throw new Error(`路线插入失败: ${routeError.message}`);
            }
            report.routeUpserted = true;
            
            // 插入/更新景点
            for (const spot of spotData) {
                const { error: spotError } = await supabase
                    .from('spots')
                    .upsert(spot, { onConflict: 'id' });
                
                if (spotError) {
                    report.errors.push(`景点 ${spot.name} 插入失败: ${spotError.message}`);
                } else {
                    report.spotUpserted++;
                }
            }
            
            // 提交事务
            await supabase.rpc('commit');
        } catch (error) {
            // 回滚事务
            await supabase.rpc('rollback');
            throw error;
        }
        
        return report;
    } catch (error) {
        report.errors.push(`导入失败: ${error.message}`);
        return report;
    }
}

/**
 * 命令行接口
 * @param {string} jsonPath - JSON 文件路径
 * @param {boolean} dryRun - 是否空运行
 * @param {string} outputReportPath - 报告输出路径
 */
async function main(jsonPath, dryRun = true, outputReportPath = null) {
    const report = await seedRouteCandidate(jsonPath, dryRun);
    
    // 输出报告到控制台
    console.log('导入报告');
    console.log('文件:', report.file);
    console.log('时间:', report.timestamp);
    console.log('模式:', report.dryRun ? '空运行' : '实际写入');
    
    if (report.routeUpserted) {
        console.log('路线:', '成功插入/更新');
    } else {
        console.log('路线:', '未插入');
    }
    
    console.log('景点:', `${report.spotUpserted} 个成功插入/更新`);
    
    if (report.errors.length > 0) {
        console.error('错误:');
        report.errors.forEach(err => console.error(`- ${err}`));
    }
    
    if (report.warnings.length > 0) {
        console.warn('警告:');
        report.warnings.forEach(warn => console.warn(`- ${warn}`));
    }
    
    // 保存报告文件
    if (outputReportPath) {
        fs.writeFileSync(outputReportPath, JSON.stringify(report, null, 2));
        console.log(`报告已保存到: ${outputReportPath}`);
    }
    
    if (report.errors.length > 0) {
        process.exit(1); // 有错误时退出码为1
    }
}

// 命令行参数解析
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('用法: node seed-route-candidate.js <json-path> [--dry-run] [--output-report=path]');
    process.exit(1);
}

const jsonPath = args[0];
const dryRun = args.includes('--dry-run');
const outputReportArg = args.find(arg => arg.startsWith('--output-report='));
const outputReportPath = outputReportArg ? outputReportArg.split('=')[1] : null;

// 执行导入
main(jsonPath, dryRun, outputReportPath).catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
});