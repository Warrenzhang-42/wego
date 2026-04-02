const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * 解析 Markdown 文件，提取路线和景点信息
 * @param {string} mdPath - Markdown 文件路径
 * @returns {Object} - 符合 route-ingestion 契约的结构化 JSON
 */
function parseRouteMarkdown(mdPath) {
    const content = fs.readFileSync(mdPath, 'utf8');
    const lines = content.split('\n');
    
    const result = {
        id: uuidv4(),
        title: '',
        description: '',
        duration_minutes: 0,
        difficulty: 'medium',
        tags: [],
        cover_image: '',
        total_distance_km: 0,
        source_file: path.basename(mdPath),
        validation_status: 'pending',
        spots: []
    };

    let currentSpot = null;
    let inSpotSection = false;

    for (const line of lines) {
        // 解析路线标题
        if (line.startsWith('# ')) {
            result.title = line.replace('# ', '').trim();
        }
        // 解析路线描述
        else if (line.startsWith('## 描述')) {
            result.description = getSectionContent(lines, lines.indexOf(line) + 1);
        }
        // 解析路线元数据
        else if (line.startsWith('## 元数据')) {
            const metaContent = getSectionContent(lines, lines.indexOf(line) + 1);
            parseMetadata(metaContent, result);
        }
        // 解析景点部分
        else if (line.startsWith('## 景点')) {
            inSpotSection = true;
        }
        // 解析单个景点
        else if (inSpotSection && line.startsWith('### ')) {
            if (currentSpot) {
                result.spots.push(currentSpot);
            }
            currentSpot = {
                id: uuidv4(),
                name: line.replace('### ', '').trim(),
                subtitle: '',
                short_desc: '',
                detail: '',
                tags: [],
                thumb: '',
                photos: [],
                lat: 0,
                lng: 0,
                geofence_radius_m: 30,
                estimated_stay_min: 0,
                sort_order: result.spots.length + 1,
                validation_errors: []
            };
        }
        // 解析景点详情
        else if (currentSpot) {
            if (line.startsWith('**副标题**:')) {
                currentSpot.subtitle = line.split(':')[1].trim();
            } else if (line.startsWith('**简短描述**:')) {
                currentSpot.short_desc = line.split(':')[1].trim();
            } else if (line.startsWith('**详情**:')) {
                currentSpot.detail = getMultilineContent(lines, lines.indexOf(line));
            } else if (line.startsWith('**标签**:')) {
                currentSpot.tags = line.split(':')[1].trim().split(',').map(tag => tag.trim());
            } else if (line.startsWith('**缩略图**:')) {
                currentSpot.thumb = line.split(':')[1].trim();
            } else if (line.startsWith('**照片**:')) {
                currentSpot.photos = line.split(':')[1].trim().split(',').map(photo => photo.trim());
            } else if (line.startsWith('**坐标**:')) {
                const [lat, lng] = line.split(':')[1].trim().split(',').map(coord => parseFloat(coord.trim()));
                currentSpot.lat = lat;
                currentSpot.lng = lng;
            } else if (line.startsWith('**围栏半径**:')) {
                currentSpot.geofence_radius_m = parseInt(line.split(':')[1].trim());
            } else if (line.startsWith('**预计停留**:')) {
                currentSpot.estimated_stay_min = parseInt(line.split(':')[1].trim());
            }
        }
    }

    // 添加最后一个景点
    if (currentSpot) {
        result.spots.push(currentSpot);
    }

    return result;
}

/**
 * 获取从指定行开始到下一个标题或文件末尾的内容
 * @param {Array} lines - 所有行数组
 * @param {number} startIndex - 开始索引
 * @returns {string} - 内容字符串
 */
function getSectionContent(lines, startIndex) {
    let content = '';
    let i = startIndex;
    while (i < lines.length && !lines[i].startsWith('## ')) {
        content += lines[i] + '\n';
        i++;
    }
    return content.trim();
}

/**
 * 获取多行内容（直到遇到空行）
 * @param {Array} lines - 所有行数组
 * @param {number} startIndex - 开始索引
 * @returns {string} - 内容字符串
 */
function getMultilineContent(lines, startIndex) {
    let content = '';
    let i = startIndex;
    while (i < lines.length && lines[i].trim() !== '') {
        content += lines[i] + '\n';
        i++;
    }
    return content.trim();
}

/**
 * 解析元数据部分
 * @param {string} content - 元数据内容
 * @param {Object} result - 结果对象
 */
function parseMetadata(content, result) {
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.startsWith('**时长**:')) {
            result.duration_minutes = parseInt(line.split(':')[1].trim());
        } else if (line.startsWith('**难度**:')) {
            result.difficulty = line.split(':')[1].trim().toLowerCase();
        } else if (line.startsWith('**标签**:')) {
            result.tags = line.split(':')[1].trim().split(',').map(tag => tag.trim());
        } else if (line.startsWith('**封面图**:')) {
            result.cover_image = line.split(':')[1].trim();
        } else if (line.startsWith('**总距离**:')) {
            result.total_distance_km = parseFloat(line.split(':')[1].trim());
        }
    }
}

// 示例用法
// const mdPath = path.join(__dirname, '..', 'knowledge', 'dashilan', 'dashilan-route.md');
// const jsonOutput = parseRouteMarkdown(mdPath);
// fs.writeFileSync('route-candidate.json', JSON.stringify(jsonOutput, null, 2));

module.exports = parseRouteMarkdown;