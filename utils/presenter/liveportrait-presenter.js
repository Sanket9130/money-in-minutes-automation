'use strict';

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class LivePortraitPresenter {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.python = options.python || process.env.LIVEPORTRAIT_PYTHON || 'python3';
    this.runner = options.runner || path.join(__dirname, '../../python/liveportrait_runner.py');
    this.enabled = options.enabled !== false;
  }

  async isAvailable() {
    if (!this.enabled) return false;
    try {
      await fs.access(this.runner);
      return true;
    } catch {
      return false;
    }
  }

  async render(options = {}) {
    if (!(await this.isAvailable())) {
      return {
        available: false,
        used: false,
        fallback: true,
        reason: 'liveportrait_runner_unavailable'
      };
    }

    if (!options.sourceImage || !options.drivingVideo || !options.outputPath) {
      throw new Error('LivePortrait requires sourceImage, drivingVideo and outputPath');
    }

    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });

    const args = [
      this.runner,
      '--source', options.sourceImage,
      '--driving', options.drivingVideo,
      '--output', options.outputPath
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(this.python, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', data => { stderr += data.toString(); });
      child.stdout.on('data', data => {
        this.logger.info?.(`[LivePortrait] ${data.toString().trim()}`);
      });

      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`LivePortrait failed with exit code ${code}: ${stderr.trim()}`));
      });
    });

    await fs.access(options.outputPath);

    return {
      available: true,
      used: true,
      fallback: false,
      provider: 'liveportrait',
      path: options.outputPath
    };
  }
}

module.exports = { LivePortraitPresenter };
