const fs = require('fs');
const path = require('path');

/**
 * 清洗路线 JSON 数据
 * @param {Object} jsonData - 要清洗的 JSON 数据
 * @returns {Object} - 清洗后的 JSON 数据和清洗报告
 */
function cleanRouteJson(jsonData) {
    const report = {
        timestamp: new Date().toISOString(),
        sourceFile: jsonData.source_file,
        cleanedFields: [],
        fixedErrors: [],
        remainingIssues: []
    };
    
    // 类型修正
    cleanDataTypes(jsonData, report);
    
    // 标签标准化
    standardizeTags(jsonData, report);
    
    // 坐标范围检查
    validateCoordinates(jsonData, report);
    
    // 排序修复
    fixSortOrders(jsonData, report);
    
    // 更新验证状态
    jsonData.validation_status = report.remainingIssues.length > 0 ? 'invalid' : 'valid';
    
    return {
        cleanedData: jsonData,
        report: report
    };
}

/**
 * 修正数据类型
 * @param {Object} jsonData - JSON 数据
 * @param {Object} report - 清洗报告
 */
function cleanDataTypes(jsonData, report) {
    // 路线级别的类型修正
    if (typeof jsonData.duration_minutes === 'string') {
        const original = jsonData.duration_minutes;
        jsonData.duration_minutes = parseInt(jsonData.duration_minutes);
        report.cleanedFields.push({
            path: 'duration_minutes',
            original: original,
            cleaned: jsonData.duration_minutes
        });
    }
    
    if (typeof jsonData.total_distance_km === 'string') {
        const original = jsonData.total_distance_km;
        jsonData.total_distance_km = parseFloat(jsonData.total_distance_km);
        report.cleanedFields.push({
            path: 'total_distance_km',
            original: original,
            cleaned: jsonData.total_distance_km
        });
    }
    
    // 景点级别的类型修正
    jsonData.spots.forEach((spot, index) => {
        if (typeof spot.geofence_radius_m === 'string') {
            const original = spot.geofence_radius_m;
            spot.geofence_radius_m = parseInt(spot.geofence_radius_m);
            report.cleanedFields.push({
                path: `spots/${index}/geofence_radius_m`,
                original: original,
                cleaned: spot.geofence_radius_m
            });
        }
        
        if (typeof spot.estimated_stay_min === 'string') {
            const original = spot.estimated_stay_min;
            spot.estimated_stay_min = parseInt(spot.estimated_stay_min);
            report.cleanedFields.push({
                path: `spots/${index}/estimated_stay_min`,
                original: original,
                cleaned: spot.estimated_stay_min
            });
        }
        
        if (typeof spot.sort_order === 'string') {
            const original = spot.sort_order;
            spot.sort_order = parseInt(spot.sort_order);
            report.cleanedFields.push({
                path: `spots/${index}/sort_order`,
                original: original,
                cleaned: spot.sort_order
            });
        }
        
        // 确保坐标是数字
        if (typeof spot.lat === 'string') {
            const original = spot.lat;
            spot.lat = parseFloat(spot.lat);
            report.cleanedFields.push({
                path: `spots/${index}/lat`,
                original: original,
                cleaned: spot.lat
            });
        }
        
        if (typeof spot.lng === 'string') {
            const original = spot.lng;
            spot.lng = parseFloat(spot.lng);
            report.cleanedFields.push({
                path: `spots/${index}/lng`,
                original: original,
                cleaned: spot.lng
            });
        }
    });
}

/**
 * 标准化标签
 * @param {Object} jsonData - JSON 数据
 * @param {Object} report - 清洗报告
 */
function standardizeTags(jsonData, report) {
    // 路线标签标准化
    if (jsonData.tags && Array.isArray(jsonData.tags)) {
        const original = [...jsonData.tags];
        jsonData.tags = jsonData.tags.map(tag => tag.trim().toLowerCase());
        jsonData.tags = [...new Set(jsonData.tags)]; // 去重
        
        if (JSON.stringify(original) !== JSON.stringify(jsonData.tags)) {
            report.cleanedFields.push({
                path: 'tags',
                original: original,
                cleaned: jsonData.tags
            });
        }
    }
    
    // 景点标签标准化
    jsonData.spots.forEach((spot, index) => {
        if (spot.tags && Array.isArray(spot.tags)) {
            const original = [...spot.tags];
            spot.tags = spot.tags.map(tag => tag.trim().toLowerCase());
            spot.tags = [...new Set(spot.tags)]; // 去重
            
            if (JSON.stringify(original) !== JSON.stringify(spot.tags)) {
                report.cleanedFields.push({
                    path: `spots/${index}/tags`,
                    original: original,
                    cleaned: spot.tags
                });
            }
        }
    });
}

/**
 * 验证坐标范围
 * @param {Object} jsonData - JSON 数据
 * @param {Object} report - 清洗报告
 */
function validateCoordinates(jsonData, report) {
    const BEIJING_BOUNDS = {
        minLat: 39.4,
        maxLat: 41.0,
        minLng: 115.7,
        maxLng: 117.4
    };
    
    jsonData.spots.forEach((spot, index) => {
        const spotPath = `spots/${index}`;
        
        // 检查纬度是否在合理范围内
        if (spot.lat < -90 || spot.lat > 90) {
            report.remainingIssues.push({
                path: `${spotPath}/lat`,
                issue: '纬度超出范围 (-90 到 90)',
                value: spot.lat
            });
        }
        
        // 检查经度是否在合理范围内
        if (spot.lng < -180 || spot.lng > 180) {
            report.remainingIssues.push({
                path: `${spotPath}/lng`,
                issue: '经度超出范围 (-180 到 180)',
                value: spot.lng
            });
        }
        
        // 检查是否在北京市范围内
        if (spot.lat < BEIJING_BOUNDS.minLat || spot.lat > BEIJING_BOUNDS.maxLat || 
            spot.lng < BEIJING_BOUNDS.minLng || spot.lng > BEIJING_BOUNDS.maxLng) {
            report.remainingIssues.push({
                path: `${spotPath}`,
                issue: '坐标可能不在北京市范围内',
                value: `${spot.lat}, ${spot.lng}`,
                recommendedBounds: BEIJING_BOUNDS
            });
        }
    });
}

/**
 * 修复排序问题
 * @param {Object} jsonData - JSON 数据
 * @param {Object} report - 清洗报告
 */
function fixSortOrders(jsonData, report) {
    // 确保景点有 sort_order 属性
    jsonData.spots.forEach(spot => {
        if (spot.sort_order === undefined || spot.sort_order === null) {
            spot.sort_order = 0;
        }
    });
    
    // 按当前 sort_order 排序
    jsonData.spots.sort((a, b) => a.sort_order - b.sort_order);
    
    // 修复排序值，确保从1开始连续
    let hasGaps = false;
    jsonData.spots.forEach((spot, index) => {
        const expectedOrder = index + 1;
        if (spot.sort_order !== expectedOrder) {
            const original = spot.sort_order;
            spot.sort_order = expectedOrder;
            report.cleanedFields.push({
                path: `spots/${index}/sort_order`,
                original: original,
                cleaned: expectedOrder
            });
            hasGaps = true;
        }
    });
    
    if (hasGaps) {
        report.fixedErrors.push('景点排序已修复');
    }
}

/**
 * 清洗 JSON 文件
 * @param {string} jsonPath - JSON 文件路径
 * @param {string} outputReportPath - 清洗报告输出路径
 * @returns {Object} - 清洗结果
 */
function cleanRouteJsonFile(jsonPath, outputReportPath) {
    try {
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const result = cleanRouteJson(jsonData);
        
        // 保存清洗后的 JSON
        fs.writeFileSync(jsonPath, JSON.stringify(result.cleanedData, null, 2));
        
        // 保存清洗报告
        fs.writeFileSync(outputReportPath, JSON.stringify(result.report, null, 2));
        
        return result;
    } catch (error) {
        return {
            cleanedData: null,
            report: {
                error: `清洗失败: ${error.message}`,
                stack: error.stack
            }
        };
    }
}

// 示例用法
// const jsonPath = path.join(__dirname, 'route-candidate.json');
// const reportPath = path.join(__dirname, 'cleaning-report.json');
// const result = cleanRouteJsonFile(jsonPath, reportPath);
// if (result.report.remainingIssues.length > 0) {
//   console.warn('清洗完成，但存在未解决的问题:', result.report.remainingIssues);
// } else {
//   console.log('清洗完成，所有问题已解决');
// }

module.exports = {
    cleanRouteJson,
    cleanRouteJsonFile
};