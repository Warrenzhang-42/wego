const fs = require('fs');
const path = require('path');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats');
const schema = require('../../contracts/route-ingestion.schema.json');

/**
 * 验证 JSON 数据是否符合契约
 * @param {Object} jsonData - 要验证的 JSON 数据
 * @returns {Object} - 验证结果对象
 */
function validateRouteJson(jsonData) {
    // 创建 AJV 实例并添加格式支持
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    
    // 添加自定义格式：uuid
    ajv.addFormat('uuid', {
        type: 'string',
        validate: (data) => {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data);
        }
    });
    
    // 验证 JSON
    const validate = ajv.compile(schema);
    const valid = validate(jsonData);
    
    // 准备结果对象
    const result = {
        valid: valid,
        errors: validate.errors || [],
        errorReport: {},
        validationStatus: 'valid'
    };
    
    // 如果不合法，生成详细错误报告
    if (!valid) {
        result.validationStatus = 'invalid';
        result.errorReport = generateDetailedErrorReport(jsonData, validate.errors);
    }
    
    return result;
}

/**
 * 生成详细的字段级错误报告
 * @param {Object} jsonData - JSON 数据
 * @param {Array} errors - AJV 错误数组
 * @returns {Object} - 详细错误报告
 */
function generateDetailedErrorReport(jsonData, errors) {
    const report = {
        globalErrors: [],
        routeErrors: [],
        spots: {}
    };
    
    // 初始化每个景点的错误数组
    jsonData.spots.forEach((spot, index) => {
        report.spots[spot.id] = {
            name: spot.name,
            errors: []
        };
    });
    
    // 分类错误
    errors.forEach(error => {
        const instancePath = error.instancePath;
        
        // 全局错误（路线级别）
        if (instancePath.startsWith('/') && !instancePath.includes('/spots/')) {
            report.routeErrors.push({
                field: error.params.missingProperty || error.propertyName || 'root',
                message: error.message,
                errorCode: error.keyword
            });
        }
        // 景点错误
        else if (instancePath.includes('/spots/')) {
            const spotIndexMatch = instancePath.match(/\/spots\/(\d+)/);
            if (spotIndexMatch) {
                const spotIndex = parseInt(spotIndexMatch[1]);
                const spotId = jsonData.spots[spotIndex].id;
                
                const fieldMatch = instancePath.match(/\/spots\/\d+\/(.*)$/);
                const field = fieldMatch ? fieldMatch[1] : 'unknown';
                
                report.spots[spotId].errors.push({
                    field: field,
                    message: error.message,
                    errorCode: error.keyword
                });
            }
        }
        // 其他错误
        else {
            report.globalErrors.push({
                field: 'global',
                message: error.message,
                errorCode: error.keyword
            });
        }
    });
    
    return report;
}

/**
 * 验证 JSON 文件并生成报告
 * @param {string} jsonPath - JSON 文件路径
 * @param {string} outputReportPath - 错误报告输出路径
 * @returns {Object} - 验证结果
 */
function validateRouteJsonFile(jsonPath, outputReportPath) {
    try {
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const validationResult = validateRouteJson(jsonData);
        
        // 更新验证状态
        jsonData.validation_status = validationResult.valid ? 'valid' : 'invalid';
        
        // 保存带有验证状态的 JSON
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
        
        // 生成错误报告
        if (!validationResult.valid) {
            const report = {
                file: path.basename(jsonPath),
                validationStatus: 'invalid',
                timestamp: new Date().toISOString(),
                errorSummary: {
                    totalErrors: validationResult.errors.length,
                    routeErrors: validationResult.errorReport.routeErrors.length,
                    spotErrors: Object.values(validationResult.errorReport.spots)
                        .reduce((sum, spot) => sum + spot.errors.length, 0)
                },
                detailedReport: validationResult.errorReport
            };
            
            fs.writeFileSync(outputReportPath, JSON.stringify(report, null, 2));
        }
        
        return validationResult;
    } catch (error) {
        return {
            valid: false,
            errors: [{ message: `文件解析错误: ${error.message}` }],
            errorReport: {}
        };
    }
}

// 示例用法
// const jsonPath = path.join(__dirname, 'route-candidate.json');
// const reportPath = path.join(__dirname, 'validation-report.json');
// const result = validateRouteJsonFile(jsonPath, reportPath);
// if (result.valid) {
//   console.log('JSON 验证通过');
// } else {
//   console.error('JSON 验证失败:', result.errorReport);
// }

module.exports = {
    validateRouteJson,
    validateRouteJsonFile
};