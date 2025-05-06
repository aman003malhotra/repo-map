/**
 * Repository fetcher module
 * Handles cloning/downloading repositories from Git or accessing local directories
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import simpleGit, { SimpleGit } from 'simple-git';
import axios from 'axios';
import * as tar from 'tar';
import { RepoInfo } from 'src/types/index.js';

/**
 * Main function to fetch a repository
 * @param repoUrl URL or local path of the repository
 * @param outputDir Directory to store the repository
 * @param branch Optional branch to checkout
 * @returns Repository information
 */
export async function fetchRepository(
  repoUrl: string,
  outputDir: string,
  branch?: string
): Promise<RepoInfo> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if repoUrl is a local path or a Git URL
  if (fs.existsSync(repoUrl) && fs.lstatSync(repoUrl).isDirectory()) {
    return setupLocalRepository(repoUrl, outputDir);
  } else if (repoUrl.endsWith('.git') || repoUrl.includes('github.com') || repoUrl.includes('gitlab.com')) {
    return cloneRepository(repoUrl, outputDir, branch);
  } else {
    throw new Error(`Invalid repository URL or path: ${repoUrl}`);
  }
}

/**
 * Clone a Git repository
 * @param repoUrl Git repository URL
 * @param outputDir Directory to clone the repository to
 * @param branch Optional branch to checkout
 * @returns Repository information
 */
async function cloneRepository(
  repoUrl: string,
  outputDir: string,
  branch?: string
): Promise<RepoInfo> {
  console.log(`Cloning repository: ${repoUrl}`);
  
  // Generate a unique directory name based on the repo URL
  const repoHash = crypto.createHash('md5').update(repoUrl).digest('hex').substring(0, 8);
  const repoName = path.basename(repoUrl, '.git');
  const localPath = path.join(outputDir, `${repoName}-${repoHash}`);
  
  // Check if directory already exists
  if (fs.existsSync(localPath)) {
    console.log(`Repository directory already exists: ${localPath}`);
    console.log('Pulling latest changes...');
    
    const git: SimpleGit = simpleGit.default(localPath);
    await git.pull();
    
    if (branch) {
      console.log(`Checking out branch: ${branch}`);
      await git.checkout(branch);
    }
    
    const commitSha = await git.revparse(['HEAD']);
    
    const currentBranch = branch || await git.revparse(['--abbrev-ref', 'HEAD']);
    return {
      repoId: repoUrl,
      localPath,
      remoteUrl: repoUrl,
      branch: currentBranch,
      isGit: true,
      commitSha,
    };
  }
  
  // Clone the repository
  const git: SimpleGit = simpleGit.default();
  const cloneOptions = ['--depth', '1'];
  
  if (branch) {
    cloneOptions.push('--branch', branch);
  }
  
  await git.clone(repoUrl, localPath, cloneOptions);
  
  // Get the commit SHA
  const repoGit: SimpleGit = simpleGit.default(localPath);
  const commitSha = await repoGit.revparse(['HEAD']);
  const currentBranch = await repoGit.revparse(['--abbrev-ref', 'HEAD']);
  const resolvedBranch = branch || currentBranch || 'main';
  return {
    repoId: repoUrl,
    localPath,
    remoteUrl: repoUrl,
    branch: resolvedBranch,
    isGit: true,
    commitSha,
  };
}

/**
 * Download a repository as a tarball (for GitHub repositories)
 * @param repoUrl GitHub repository URL
 * @param outputDir Directory to download the repository to
 * @param branch Optional branch to download
 * @returns Repository information
 */
async function downloadRepository(
  repoUrl: string,
  outputDir: string,
  branch?: string
): Promise<RepoInfo> {
  // Extract owner and repo name from GitHub URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }
  
  const [, owner, repo] = match;
  const branchName = branch || 'main';
  
  // Generate a unique directory name
  const repoHash = crypto.createHash('md5').update(repoUrl).digest('hex').substring(0, 8);
  const localPath = path.join(outputDir, `${repo}-${repoHash}`);
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true });
  }
  
  // Download the tarball
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${branchName}`;
  console.log(`Downloading repository from: ${tarballUrl}`);
  
  const tempFile = path.join(os.tmpdir(), `${repo}-${repoHash}.tar.gz`);
  
  const response = await axios({
    method: 'get',
    url: tarballUrl,
    responseType: 'stream',
  });
  
  const writer = fs.createWriteStream(tempFile);
  
  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  
  // Extract the tarball
  console.log(`Extracting tarball to: ${localPath}`);
  await tar.extract({
    file: tempFile,
    cwd: localPath,
    strip: 1, // Remove the top-level directory
  });
  
  // Clean up the temporary file
  fs.unlinkSync(tempFile);
  
  return {
    repoId: repoUrl,
    localPath,
    remoteUrl: repoUrl,
    branch: branchName,
    isGit: false,
    commitSha: undefined,
  };
}

/**
 * Set up a local repository
 * @param repoPath Local repository path
 * @param outputDir Directory to copy the repository to
 * @returns Repository information
 */
async function setupLocalRepository(
  repoPath: string,
  outputDir: string
): Promise<RepoInfo> {
  console.log(`Setting up local repository: ${repoPath}`);
  
  // Check if the path is a Git repository
  const isGit = fs.existsSync(path.join(repoPath, '.git'));
  let commitSha: string | undefined;
  let branch: string | undefined;
  
  if (isGit) {
    const git: SimpleGit = simpleGit.default(repoPath);
    commitSha = await git.revparse(['HEAD']);
    branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  }
  
  // Ensure branch is always a string
  const resolvedBranch = branch || 'main';
  
  // Use the original path as the local path
  // We don't copy local repositories to avoid duplication
  return {
    repoId: repoPath,
    localPath: repoPath,
    remoteUrl: `file://${repoPath}`,
    branch: resolvedBranch,
    isGit,
    commitSha: isGit ? commitSha : undefined,
  };
}

/**
 * Check if a repository is up to date
 * @param repoInfo Repository information
 * @returns True if the repository is up to date, false otherwise
 */
export async function isRepoUpToDate(repoInfo: RepoInfo): Promise<boolean> {
  if (!repoInfo.isGit || !repoInfo.commitSha) {
    // Local non-Git repositories are always considered up to date
    return true;
  }
  
  const git: SimpleGit = simpleGit.default(repoInfo.localPath);
  
  // Fetch the latest changes
  await git.fetch();
  
  // Get the latest commit SHA
  const latestCommitSha = await git.revparse(['origin/' + (repoInfo.branch || 'HEAD')]);
  
  // Compare with the current commit SHA
  return repoInfo.commitSha === latestCommitSha;
}
