'use strict';

const fs = require('fs').promises;
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');
const { ShortsCanvasCompositor, SHORTS_SAFE_ZONE } = require('./shorts-canvas-compositor');

/**
 * Shorts Karaoke Captions
 *
 * Generates dynamic, word-level highlighted karaoke subtitles specifically styled
 * and positioned for YouTube Shorts native 9:16 (1080x1920) vertical videos.
 */
class ShortsKaraokeCaptions {
  /**
   * Generates word-level timestamps for a text script.
   * Uses provider-supplied timings if provided, or calculates natural-speech
   * weighted durations matching the total audio duration.
   *
   * @param {string} text - Spoken narration text
   * @param {number} totalDuration - Total audio duration in seconds
   * @param {object} options - Options including optional provider word timings
   * @returns {Array<{ word: string, start: number, end: number, cleanWord: string }>}
   */
  /**
   * Helper to parse any numeric or MM:SS formatted duration string into seconds
   */
  static parseDurationSeconds(duration) {
    if (typeof duration === 'number') return isNaN(duration) ? 0 : duration;
    if (typeof duration !== 'string') return 0;
    const str = duration.trim();
    if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  /**
   * Generates word-level timestamps for a text script.
   * Uses provider-supplied timings if provided, or calculates natural-speech
   * weighted durations matching the total audio duration.
   *
   * @param {string} text - Spoken narration text
   * @param {number|string} totalDuration - Total audio duration in seconds (or MM:SS)
   * @param {object} options - Options including optional provider word timings
   * @returns {Array<{ word: string, start: number, end: number, cleanWord: string }>}
   */
  static buildWordTimings(text = '', totalDuration = 0, options = {}) {
    const parsedDuration = this.parseDurationSeconds(totalDuration);
    const duration = Math.max(0.1, parsedDuration || 0);

    // If provider supplied explicit word timings (e.g. from ElevenLabs or Azure), validate and use them
    if (Array.isArray(options.providerTimings) && options.providerTimings.length > 0) {
      return options.providerTimings.map(item => ({
        word: String(item.word || ''),
        cleanWord: String(item.word || '').replace(/[^\w\s'-]/g, '').trim(),
        start: Math.max(0, Number(item.start || item.startTime || 0)),
        end: Math.min(duration, Math.max(0, Number(item.end || item.endTime || 0)))
      }));
    }

    if (options.alignment) {
      const converted = this.convertElevenLabsAlignment(options.alignment);
      if (converted.length > 0) {
        return converted;
      }
    }

    // Split text into words while preserving punctuation
    const rawTokens = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (rawTokens.length === 0) {
      return [];
    }

    // Weight each word by character length + natural punctuation pauses
    const weights = rawTokens.map(token => {
      let weight = Math.max(1, token.length);
      if (/[!?.]$/.test(token)) {
        weight += 6; // Sentence-ending pause (~0.35-0.45s)
      } else if (/[,;:-]$/.test(token)) {
        weight += 3; // Clause-separating pause (~0.2s)
      }
      return weight;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const timePerWeight = duration / totalWeight;

    const timings = [];
    let currentCursor = 0;

    for (let i = 0; i < rawTokens.length; i++) {
      const wordDuration = weights[i] * timePerWeight;
      const start = currentCursor;
      const end = i === rawTokens.length - 1 ? duration : Math.min(duration, currentCursor + wordDuration);

      timings.push({
        word: rawTokens[i],
        cleanWord: rawTokens[i].replace(/[^\w\s'-]/g, '').trim(),
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3))
      });

      currentCursor = end;
    }

    return timings;
  }

  /**
   * Groups word-level timings into small mobile-readable phrases (2-4 words).
   * Breaks early on sentence punctuation so ideas don't overlap awkwardly.
   *
   * @param {Array} wordTimings
   * @param {object} options
   * @returns {Array<{ text: string, start: number, end: number, words: Array }>}
   */
  static chunkIntoPhrases(wordTimings = [], options = {}) {
    if (!Array.isArray(wordTimings) || wordTimings.length === 0) {
      return [];
    }

    const maxWords = Math.min(5, Math.max(2, Number(options.maxWordsPerPhrase || 3)));
    const phrases = [];
    let currentWords = [];

    for (let i = 0; i < wordTimings.length; i++) {
      const item = wordTimings[i];
      currentWords.push(item);

      const hasEndPunctuation = /[!?.]$/.test(item.word);
      const isAtLimit = currentWords.length >= maxWords;
      const isLast = i === wordTimings.length - 1;

      if (hasEndPunctuation || isAtLimit || isLast) {
        const start = currentWords[0].start;
        const end = currentWords[currentWords.length - 1].end;
        phrases.push({
          text: currentWords.map(w => w.word).join(' '),
          start,
          end,
          words: currentWords
        });
        currentWords = [];
      }
    }

    return phrases;
  }

  /**
   * Formats seconds into ASS timestamp format: H:MM:SS.cc (centiseconds)
   */
  static formatASSTime(seconds = 0) {
    const totalSec = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const secs = Math.floor(totalSec % 60);
    const centis = Math.floor((totalSec % 1) * 100);

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }

  /**
   * Formats seconds into SRT timestamp format: HH:MM:SS,mmm
   */
  static formatSRTTime(seconds = 0) {
    const totalSec = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const secs = Math.floor(totalSec % 60);
    const millis = Math.floor((totalSec % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * Generates ASS (Advanced SubStation Alpha) content with active word karaoke highlighting.
   * Positioned strictly within the YouTube Shorts safe zone (bottom-center, above bottom overlays).
   *
   * @param {Array} phrases - Chunked phrases containing words with timestamps
   * @param {object} options - Configuration options
   * @returns {string} - Full ASS subtitle file content
   */
  static generateASS(phrases = [], options = {}) {
    const canvas = ShortsCanvasCompositor.resolveCanvas(options);
    const isShorts = canvas.aspectRatio === '9:16';

    const width = canvas.width;
    const height = canvas.height;

    // Shorts Safe Zone margins:
    // Bottom overlay in YouTube Shorts covers ~480px.
    // MarginV = 520 places captions safely at y ~ 1350px (clearly visible, below center, above UI).
    const marginV = isShorts
      ? (options.marginV || (SHORTS_SAFE_ZONE.bottom + 40)) // 520px
      : (options.marginV || 100);
    const marginL = isShorts ? SHORTS_SAFE_ZONE.left : 80;
    const marginR = isShorts ? SHORTS_SAFE_ZONE.right : 80;

    // Typography
    const fontSize = isShorts ? (options.fontSize || 56) : (options.fontSize || 42);
    const fontName = options.fontName || 'Arial';

    // Colours in ASS format (&HAABBGGRR):
    // Inactive word colour: White (&H00FFFFFF)
    // Active highlight colour: Electric Yellow / Gold (&H0000FFFF)
    const inactiveColor = options.inactiveColor || '&H00FFFFFF';
    const highlightColor = options.highlightColor || '&H0000FFFF';
    const outlineColor = options.outlineColor || '&H00000000';
    const backColor = options.backColor || '&H80000000';

    const header = `[Script Info]
Title: Shorts Dynamic Karaoke Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KaraokeShorts,${fontName},${fontSize},${inactiveColor},${highlightColor},${outlineColor},${backColor},-1,0,0,0,100,100,0,0,1,6,2,2,${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = [];

    for (const phrase of phrases) {
      const words = phrase.words || [];
      if (words.length === 0) continue;

      // For each word in the phrase, create a timed event where that specific word is highlighted
      for (let wIndex = 0; wIndex < words.length; wIndex++) {
        const activeWord = words[wIndex];
        const wStart = this.formatASSTime(activeWord.start);
        const wEnd = this.formatASSTime(activeWord.end);

        // Reconstruct phrase text with the active word styled in highlight color
        const lineParts = words.map((w, idx) => {
          const safeWord = this.sanitizeASSWord(w.word);
          if (idx === wIndex) {
            // Highlight active word in vibrant color with subtle bold pop
            return `{\\c${highlightColor}\\b1}${safeWord}{\\rKaraokeShorts}`;
          }
          return `{\\c${inactiveColor}}${safeWord}`;
        });

        const lineText = lineParts.join(' ');
        events.push(`Dialogue: 0,${wStart},${wEnd},KaraokeShorts,,0,0,0,,${lineText}`);
      }
    }

    return header + events.join('\n') + '\n';
  }

  /**
   * Generates standard SRT subtitle format from phrases.
   */
  static generateSRT(phrases = []) {
    let srt = '';
    let index = 1;

    for (const phrase of phrases) {
      if (!phrase.text) continue;
      const start = this.formatSRTTime(phrase.start);
      const end = this.formatSRTTime(phrase.end);

      srt += `${index}\n`;
      srt += `${start} --> ${end}\n`;
      srt += `${phrase.text}\n\n`;
      index++;
    }

    return srt;
  }

  /**
   * Converts ElevenLabs character-level alignment data into word-level timestamps.
   */
  static convertElevenLabsAlignment(alignment) {
    if (!alignment || !Array.isArray(alignment.characters)) return [];
    const words = [];
    let current = '';
    let start = null;
    let end = null;
    const chars = alignment.characters;
    const startTimes = alignment.character_start_times_seconds || [];
    const endTimes = alignment.character_end_times_seconds || [];

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const s = startTimes[i] ?? 0;
      const e = endTimes[i] ?? s;

      if (/\s/.test(char)) {
        if (current) {
          words.push({
            word: current,
            cleanWord: current.replace(/[^\w\s'-]/g, '').trim(),
            start: Number(start.toFixed(3)),
            end: Number(end.toFixed(3))
          });
          current = '';
          start = null;
          end = null;
        }
      } else {
        if (start === null) start = s;
        end = e;
        current += char;
      }
    }

    if (current && start !== null) {
      words.push({
        word: current,
        cleanWord: current.replace(/[^\w\s'-]/g, '').trim(),
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3))
      });
    }

    return words;
  }

  /**
   * Extracts clean spoken text from a script object across sections.
   * Prioritizes direct narration strings if present as source of truth.
   */
  static extractTextFromScript(script = {}) {
    if (typeof script === 'string') {
      return script.trim();
    }
    if (typeof script.narrationText === 'string' && script.narrationText.trim()) {
      return script.narrationText.trim();
    }
    if (typeof script.narration === 'string' && script.narration.trim()) {
      return script.narration.trim();
    }
    if (typeof script.fullNarration === 'string' && script.fullNarration.trim()) {
      return script.fullNarration.trim();
    }
    if (typeof script.spokenText === 'string' && script.spokenText.trim()) {
      return script.spokenText.trim();
    }

    const parts = [];

    if (script.hook?.text) {
      parts.push(script.hook.text);
    } else if (typeof script.title === 'string' && script.title.trim()) {
      parts.push(script.title.trim());
    }

    if (script.introduction) {
      if (script.introduction.greeting) parts.push(script.introduction.greeting);
      if (script.introduction.topicIntro) parts.push(script.introduction.topicIntro);
      if (script.introduction.valueProposition) parts.push(script.introduction.valueProposition);
    }

    if (script.mainContent && Array.isArray(script.mainContent.sections)) {
      script.mainContent.sections.forEach(section => {
        if (typeof section.content === 'string' && section.content.trim()) {
          parts.push(section.content.trim());
        } else if (Array.isArray(section.items)) {
          section.items.forEach(item => {
            const itemText = typeof item === 'string' ? item : `${item.title || ''} ${item.description || ''}`.trim();
            if (itemText) parts.push(itemText);
          });
        } else if (Array.isArray(section.steps)) {
          section.steps.forEach(step => {
            const stepText = typeof step === 'string' ? step : `${step.title || ''} ${step.description || ''}`.trim();
            if (stepText) parts.push(stepText);
          });
        }
      });
    }

    if (script.conclusion?.finalThought) {
      parts.push(script.conclusion.finalThought);
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Sanitizes a word for ASS format to prevent control character corruption.
   */
  static sanitizeASSWord(word = '') {
    return String(word || '')
      .replace(/\\/g, '/')
      .replace(/\{/g, '(')
      .replace(/\}/g, ')');
  }

  /**
   * Burns an ASS subtitle file directly onto a video using FFmpeg.
   * Correctly escapes Windows paths for the subtitles filter.
   */
  static async burnKaraokeCaptions(videoPath, assPath, outputPath) {
    const absoluteAss = path.resolve(assPath).split(path.sep).join('/').replace(':', '\\:');
    const escapedAss = absoluteAss.replaceAll("'", "\\'");

    await runFFmpeg([
      '-y',
      '-i', videoPath,
      '-vf', `subtitles='${escapedAss}'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'copy',
      outputPath
    ]);

    return outputPath;
  }

  /**
   * Verifies that caption words strictly equal the narration text words with 0 hallucinations or omissions.
   *
   * @param {string} narrationText
   * @param {Array<{word: string, start: number, end: number}>} wordTimings
   * @returns {{ valid: boolean, errors: string[], wordCount: number }}
   */
  static verifyNarrationMatchesCaptions(narrationText = '', wordTimings = []) {
    const rawTokens = String(narrationText || '').trim().split(/\s+/).filter(Boolean);
    const errors = [];

    if (rawTokens.length !== wordTimings.length) {
      errors.push(`Word count mismatch: narration has ${rawTokens.length} words, captions have ${wordTimings.length} words`);
    }

    const checkCount = Math.min(rawTokens.length, wordTimings.length);
    for (let i = 0; i < checkCount; i++) {
      const token = rawTokens[i];
      const captionWord = wordTimings[i].word;
      if (token !== captionWord) {
        errors.push(`Word mismatch at index ${i}: expected "${token}", found "${captionWord}"`);
      }
    }

    // Monotonic timing check
    let lastEnd = 0;
    for (let i = 0; i < wordTimings.length; i++) {
      const wt = wordTimings[i];
      if (wt.start < lastEnd - 0.05) {
        errors.push(`Timing non-monotonic at word ${i} ("${wt.word}"): start ${wt.start} < prev end ${lastEnd}`);
      }
      if (wt.end <= wt.start) {
        errors.push(`Zero/negative duration at word ${i} ("${wt.word}"): start ${wt.start}, end ${wt.end}`);
      }
      lastEnd = wt.end;
    }

    return {
      valid: errors.length === 0,
      errors,
      wordCount: rawTokens.length
    };
  }

  /**
   * Complete pipeline: given narration audio and script/text, produces
   * both .ass and .srt caption files and optionally burns them onto the video.
   */
  static async processCaptions({ script, text, audioDuration, outputDir, baseName = 'captions', options = {} }) {
    await fs.mkdir(outputDir, { recursive: true });

    const spokenText = text || this.extractTextFromScript(script);
    const wordTimings = this.buildWordTimings(spokenText, audioDuration, options);
    const phrases = this.chunkIntoPhrases(wordTimings, options);

    const verification = this.verifyNarrationMatchesCaptions(spokenText, wordTimings);
    if (!verification.valid && options.strictVerification) {
      throw new Error(`Caption verification failed: ${verification.errors.join('; ')}`);
    }

    const assContent = this.generateASS(phrases, options);
    const srtContent = this.generateSRT(phrases);

    const assPath = path.join(outputDir, `${baseName}.ass`);
    const srtPath = path.join(outputDir, `${baseName}.srt`);

    await fs.writeFile(assPath, assContent, 'utf8');
    await fs.writeFile(srtPath, srtContent, 'utf8');

    return {
      assPath,
      srtPath,
      wordTimings,
      phrases,
      wordCount: wordTimings.length,
      phraseCount: phrases.length,
      verification
    };
  }
}

module.exports = {
  ShortsKaraokeCaptions
};
