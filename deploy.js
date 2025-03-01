import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GitHub repository information
const REPO_URL = 'https://github.com/IagoFel98/webRTCpi.git';
const GITHUB_USERNAME = 'IagoFel98';
const REPO_NAME = 'webRTCpi';

// Function to create a temporary directory for deployment
function createTempDir() {
  const tempDir = path.join(__dirname, 'temp_deploy');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir);
  return tempDir;
}

// Function to copy project files to the temporary directory
function copyProjectFiles(tempDir) {
  const filesToCopy = [
    'package.json',
    'package-lock.json',
    'README.md',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'postcss.config.js',
    'tailwind.config.js',
    'eslint.config.js',
    '.gitignore'
  ];

  // Copy individual files
  filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(tempDir, file));
    }
  });

  // Copy directories
  const dirsToCopy = ['src', 'server', 'public', 'raspberry-pi'];
  dirsToCopy.forEach(dir => {
    if (fs.existsSync(dir)) {
      copyDirRecursive(dir, path.join(tempDir, dir));
    }
  });
}

// Function to recursively copy a directory
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Function to create a default .gitignore file if it doesn't exist
function createGitIgnore(tempDir) {
  const gitignorePath = path.join(tempDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`;
    fs.writeFileSync(gitignorePath, gitignoreContent);
  }
}

// Main function to deploy the project
async function deployToGitHub() {
  console.log('Starting deployment to GitHub...');
  
  // Create temporary directory
  const tempDir = createTempDir();
  console.log('Created temporary directory for deployment');
  
  // Copy project files
  copyProjectFiles(tempDir);
  console.log('Copied project files to temporary directory');
  
  // Create .gitignore if needed
  createGitIgnore(tempDir);
  
  // Initialize Git repository and push to GitHub
  try {
    process.chdir(tempDir);
    
    // Initialize Git repository
    execSync('git init');
    execSync('git add .');
    execSync('git commit -m "Initial commit"');
    
    // Add remote and push
    execSync(`git remote add origin ${REPO_URL}`);
    execSync('git push -u origin master --force');
    
    console.log('Successfully deployed to GitHub!');
    console.log(`Repository URL: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}`);
  } catch (error) {
    console.error('Error deploying to GitHub:', error.message);
  } finally {
    // Clean up
    process.chdir(__dirname);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Run the deployment
deployToGitHub();