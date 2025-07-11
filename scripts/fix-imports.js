import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixImports(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      content = content.replace(/from ['"]@\/([^'"]+)['"]/g, (match, importPath) => {
        const relativePath = path.relative(path.dirname(filePath), path.join('dist', importPath));
        return `from '${relativePath.replace(/\\/g, '/')}.js'`;
      });
      
      content = content.replace(/from ['"]\.\/([^'"]+)['"]/g, (match, importPath) => {
        if (importPath.endsWith('.js')) {
          return match;
        }
        
        const importDir = path.join(path.dirname(filePath), importPath);
        const indexPath = path.join(importDir, 'index.js');
        if (fs.existsSync(indexPath)) {
          return `from './${importPath}/index.js'`;
        }
        return `from './${importPath}.js'`;
      });
      
      content = content.replace(/from ['"]\.\.\/([^'"]+)['"]/g, (match, importPath) => {
        if (importPath.endsWith('.js')) {
          const importDir = path.join(path.dirname(filePath), '..', importPath.replace('.js', ''));
          const indexPath = path.join(importDir, 'index.js');
          if (fs.existsSync(indexPath)) {
            return `from '../${importPath.replace('.js', '')}/index.js'`;
          }
          return match;
        }
        
        const importDir = path.join(path.dirname(filePath), '..', importPath);
        const indexPath = path.join(importDir, 'index.js');
        if (fs.existsSync(indexPath)) {
          return `from '../${importPath}/index.js'`;
        }
        return `from '../${importPath}.js'`;
      });
      
      fs.writeFileSync(filePath, content);
    }
  }
}

fixImports(path.join(__dirname, '../dist')); 