import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect } from 'chai';
import parseRouteMarkdown from '../../../data/scripts/parse-route-md.js';
import { validateRouteJson } from '../../../data/scripts/validate-route-json.js';
import { cleanRouteJson } from '../../../data/scripts/clean-route-json.js';

// 获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试用 Markdown 文件路径
const mdPath = path.join(__dirname, '../../fixtures/sample-route.md');
const invalidMdPath = path.join(__dirname, '../../fixtures/invalid-route.md');

// 测试用 JSON Schema 路径
const schemaPath = path.join(__dirname, '../../../contracts/route-ingestion.schema.json');

describe('路线数据导入流水线契约测试', () => {
    // 测试用例 1: 解析阶段
    describe('解析阶段', () => {
        it('应该正确解析 Markdown 文件为结构化 JSON', () => {
            const result = parseRouteMarkdown(mdPath);
            
            // 验证基本结构
            expect(result).to.have.property('title').that.is.a('string');
            expect(result).to.have.property('description').that.is.a('string');
            expect(result).to.have.property('spots').that.is.an('array');
            
            // 验证景点数据
            expect(result.spots.length).to.be.greaterThan(0);
            result.spots.forEach(spot => {
                expect(spot).to.have.property('name').that.is.a('string');
                expect(spot).to.have.property('lat').that.is.a('number');
                expect(spot).to.have.property('lng').that.is.a('number');
            });
            
            // 保存解析结果供后续测试使用
            fs.writeFileSync(path.join(__dirname, '../../fixtures/parsed-route.json'), JSON.stringify(result, null, 2));
        });
        
        it('应该处理解析错误', () => {
            const invalidResult = parseRouteMarkdown(invalidMdPath);
            
            // 验证无效文件处理
            expect(invalidResult.title).to.equal('');
            expect(invalidResult.spots.length).to.equal(0);
        });
    });
    
    // 测试用例 2: 验证阶段
    describe('验证阶段', () => {
        let parsedJson;
        
        before(() => {
            // 读取解析阶段生成的 JSON
            parsedJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../fixtures/parsed-route.json'), 'utf8'));
        });
        
        it('应该验证有效的 JSON 数据', () => {
            const result = validateRouteJson(parsedJson);
            
            // 验证结果
            expect(result.valid).to.be.true;
            expect(result.errors).to.have.lengthOf(0);
        });
        
        it('应该检测无效的 JSON 数据', () => {
            // 创建无效数据
            const invalidJson = { ...parsedJson };
            invalidJson.spots[0].lat = 'invalid'; // 无效的纬度
            invalidJson.spots[0].lng = 'invalid'; // 无效的经度
            
            const result = validateRouteJson(invalidJson);
            
            // 验证结果
            expect(result.valid).to.be.false;
            expect(result.errors).to.have.length.greaterThan(0);
            
            // 验证错误报告
            expect(result.errorReport.routeErrors).to.have.lengthOf(0);
            expect(result.errorReport.spots[invalidJson.spots[0].id].errors).to.have.length.greaterThan(0);
        });
    });
    
    // 测试用例 3: 清洗阶段
    describe('清洗阶段', () => {
        let parsedJson;
        
        before(() => {
            // 读取解析阶段生成的 JSON
            parsedJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../fixtures/parsed-route.json'), 'utf8'));
        });
        
        it('应该清洗有效的 JSON 数据', () => {
            const result = cleanRouteJson(parsedJson);
            
            // 验证清洗结果
            expect(result.cleanedData.validation_status).to.equal('valid');
            expect(result.report.remainingIssues).to.have.lengthOf(0);
            
            // 保存清洗结果供后续测试使用
            fs.writeFileSync(path.join(__dirname, '../../fixtures/cleaned-route.json'), JSON.stringify(result.cleanedData, null, 2));
        });
        
        it('应该修复数据类型问题', () => {
            // 创建需要清洗的数据
            const dirtyJson = { ...parsedJson };
            dirtyJson.duration_minutes = '120'; // 字符串类型的数字
            dirtyJson.spots[0].geofence_radius_m = '50'; // 字符串类型的数字
            
            const result = cleanRouteJson(dirtyJson);
            
            // 验证清洗结果
            expect(result.cleanedData.duration_minutes).to.equal(120);
            expect(result.cleanedData.spots[0].geofence_radius_m).to.equal(50);
            expect(result.report.cleanedFields).to.have.length.greaterThan(0);
        });
        
        it('应该检测未解决的坐标问题', () => {
            // 创建无效坐标数据
            const invalidCoordJson = { ...parsedJson };
            invalidCoordJson.spots[0].lat = 200; // 无效的纬度
            invalidCoordJson.spots[0].lng = 200; // 无效的经度
            
            const result = cleanRouteJson(invalidCoordJson);
            
            // 验证清洗结果
            expect(result.cleanedData.validation_status).to.equal('invalid');
            expect(result.report.remainingIssues).to.have.length.greaterThan(0);
        });
    });
    
    // 测试用例 4: 端到端测试
    describe('端到端测试', () => {
        it('应该完成整个流水线处理', () => {
            // 解析
            const parsed = parseRouteMarkdown(mdPath);
            
            // 验证
            const validationResult = validateRouteJson(parsed);
            expect(validationResult.valid).to.be.true;
            
            // 清洗
            const cleaningResult = cleanRouteJson(parsed);
            expect(cleaningResult.cleanedData.validation_status).to.equal('valid');
            
            // 最终验证
            const finalValidation = validateRouteJson(cleaningResult.cleanedData);
            expect(finalValidation.valid).to.be.true;
        });
    });
});