import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { splitTitleAndAttribution } from '../lib/author';

const DATA_DIR = path.resolve(__dirname, '../data/daozang-text');

interface DaozangEntry {
  id: string;
  title: string;
  collection: string;
  category: string;
  subcategory: string;
  author?: string;
  filename: string;
  size: number;
  lineCount: number;
  preview: string;
}

function parseFilename(filename: string): Partial<DaozangEntry> {
  const name = filename.replace(/\.txt$/, '');

  let m = name.match(/^正[統统]道藏(洞[真玄神]部|太平部|太清部|太玄部|正一部)([\u4e00-\u9fff]+類)?-(.+)$/);
  if (m) {
    // 题署从书名尾巴切，不再用单字朝代类去拼 author（那会写出 宋-宋-王慶升）
    const { title, author } = splitTitleAndAttribution(m[3]);
    return {
      collection: '正统道藏',
      category: m[1],
      subcategory: m[2] || '',
      title,
      author,
    };
  }

  m = name.match(/^續[续]道藏-(.+)$/);
  if (m) {
    const { title, author } = splitTitleAndAttribution(m[1]);
    return {
      collection: '续道藏',
      category: '续道藏',
      subcategory: '',
      title,
      author,
    };
  }

  return { title: name, collection: '其他', category: '其他', subcategory: '' };
}

function fileId(filename: string): string {
  return crypto.createHash('sha256').update(filename, 'utf-8').digest('hex').slice(0, 16);
}

function buildIndex() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.txt'));
  const entries: DaozangEntry[] = [];
  const categories = new Map<string, string[]>();
  const publicDir = path.resolve(__dirname, '../public/data');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  
  const contentDir = path.join(publicDir, 'content');
  
  if (!fs.existsSync(contentDir)) fs.mkdirSync(contentDir, { recursive: true });
  
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).length;
    const preview = content.slice(0, 300).replace(/\r?\n/g, ' ').trim();
    const id = fileId(file);
    
    const parsed = parseFilename(file);
    
    const entry: DaozangEntry = {
      id,
      title: parsed.title || file,
      collection: parsed.collection || '其他',
      category: parsed.category || '其他',
      subcategory: parsed.subcategory || '',
      author: parsed.author,
      filename: file,
      size: stat.size,
      lineCount: lines,
      preview,
    };
    
    entries.push(entry);
    
    // Write individual content file
    const contentJson = JSON.stringify({ content });
    fs.writeFileSync(path.join(contentDir, `${id}.json`), contentJson, 'utf-8');
    
    const key = entry.category;
    if (!categories.has(key)) categories.set(key, []);
    if (entry.subcategory && !categories.get(key)!.includes(entry.subcategory)) {
      categories.get(key)!.push(entry.subcategory);
    }
  }
  
  entries.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  
  const categoryTree = Array.from(categories.entries()).map(([cat, subs]) => ({
    name: cat,
    count: entries.filter(e => e.category === cat).length,
    subcategories: subs.sort((a, b) => a.localeCompare(b, 'zh-CN')),
  })).sort((a, b) => {
    const order = ['洞真部', '洞玄部', '洞神部', '太平部', '太清部', '太玄部', '正一部', '续道藏', '其他'];
    return order.indexOf(a.name) - order.indexOf(b.name);
  });
  
  const index = {
    version: 2,
    buildTime: new Date().toISOString(),
    totalEntries: entries.length,
    categories: categoryTree,
    entries,
  };
  
  fs.writeFileSync(path.join(publicDir, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  
  const indexSize = fs.statSync(path.join(publicDir, 'index.json')).size;
  console.log(`Built index: ${entries.length} entries, ${categoryTree.length} categories`);
  console.log(`index.json: ${(indexSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`content/: ${files.length} individual JSON files`);
}

buildIndex();
